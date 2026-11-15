import { randomBytes } from "node:crypto";
import process from "node:process";
import { sql } from "drizzle-orm";
import { Client, Pool } from "pg";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database, drizzleOf } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";
import { ensureWorkspace } from "../db/queries/workspaces.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "../db/testing.js";
import { createLogger, errorForLog } from "../logger.js";
import { SQL_PLUGIN_DIR } from "../testing/plugins.js";
import { readPluginPackage } from "./discovery.js";
import type { PluginHost } from "./host.js";
import { PluginSqlService } from "./sql.js";
import { runPluginUpgrades } from "./upgrades.js";

// The schemas of the console closed to PUBLIC where the console's database user is no superuser
// (ADR-0133). One that owns its database closes them itself, and its own work goes on; one that
// does not is refused `storage:sql` in words that say what the database's owner runs, and has
// nothing made until the owner ran it. Roles are the cluster's: every one here is named for this
// run, so that the files and the checkouts that run beside it do not meet it.

const adminUrl = process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL;
const run = randomBytes(4).toString("hex");
const owner = `console_test_${run}_owner`;
const user = `console_test_${run}_user`;
const reader = `console_test_${run}_reader`;
/** A user that owns its database and may not make roles. */
const plain = `console_test_${run}_plain`;
const ownedName = `console_test_${run}_owned`;
const plainName = `console_test_${run}_plaindb`;
const heldName = `console_test_${run}_held`;
const password = randomBytes(18).toString("base64url");
const silent = pino({ level: "warn" }, { write: () => {} });

let admin: Client;
let shared: TestDatabase;
const opened: Database[] = [];
const services: PluginSqlService[] = [];

/** The address of a database, signed in as a role of this run. */
function urlOf(base: string, database: string | undefined, role: string): string {
  const url = new URL(base);
  if (database !== undefined) {
    url.pathname = `/${database}`;
  }
  url.username = role;
  url.password = password;
  return url.href;
}

function serviceOf(
  connectionString: string,
  lines?: Record<string, unknown>[],
): { database: Database; service: PluginSqlService } {
  const database = createDatabase({ connectionString, maxConnections: 2 });
  const service = new PluginSqlService({
    database,
    connectionString,
    ca: undefined,
    logger:
      lines === undefined
        ? silent
        : pino(
            { level: "warn" },
            {
              write: (line: string) => void lines.push(JSON.parse(line) as Record<string, unknown>),
            },
          ),
  });
  opened.push(database);
  services.push(service);
  return { database, service };
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  for (const role of [owner, user]) {
    await admin.query(`create role "${role}" with login createrole password '${password}'`);
  }
  for (const role of [reader, plain]) {
    await admin.query(`create role "${role}" with login password '${password}'`);
  }
  await admin.query(`create database "${ownedName}" owner "${owner}"`);
  await admin.query(`create database "${plainName}" owner "${plain}"`);
  await admin.query(`create database "${heldName}" owner "${owner}"`);
  // A role of a plugin's name the console's user did not make, and may not change.
  await admin.query(`create role "plugin_held${run}" with nologin`);
  shared = await createTestDatabase(adminUrl);
});

afterAll(async () => {
  for (const service of services) {
    await service.stop();
  }
  for (const database of opened) {
    await database.close();
  }
  await shared?.drop();
  if (admin !== undefined) {
    for (const name of [ownedName, plainName, heldName]) {
      await admin.query(`drop database if exists "${name}" with (force)`);
    }
    for (const role of [
      `plugin_own${run}`,
      `plugin_refused${run}`,
      `plugin_held${run}`,
      `plugin_unmade${run}`,
      reader,
      plain,
      user,
      owner,
    ]) {
      await admin.query(`drop role if exists "${role}"`);
    }
    await admin.end();
  }
});

describe("where the console's database user owns its database", () => {
  it("closes the console's schemas to PUBLIC itself, says so, and its own work goes on", async () => {
    const url = urlOf(adminUrl, ownedName, owner);
    await migrateDatabase(url);
    const lines: Record<string, unknown>[] = [];
    const { database, service } = serviceOf(url, lines);
    const db = drizzleOf(database);
    expect(await service.available()).toBe(true);
    // A role an operator made for reading: the tables were granted to it, and the schema it used
    // through PUBLIC.
    await db.execute(sql.raw(`grant select on all tables in schema public to "${reader}"`));
    const reading = new Client({ connectionString: urlOf(adminUrl, ownedName, reader) });
    await reading.connect();
    const key = `own${run}`;
    try {
      expect((await reading.query("select count(*)::int as n from public.tasks")).rows).toEqual([
        { n: 0 },
      ]);
      await service.provision(key);
      expect(
        lines
          .filter((line) => typeof line.msg === "string" && line.msg.startsWith("PUBLIC may no"))
          .map((line) => line.schemas),
      ).toEqual([["public"]]);
      await expect(service.query(key, "select 1 from public.tasks", [])).rejects.toMatchObject({
        code: "plugin.invalid_args",
        message: expect.stringContaining("permission denied for schema public"),
      });
      // The console's own work: its rows written and read, and a table made as a migration makes one.
      const workspace = await ensureWorkspace(database, { name: "Acme", now: new Date() });
      expect(workspace.name).toBe("Acme");
      await db.execute(sql`create table public.later (id int)`);
      await db.execute(sql`drop table public.later`);
      // The reader lost what it had through PUBLIC, and has it again granted by name.
      await expect(reading.query("select count(*) from public.tasks")).rejects.toThrow(
        "permission denied for schema public",
      );
      await db.execute(sql.raw(`grant usage on schema public to "${reader}"`));
      expect((await reading.query("select count(*)::int as n from public.tasks")).rows).toEqual([
        { n: 0 },
      ]);
      // Every boot provisions again, with a password drawn anew, and finds nothing more to close.
      await service.provision(key);
      expect((await service.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
      expect(lines.filter((line) => line.msg !== undefined)).toHaveLength(1);
    } finally {
      await reading.end();
      await service.purge(key);
    }
  });
});

describe("where the console's database user does not own the schema public", () => {
  it("is refused storage:sql in words that say what the owner runs, with nothing made until it ran", async () => {
    // As an operator may set a console up: the database is another's, and the console's user is
    // given what its migrations make and read, using the schema itself through PUBLIC.
    const operator = drizzleOf(shared.database);
    const databaseName = new URL(shared.connectionString).pathname.slice(1);
    await operator.execute(sql.raw(`grant create on database "${databaseName}" to "${user}"`));
    await operator.execute(sql.raw(`grant create on schema public to "${user}"`));
    await operator.execute(sql.raw(`grant select on all tables in schema public to "${user}"`));
    const { database, service } = serviceOf(urlOf(shared.connectionString, undefined, user));
    const key = `refused${run}`;
    const made = async () =>
      (
        await operator.execute<{ schemas: number; roles: number }>(sql`
          select (select count(*)::int from pg_namespace where nspname = ${`plugin_${key}`}) as schemas,
                 (select count(*)::int from pg_roles where rolname = ${`plugin_${key}`}) as roles`)
      ).rows[0];
    const statement = `GRANT USAGE, CREATE ON SCHEMA "public" TO "${user}"; REVOKE ALL ON SCHEMA "public" FROM PUBLIC;`;
    // The revoke the console's user may make is only warned of, and takes nothing: never a pass.
    await expect(service.provision(key)).rejects.toMatchObject({
      code: "plugin.unavailable",
      message: expect.stringContaining(`The database's owner runs, once: ${statement}`),
    });
    expect(await made()).toEqual({ schemas: 0, roles: 0 });
    const usage = await operator.execute<{ everyone: boolean }>(sql`
      select exists (select 1 from aclexplode(n.nspacl) a where a.grantee = 0) as everyone
      from pg_namespace n where n.nspname = 'public'`);
    expect(usage.rows).toEqual([{ everyone: true }]);
    // The owner runs what it was told, as it was written.
    await operator.execute(sql.raw(statement));
    await service.provision(key);
    await expect(service.query(key, "select 1 from public.tasks", [])).rejects.toMatchObject({
      code: "plugin.invalid_args",
      message: expect.stringContaining("permission denied for schema public"),
    });
    // The console's user kept what it had through PUBLIC: it reads its tables and makes new ones.
    const own = drizzleOf(database);
    expect((await own.execute(sql`select count(*)::int as n from public.tasks`)).rows).toEqual([
      { n: 0 },
    ]);
    await own.execute(sql`create table public.later (id int)`);
    await own.execute(sql`drop table public.later`);
    // A right given to the plugin's role by name, which the console's user may not take back, is
    // refused too, and the plugin's statements wait for the owner.
    await operator.execute(sql.raw(`grant usage on schema public to "plugin_${key}"`));
    const revoke = `REVOKE ALL ON SCHEMA "public" FROM "plugin_${key}";`;
    await expect(service.provision(key)).rejects.toMatchObject({
      code: "plugin.unavailable",
      message: expect.stringContaining(`The database's owner runs, once: ${revoke}`),
    });
    await expect(service.query(key, "select 1", [])).rejects.toMatchObject({
      code: "plugin.unavailable",
    });
    await operator.execute(sql.raw(revoke));
    await service.provision(key);
    expect((await service.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
    await service.purge(key);
    expect(await made()).toEqual({ schemas: 0, roles: 0 });
  });
});

describe("where the database refuses the statement that gives a plugin's role its password", () => {
  const NOW = new Date("2026-11-16T09:00:00.000Z");

  /**
   * The migrate role's provisioning of an enabled plugin with `storage:sql`, as the console's user
   * at `url`, then a boot's: what was logged through the console's own logger, what was recorded
   * as the plugin's problem, what the boot was refused with, and the passwords the statements that
   * failed carried, as they were sent.
   */
  async function provisionRefused(url: string, key: string) {
    await migrateDatabase(url);
    const lines: string[] = [];
    const logger = createLogger({
      level: "debug",
      role: "migrate",
      destination: { write: (line: string) => void lines.push(line) },
    });
    const database = createDatabase({ connectionString: url, maxConnections: 2 });
    opened.push(database);
    const service = new PluginSqlService({
      database,
      connectionString: url,
      ca: undefined,
      logger,
    });
    services.push(service);
    const workspace = await ensureWorkspace(database, { name: "Acme", now: NOW });
    await drizzleOf(database).execute(sql`
      insert into plugin_installs (workspace_id, key, package_name, version, data_version, state, consent, created_at, updated_at)
      values (${workspace.id}, ${key}, 'console-plugin-tally', '0.1.0', 1, 'enabled',
              '["storage:sql"]'::jsonb, ${NOW.toISOString()}, ${NOW.toISOString()})`);
    const read = await readPluginPackage("console-plugin-tally", SQL_PLUGIN_DIR);
    if (!("manifest" in read)) {
      throw new Error("the fixture is not there");
    }
    const sent = vi.spyOn(Pool.prototype, "query");
    let refused: unknown;
    let calls: unknown[][] = [];
    try {
      const outcome = await runPluginUpgrades({
        database,
        workspace,
        // Never reached: the plugin's schema fails before anything of its code runs.
        host: undefined as unknown as PluginHost,
        discovery: { plugins: [{ ...read, key }], failed: [] },
        memoryMb: 64,
        clock: { now: () => NOW },
        logger,
        sql: service,
      });
      expect(outcome.failed).toEqual([key]);
      // A boot logs what it was refused with, and keeps its message as the plugin's problem.
      refused = await service.provision(key).then(
        () => undefined,
        (error: unknown) => error,
      );
      logger.error({ err: refused, plugin: key }, "the plugin's schema could not be provisioned");
    } finally {
      calls = sent.mock.calls.map((call) => [...(call as unknown[])]);
      sent.mockRestore();
    }
    const drawn = calls.flatMap(([query]) => {
      const text =
        typeof query === "string" ? query : (query as { text?: unknown } | undefined)?.text;
      const found = typeof text === "string" ? / password '([^']*)'/.exec(text)?.[1] : undefined;
      return found === undefined ? [] : [found];
    });
    const recorded = await drizzleOf(database).execute<{ data: unknown }>(
      sql`select data from events where kind = 'plugin.failed'`,
    );
    return {
      lines,
      recorded: recorded.rows.map((row) => JSON.stringify(row.data)),
      refused,
      drawn,
    };
  }

  /** That no password drawn is in anything said of the failure, and that the failure is said. */
  function expectSaidWithoutPassword(
    said: Awaited<ReturnType<typeof provisionRefused>>,
    role: string,
    words: string,
  ) {
    // Two passwords were drawn, one a pass, and were sent in the statements that failed.
    expect(said.drawn).toHaveLength(2);
    for (const drawn of said.drawn) {
      expect(drawn).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
    expect(said.refused).toMatchObject({
      code: "plugin.unavailable",
      message: expect.stringContaining(`"${role}"`),
    });
    const message = (said.refused as Error).message;
    expect(message).toContain("42501");
    expect(message).toContain(words);
    expect(message).not.toContain(" password '");
    expect(said.recorded).toHaveLength(1);
    expect(said.recorded[0]).toContain(words);
    const everything = [
      ...said.lines,
      ...said.recorded,
      message,
      JSON.stringify(errorForLog(said.refused)),
    ];
    expect(said.lines.filter((line) => line.includes(words))).toHaveLength(2);
    for (const drawn of said.drawn) {
      for (const text of everything) {
        expect(text).not.toContain(drawn);
      }
    }
  }

  it("says what failed without the password where the console's user may not make the role", async () => {
    const said = await provisionRefused(urlOf(adminUrl, plainName, plain), `unmade${run}`);
    expectSaidWithoutPassword(said, `plugin_unmade${run}`, "permission denied to create role");
  });

  it("says what failed without the password where the role is there and not the console's user's to change", async () => {
    const said = await provisionRefused(urlOf(adminUrl, heldName, owner), `held${run}`);
    expectSaidWithoutPassword(said, `plugin_held${run}`, "permission denied to alter role");
  });
});
