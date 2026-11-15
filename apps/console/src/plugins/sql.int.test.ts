import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { sql } from "drizzle-orm";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOf } from "../db/client.js";
import { settledEnd } from "../db/queries/event-order.js";
import { recordEvent } from "../db/queries/events.js";
import { ensureWorkspace } from "../db/queries/workspaces.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "../db/testing.js";
import { PluginSqlService, sqlNameOf } from "./sql.js";

// A plugin's schema and role against a real database (docs/specs/plugins.md, "SQL"): made with
// rights on its own schema alone, its migrations applied as the role, its statements bounded, its
// transactions its own, and nothing left after purge. The development database's user is a
// superuser, which may make roles. The role is the cluster's, not the database's: this file's plugin
// is named apart from the fixtures', so that the test files that run beside it do not meet it.

let testDatabase: TestDatabase;
let service: PluginSqlService;
let migrations: string;

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  service = new PluginSqlService({
    database: testDatabase.database,
    connectionString: testDatabase.connectionString,
    ca: undefined,
    logger: pino({ level: "warn" }, { write: () => {} }),
  });
  migrations = await mkdtemp(join(tmpdir(), "console-plugin-migrations-"));
  await writeFile(
    join(migrations, "0001-init.sql"),
    "create table things (id serial primary key, name text not null);\n",
  );
  await writeFile(join(migrations, "0002-more.sql"), "alter table things add column note text;\n");
  await writeFile(join(migrations, "notes.txt"), "not a migration\n");
});

afterAll(async () => {
  await service?.stop();
  await testDatabase?.drop();
  if (migrations !== undefined) {
    await rm(migrations, { recursive: true, force: true });
  }
});

describe("a plugin's schema", () => {
  it("is available where the console's user may make roles", async () => {
    expect(await service.available()).toBe(true);
    expect(sqlNameOf("leave-days")).toBe("plugin_leave_days");
  });

  it("is made with a role that reaches its own schema and nothing of the console's", async () => {
    await service.provision("tallytest");
    expect(await service.applyMigrations("tallytest", migrations)).toBe(2);
    expect(await service.applyMigrations("tallytest", migrations)).toBe(0);
    const inserted = await service.query(
      "tallytest",
      "insert into things (name) values ($1) returning id, name",
      ["one"],
    );
    expect(inserted.rows).toEqual([{ id: 1, name: "one" }]);
    expect(inserted.rowCount).toBe(1);
    await expect(
      service.query("tallytest", "select id from public.workspaces limit 1", []),
    ).rejects.toMatchObject({
      code: "plugin.invalid_args",
      message: expect.stringContaining("permission denied"),
    });
    await expect(
      service.query("tallytest", "create table public.mine (id int)", []),
    ).rejects.toMatchObject({ code: "plugin.invalid_args" });
    const setting = await service.query("tallytest", "show statement_timeout", []);
    expect(setting.rows[0]).toEqual({ statement_timeout: "10s" });
    const path = await service.query("tallytest", "show search_path", []);
    expect(path.rows[0]).toEqual({ search_path: "plugin_tallytest" });
  });

  it("holds up no event and no reader of the feed with a lock it may take (ADR-0125)", async () => {
    const workspace = await ensureWorkspace(testDatabase.database, {
      name: "Acme",
      now: new Date(),
    });
    const happen = () =>
      drizzleOf(testDatabase.database).transaction((tx) =>
        recordEvent(tx, {
          workspaceId: workspace.id,
          kind: "workspace.updated",
          actor: undefined,
          data: { fields: ["name"] },
          now: new Date(),
        }),
      );
    const before = await happen();
    // Any role may take an advisory lock, a plugin's among them. The feeds' order was held by
    // two of them once, under these keys: a plugin that took them alone stopped every write of
    // the board, and one that took them shared kept every feed from settling.
    const tx = await service.begin("tallytest");
    try {
      for (const key of [1, 2]) {
        const taken = await service.query(
          "tallytest",
          "select pg_try_advisory_lock(1702261875, $1) as taken",
          [key],
          tx,
        );
        expect(taken.rows).toEqual([{ taken: true }]);
      }
      const began = performance.now();
      const written = await happen();
      expect(written).toBeGreaterThan(before);
      expect(performance.now() - began).toBeLessThan(2000);
      expect(await settledEnd(testDatabase.database, "console")).toBe(written);
    } finally {
      await service.query("tallytest", "select pg_advisory_unlock_all()", [], tx);
      await service.rollback(tx);
    }
  }, 20_000);

  it("is refused the lock of a feed's order, whichever way it asks for it, and holds up nobody asking (ADR-0125)", async () => {
    // The order is held by locks on two tables in a schema of their own, and by a function that
    // asks for them alone: the role may not so much as name any of the three. A role that may
    // name a table may lock it without a right on it: a statement prepared over it holds the
    // lock its reading would take until the transaction ends, and some statements queue for the
    // table alone before they are refused. Each way is tried while a writer of the feed is under
    // way, so that one that queued for the table would wait.
    const workspace = await ensureWorkspace(testDatabase.database, {
      name: "Acme",
      now: new Date(),
    });
    let numbered: () => void = () => {};
    let commit: () => void = () => {};
    const wasNumbered = new Promise<void>((resolve) => {
      numbered = resolve;
    });
    const mayCommit = new Promise<void>((resolve) => {
      commit = resolve;
    });
    const writer = drizzleOf(testDatabase.database).transaction(async (writing) => {
      await recordEvent(writing, {
        workspaceId: workspace.id,
        kind: "workspace.updated",
        actor: undefined,
        data: { fields: ["name"] },
        now: new Date(),
      });
      numbered();
      await mayCommit;
    });
    try {
      await wasNumbered;
      for (const statement of [
        "lock table feed_order.events in row share mode",
        "lock table feed_order.events in exclusive mode nowait",
        "lock table feed_order.plugin_events in access share mode",
        "select 1 from feed_order.plugin_events for share",
        "prepare held as select 1 from feed_order.events for share",
        "comment on table feed_order.events is 'mine'",
        "create table part partition of feed_order.events for values in (true)",
        "create table kid () inherits (feed_order.plugin_events)",
        "analyze feed_order.events",
        "select feed_order.writers_ended('console')",
      ]) {
        const tx = await service.begin("tallytest");
        const began = performance.now();
        try {
          await expect(
            service.query("tallytest", statement, [], tx),
            statement,
          ).rejects.toMatchObject({
            code: "plugin.invalid_args",
            message: expect.stringContaining("permission denied for schema feed_order"),
          });
          expect(performance.now() - began, statement).toBeLessThan(1000);
        } finally {
          await service.rollback(tx);
        }
      }
    } finally {
      commit();
      await writer;
    }
    // The schema and the tables are the console's own, and nobody was given anything on them;
    // neither may anyone but their owner call the function.
    const owned = await drizzleOf(testDatabase.database).execute<{
      table: string;
      ours: boolean;
      others: number;
      theirs: boolean;
    }>(sql`
      select c.relname as "table",
             pg_get_userbyid(c.relowner) = current_user
               and pg_get_userbyid(n.nspowner) = current_user as ours,
             ((select count(*) from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                 where a.grantee <> c.relowner)
              + (select count(*) from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
                 where a.grantee <> n.nspowner))::int as others,
             has_schema_privilege('plugin_tallytest', n.oid, 'usage')
               or has_table_privilege('plugin_tallytest', c.oid, 'select, insert, update, delete, truncate, references, trigger, maintain') as theirs
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'feed_order' and c.relkind = 'r'
      order by c.relname`);
    expect(owned.rows).toEqual([
      { table: "events", ours: true, others: 0, theirs: false },
      { table: "plugin_events", ours: true, others: 0, theirs: false },
    ]);
    const callable = await drizzleOf(testDatabase.database).execute<{ theirs: boolean }>(
      sql`select has_function_privilege('plugin_tallytest', 'feed_order.writers_ended(text)', 'execute') as theirs`,
    );
    expect(callable.rows).toEqual([{ theirs: false }]);
  });

  it("bounds a result, and refuses a statement that is not one", async () => {
    await expect(
      service.query("tallytest", "select generate_series(1, 20000) as n", []),
    ).rejects.toMatchObject({ code: "plugin.too_many" });
    await expect(service.query("tallytest", "select from nowhere", [])).rejects.toMatchObject({
      code: "plugin.invalid_args",
    });
    await expect(service.query("tallytest", "", [])).rejects.toMatchObject({
      code: "plugin.invalid_args",
    });
    await expect(service.query("tallytest", "select pg_sleep(11)", [])).rejects.toMatchObject({
      code: "plugin.timeout",
    });
  }, 20_000);

  it("runs a transaction as a unit, committed or rolled back", async () => {
    const tx = await service.begin("tallytest");
    await service.query("tallytest", "insert into things (name) values ($1)", ["two"], tx);
    await service.query("tallytest", "insert into things (name) values ($1)", ["three"], tx);
    await service.commit(tx);
    const undone = await service.begin("tallytest");
    await service.query("tallytest", "insert into things (name) values ($1)", ["four"], undone);
    await service.rollback(undone);
    await expect(service.query("tallytest", "select 1", [], undone)).rejects.toMatchObject({
      code: "plugin.not_found",
    });
    const counted = await service.query("tallytest", "select count(*)::int as n from things", []);
    expect(counted.rows).toEqual([{ n: 3 }]);
  });

  it("draws a new password when provisioned again, and the old connections give way", async () => {
    // A power the role was given meanwhile is taken again.
    await drizzleOf(testDatabase.database).execute(sql`alter role plugin_tallytest createdb`);
    await service.provision("tallytest");
    const powers = await drizzleOf(testDatabase.database).execute<{ createdb: boolean }>(
      sql`select rolcreatedb as createdb from pg_roles where rolname = 'plugin_tallytest'`,
    );
    expect(powers.rows).toEqual([{ createdb: false }]);
    const counted = await service.query("tallytest", "select count(*)::int as n from things", []);
    expect(counted.rows).toEqual([{ n: 3 }]);
    expect(await service.applyMigrations("tallytest", migrations)).toBe(0);
  });

  it("refuses a plugin that was not provisioned in this process", async () => {
    await expect(service.query("ghost", "select 1", [])).rejects.toMatchObject({
      code: "plugin.unavailable",
    });
  });

  it("purges the schema and the role, leaving nothing", async () => {
    await service.purge("tallytest");
    const { drizzleOf } = await import("../db/client.js");
    const { sql } = await import("drizzle-orm");
    const db = drizzleOf(testDatabase.database);
    const schemas = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_namespace where nspname = 'plugin_tallytest'`,
    );
    expect(schemas.rows[0]?.n).toBe(0);
    const roles = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_roles where rolname = 'plugin_tallytest'`,
    );
    expect(roles.rows[0]?.n).toBe(0);
    await expect(service.query("tallytest", "select 1", [])).rejects.toMatchObject({
      code: "plugin.unavailable",
    });
  });
});
