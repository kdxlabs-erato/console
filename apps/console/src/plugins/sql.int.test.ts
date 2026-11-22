import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOf } from "../db/client.js";
import { settledEnd } from "../db/queries/event-order.js";
import { recordEvent } from "../db/queries/events.js";
import { ensureWorkspace } from "../db/queries/workspaces.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "../db/testing.js";
import { CONSOLE_SCHEMAS, PluginSqlService, sqlNameOf } from "./sql.js";

// A plugin's schema and role against a real database (docs/specs/plugins.md, "SQL"): made with
// rights on its own schema alone, its migrations applied as the role, its statements bounded, its
// transactions its own, and nothing left after purge. The development database's user is a
// superuser, which may make roles. The role is the cluster's, not the database's: this file's plugin
// is named apart from the fixtures', so that the test files that run beside it do not meet it.

let testDatabase: TestDatabase;
let service: PluginSqlService;
let migrations: string;
const logged: Record<string, unknown>[] = [];

/** The schemas the service said it closed to PUBLIC, since the last look. */
function closedSaid(): unknown[] {
  const said = logged
    .filter((line) => typeof line.msg === "string" && line.msg.startsWith("PUBLIC may no longer"))
    .map((line) => line.schemas);
  logged.length = 0;
  return said;
}

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  service = new PluginSqlService({
    database: testDatabase.database,
    connectionString: testDatabase.connectionString,
    ca: undefined,
    logger: pino(
      { level: "warn" },
      { write: (line: string) => void logged.push(JSON.parse(line) as Record<string, unknown>) },
    ),
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
    // A new database lets every role use `public`: provisioning took that from PUBLIC, and said so.
    expect(closedSaid()).toEqual([["public"]]);
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

  it("uses no schema of the console's or of another plugin's, and is refused a table there before any lock (ADR-0133)", async () => {
    const db = drizzleOf(testDatabase.database);
    // What a keeper of the database opened to every role is closed again when a plugin is next
    // provisioned: the console's schemas, and another plugin's.
    await db.execute(sql`create schema plugin_elsewhere`);
    await db.execute(sql`create table plugin_elsewhere.kept (id int)`);
    await db.execute(sql`grant usage on schema public, transcript, plugin_elsewhere to public`);
    await service.provision("tallytest");
    expect(closedSaid()).toEqual([["plugin_elsewhere", "public", "transcript"]]);
    const schemas = await db.execute<{ schema: string; everyone: boolean; plugin: boolean }>(sql`
      select n.nspname as schema,
             exists (select 1 from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
                     where a.grantee = 0) as everyone,
             has_schema_privilege('plugin_tallytest', n.oid, 'USAGE, CREATE') as plugin
      from pg_namespace n
      where not starts_with(n.nspname, 'pg_temp_') and not starts_with(n.nspname, 'pg_toast_temp_')
      order by n.nspname`);
    expect(schemas.rows).toEqual([
      { schema: "drizzle", everyone: false, plugin: false },
      { schema: "feed_order", everyone: false, plugin: false },
      { schema: "information_schema", everyone: true, plugin: true },
      { schema: "pg_catalog", everyone: true, plugin: true },
      { schema: "pg_toast", everyone: false, plugin: false },
      { schema: "plugin_elsewhere", everyone: false, plugin: false },
      { schema: "plugin_tallytest", everyone: false, plugin: true },
      { schema: "public", everyone: false, plugin: false },
      { schema: "transcript", everyone: false, plugin: false },
    ]);
    // Every schema the migrations make is one the service closes: a new one is added there.
    expect(
      schemas.rows
        .map((row) => row.schema)
        .filter(
          (name) =>
            !name.startsWith("pg_") && !name.startsWith("plugin_") && name !== "information_schema",
        ),
    ).toEqual([...CONSOLE_SCHEMAS].sort());

    const toast = await db.execute<{ name: string }>(
      sql`select reltoastrelid::regclass::text as name from pg_class where oid = 'public.tasks'::regclass`,
    );
    // Each way of naming a table there is tried while the console holds the tables as a migration
    // would: a way that reached for a lock on one would wait for it until its statement's time.
    const blocker = new Client({ connectionString: testDatabase.connectionString });
    await blocker.connect();
    try {
      await blocker.query("begin");
      await blocker.query(
        "lock table public.tasks, transcript.events, drizzle.__drizzle_migrations, feed_order.events, plugin_elsewhere.kept in access exclusive mode",
      );
      const named: readonly (readonly [string, string])[] = [
        ["select 1 from public.tasks", "public"],
        ["select 1 from public.tasks for update", "public"],
        ["prepare held as select 1 from public.tasks for share", "public"],
        ["lock table public.tasks in access share mode", "public"],
        ["create table part partition of public.tasks for values in (1)", "public"],
        ["create table copied (like public.tasks)", "public"],
        ["create table kid () inherits (public.tasks)", "public"],
        ["alter table things inherit public.tasks", "public"],
        ["create table pointing (task uuid references public.tasks (id))", "public"],
        ["create view seen as select * from public.tasks", "public"],
        ["create materialized view kept as select * from public.tasks with no data", "public"],
        [
          "create function counted() returns bigint language sql begin atomic select count(*) from public.tasks; end",
          "public",
        ],
        [
          "create trigger watching before update on public.tasks for each row execute function suppress_redundant_updates_trigger()",
          "public",
        ],
        ["create rule never as on insert to public.tasks do instead nothing", "public"],
        ["create statistics together on title, body from public.tasks", "public"],
        ["create index on public.tasks (title)", "public"],
        ["alter table public.tasks add column mine int", "public"],
        ["comment on table public.tasks is 'mine'", "public"],
        ["analyze public.tasks", "public"],
        ["explain select 1 from public.tasks", "public"],
        ["grant select on public.tasks to public", "public"],
        ["select 'public.tasks'::regclass", "public"],
        ["select pg_relation_size('public.tasks')", "public"],
        ["select null::public.tasks", "public"],
        ["select 1 from transcript.events", "transcript"],
        [
          "create table part partition of transcript.events for values in ('2000-01')",
          "transcript",
        ],
        ["select 1 from drizzle.__drizzle_migrations", "drizzle"],
        ["select 1 from feed_order.events", "feed_order"],
        ["select 1 from plugin_elsewhere.kept", "plugin_elsewhere"],
        [`select 1 from ${toast.rows[0]?.name ?? "pg_toast.none"}`, "pg_toast"],
      ];
      const refusedAtOnce = async (statement: string, schema: string, tx?: string) => {
        const began = performance.now();
        await expect(
          service.query("tallytest", statement, [], tx),
          statement,
        ).rejects.toMatchObject({
          code: "plugin.invalid_args",
          message: expect.stringContaining(`permission denied for schema ${schema}`),
        });
        expect(performance.now() - began, statement).toBeLessThan(1000);
      };
      for (const [statement, schema] of named) {
        const tx = await service.begin("tallytest");
        try {
          await refusedAtOnce(statement, schema, tx);
        } finally {
          await service.rollback("tallytest", tx);
        }
      }
      // A function of the plugin's own that names the table is refused when it runs.
      const tx = await service.begin("tallytest");
      try {
        await service.query(
          "tallytest",
          "create function peeked() returns bigint language plpgsql as $$ begin return (select count(*) from public.tasks); end $$",
          [],
          tx,
        );
        await refusedAtOnce("select peeked()", "public", tx);
      } finally {
        await service.rollback("tallytest", tx);
      }
      // A vacuum runs outside a transaction.
      await refusedAtOnce("vacuum public.tasks", "public");
    } finally {
      await blocker.query("rollback");
      await blocker.end();
    }
  }, 60_000);

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
      await service.rollback("tallytest", tx);
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
          await service.rollback("tallytest", tx);
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

  it("gives a connection back to the pool as a new one: nothing a statement set or took for its session outlasts it", async () => {
    const console_ = drizzleOf(testDatabase.database);
    const free = async (key: number): Promise<boolean> => {
      const got = await console_.execute<{ got: boolean }>(
        sql`select pg_try_advisory_xact_lock(${key}) as got`,
      );
      return got.rows[0]?.got === true;
    };
    // A lock taken for the session is let go with the statement's connection: the pool hands
    // that very connection to the next call, and without the reset the lock stayed for as long
    // as the plugin kept asking, a migration's lock or another plugin's among them.
    await service.query("tallytest", "select pg_advisory_lock(424242)", []);
    expect(await free(424242)).toBe(true);
    // A timeout the role set to nothing is the role's own again at the next call.
    await service.query("tallytest", "set statement_timeout = 0", []);
    const timeout = await service.query("tallytest", "show statement_timeout", []);
    expect(timeout.rows).toEqual([{ statement_timeout: "10s" }]);
    // So is a transaction's connection, once the transaction ended.
    const tx = await service.begin("tallytest");
    await service.query("tallytest", "select pg_advisory_lock(424243)", [], tx);
    await service.query("tallytest", "set statement_timeout = 0", [], tx);
    await service.commit("tallytest", tx);
    expect(await free(424243)).toBe(true);
    expect((await service.query("tallytest", "show statement_timeout", [])).rows).toEqual([
      { statement_timeout: "10s" },
    ]);
    // A statement that opened a transaction and left it open has a connection that cannot be
    // reset: it is ended, and no session of the role stands inside a transaction afterwards.
    await service.query("tallytest", "begin", []);
    const inside = async (): Promise<number> => {
      const seen = await console_.execute<{ n: number }>(
        sql`select count(*)::int as n from pg_stat_activity where usename = 'plugin_tallytest' and state like 'idle in transaction%'`,
      );
      return seen.rows[0]?.n ?? -1;
    };
    await expect.poll(inside, { timeout: 5_000 }).toBe(0);
    // The pool goes on with a connection of its own making.
    expect((await service.query("tallytest", "select 1 as one", [])).rows).toEqual([{ one: 1 }]);
  }, 20_000);

  it("takes one statement at a time, and runs none of a text that holds several", async () => {
    const before = await service.query("tallytest", "select count(*)::int as n from things", []);
    // With no parameters such a text once ran whole, a `begin` in it too, and answered nothing
    // a caller could read. The server now takes it for no statement at all.
    await expect(
      service.query("tallytest", "insert into things (name) values ('stray'); select 1", []),
    ).rejects.toMatchObject({ code: "plugin.invalid_args" });
    await expect(
      service.query("tallytest", "begin; select pg_advisory_xact_lock(424244)", []),
    ).rejects.toMatchObject({ code: "plugin.invalid_args" });
    const after = await service.query("tallytest", "select count(*)::int as n from things", []);
    expect(after.rows).toEqual(before.rows);
    // In a transaction of the plugin's too.
    const tx = await service.begin("tallytest");
    await expect(service.query("tallytest", "select 1; select 2", [], tx)).rejects.toMatchObject({
      code: "plugin.invalid_args",
    });
    await service.rollback("tallytest", tx);
  });

  it("runs a transaction as a unit, committed or rolled back", async () => {
    const tx = await service.begin("tallytest");
    await service.query("tallytest", "insert into things (name) values ($1)", ["two"], tx);
    await service.query("tallytest", "insert into things (name) values ($1)", ["three"], tx);
    await service.commit("tallytest", tx);
    const undone = await service.begin("tallytest");
    await service.query("tallytest", "insert into things (name) values ($1)", ["four"], undone);
    await service.rollback("tallytest", undone);
    await expect(service.query("tallytest", "select 1", [], undone)).rejects.toMatchObject({
      code: "plugin.not_found",
    });
    const counted = await service.query("tallytest", "select count(*)::int as n from things", []);
    expect(counted.rows).toEqual([{ n: 3 }]);
  });

  it("is brought to what it must be when provisioned again, and what is open goes on", async () => {
    const db = drizzleOf(testDatabase.database);
    // A power the role was given meanwhile is taken again.
    await db.execute(sql`alter role plugin_tallytest createdb`);
    // A transaction of the plugin's is open while the console provisions again, as another
    // process of the deployment does at its start: the role keeps its password, so nothing that
    // is open has to give way, and nothing signs in in vain afterwards (ADR-0148).
    const tx = await service.begin("tallytest");
    await service.query("tallytest", "insert into things (name) values ($1)", ["five"], tx);
    await service.provision("tallytest");
    const powers = await db.execute<{ createdb: boolean }>(
      sql`select rolcreatedb as createdb from pg_roles where rolname = 'plugin_tallytest'`,
    );
    expect(powers.rows).toEqual([{ createdb: false }]);
    await service.query("tallytest", "insert into things (name) values ($1)", ["six"], tx);
    await service.rollback("tallytest", tx);
    // The role was given what the server keeps of its password, never the password, so the
    // statement a server may log holds no credential. A session made anew signs in with the
    // password itself, which proves the two belong together wherever the server asks for a
    // password, as the tests' own does: had the server taken what it was given for a password
    // and kept its own of that, the password itself would sign nobody in.
    await db.execute(
      sql`select pg_terminate_backend(pid, 5000) from pg_stat_activity where usename = 'plugin_tallytest'`,
    );
    await expect
      .poll(
        () =>
          service.query("tallytest", "select count(*)::int as n from things", []).then(
            (counted) => counted.rows,
            () => undefined,
          ),
        { timeout: 5_000 },
      )
      .toEqual([{ n: 3 }]);
    expect(await service.applyMigrations("tallytest", migrations)).toBe(0);
    // What the console's user holds of the role: what the role holds, so that it may end the
    // role's sessions and drop what the role owns, and never the right to become it. The role
    // is a member of nothing.
    const held = await db.execute<{ inherits: boolean; becomes: boolean; member: number }>(sql`
      select bool_or(m.inherit_option) as inherits, bool_or(m.set_option) as becomes,
             (select count(*)::int from pg_auth_members o
               where o.member = (select oid from pg_roles where rolname = 'plugin_tallytest')) as member
      from pg_auth_members m
      where m.roleid = (select oid from pg_roles where rolname = 'plugin_tallytest')
        and m.member = (select oid from pg_roles where rolname = current_user)`);
    expect(held.rows).toEqual([{ inherits: true, becomes: false, member: 0 }]);
  });

  it("refuses a plugin nobody provisioned, and makes nothing on a statement's way", async () => {
    await expect(service.query("ghost", "select 1", [])).rejects.toMatchObject({
      code: "plugin.unavailable",
    });
    await expect(service.begin("ghost")).rejects.toMatchObject({ code: "plugin.unavailable" });
    const made = await drizzleOf(testDatabase.database).execute<{ n: number }>(
      sql`select count(*)::int as n from pg_roles where rolname = 'plugin_ghost'`,
    );
    expect(made.rows).toEqual([{ n: 0 }]);
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
