import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database, drizzleOf } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";
import { DEV_DATABASE_URL } from "../db/testing.js";
import { PluginSqlService } from "./sql.js";

// A plugin's role between the processes of one deployment (ADR-0148): the `api`, the `worker` and
// the `migrate` role each make a service of their own over one database, and each provisions the
// plugins it finds enabled. The role has one password whichever of them provisioned it last; a
// process that provisioned nothing uses what another made; purge ends what another process still
// holds; and a transaction past its minute is ended with the statement it runs. The console's
// user here is no superuser, as a managed database's is not: it may make roles and owns its
// database. Roles are the cluster's, so every name is this run's own.

const adminUrl = process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL;
const run = randomBytes(4).toString("hex");
const owner = `console_test_${run}_procs`;
const databaseName = `console_test_${run}_procsdb`;
const password = randomBytes(18).toString("base64url");
const silent = pino({ level: "silent" });

let admin: Client;
let url: string;
let console_: Database;
const opened: Database[] = [];
const services: PluginSqlService[] = [];
const keys: string[] = [];

/** A key of this run's own, whose role is dropped at the end whatever the test left. */
function keyOf(name: string): string {
  const key = `${name}${run}`;
  keys.push(key);
  return key;
}

/** One process of the deployment: a pool of the console's own and a service over it. */
function processOf(
  options: { transactionMs?: number; migrationMs?: number } = {},
): PluginSqlService {
  const database = createDatabase({ connectionString: url, maxConnections: 2 });
  const service = new PluginSqlService({
    database,
    connectionString: url,
    ca: undefined,
    logger: silent,
    ...options,
  });
  opened.push(database);
  services.push(service);
  return service;
}

/** The sessions of a plugin's role the server holds. */
async function sessionsOf(key: string): Promise<number> {
  const seen = await drizzleOf(console_).execute<{ n: number }>(
    sql`select count(*)::int as n from pg_stat_activity where usename = ${`plugin_${key}`}`,
  );
  return seen.rows[0]?.n ?? -1;
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create role "${owner}" with login createrole password '${password}'`);
  await admin.query(`create database "${databaseName}" owner "${owner}"`);
  const address = new URL(adminUrl);
  address.pathname = `/${databaseName}`;
  address.username = owner;
  address.password = password;
  url = address.href;
  await migrateDatabase(url);
  console_ = createDatabase({ connectionString: url, maxConnections: 2 });
  opened.push(console_);
});

afterAll(async () => {
  for (const service of services) {
    await service.stop();
  }
  for (const database of opened) {
    await database.close();
  }
  if (admin !== undefined) {
    await admin.query(`drop database if exists "${databaseName}" with (force)`);
    for (const key of keys) {
      await admin.query(`drop role if exists "plugin_${key}"`);
    }
    await admin.query(`drop role if exists "${owner}"`);
    await admin.end();
  }
});

describe("a plugin's role between the processes of one deployment", () => {
  it("has one password, whichever process provisioned it last", async () => {
    const key = keyOf("one");
    const api = processOf();
    const worker = processOf();
    const migrate = processOf();
    await api.provision(key);
    // The worker starts beside the api and provisions what it finds enabled. The api's pool is
    // made at its first statement, after that: with a password of each process's own, the role
    // then answered the worker's alone, and the api was refused (`28P01`).
    await worker.provision(key);
    expect((await api.query(key, "select current_user::text as who", [])).rows).toEqual([
      { who: `plugin_${key}` },
    ]);
    // A rollout runs the migrate role while the processes of the version before still serve. The
    // api holds its one connection in a transaction, so its next statement signs in anew.
    const tx = await api.begin(key);
    try {
      await migrate.provision(key);
      expect((await api.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
      expect((await worker.query(key, "select 2 as n", [])).rows).toEqual([{ n: 2 }]);
      expect((await migrate.query(key, "select 3 as n", [])).rows).toEqual([{ n: 3 }]);
    } finally {
      await api.rollback(key, tx);
    }
  });

  it("is used by a process that provisioned nothing, once another process did", async () => {
    const key = keyOf("late");
    const worker = processOf();
    // Nobody made it yet: the worker makes nothing on a statement's way.
    await expect(worker.query(key, "select 1", [])).rejects.toMatchObject({
      code: "plugin.unavailable",
    });
    expect(await sessionsOf(key)).toBe(0);
    const made = await drizzleOf(console_).execute<{ n: number }>(
      sql`select count(*)::int as n from pg_roles where rolname = ${`plugin_${key}`}`,
    );
    expect(made.rows).toEqual([{ n: 0 }]);
    // An administrator enables the plugin: the api provisions it. The worker, started before
    // that, runs the plugin's jobs from then on, and their statements with them.
    const api = processOf();
    await api.provision(key);
    expect((await worker.query(key, "select current_user::text as who", [])).rows).toEqual([
      { who: `plugin_${key}` },
    ]);
    const tx = await worker.begin(key);
    await worker.query(key, "create table kept (id int)", [], tx);
    await worker.commit(key, tx);
    expect((await api.query(key, "select count(*)::int as n from kept", [])).rows).toEqual([
      { n: 0 },
    ]);
  });

  it("is refused to a process that provisioned nothing while the role may use a schema of the console's", async () => {
    const key = keyOf("open");
    const api = processOf();
    await api.provision(key);
    // The database's owner gave the role a schema of the console's by name since.
    await drizzleOf(console_).execute(sql.raw(`grant usage on schema public to "plugin_${key}"`));
    const worker = processOf();
    await expect(worker.query(key, "select 1", [])).rejects.toMatchObject({
      code: "plugin.unavailable",
    });
    await expect(worker.begin(key)).rejects.toMatchObject({ code: "plugin.unavailable" });
    expect(await sessionsOf(key)).toBe(0);
    // Provisioning takes it back, and the process goes on.
    await api.provision(key);
    expect((await worker.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
  });

  it("is refused to a process that provisioned nothing while the role holds a power no plugin's role does", async () => {
    const key = keyOf("power");
    const api = processOf();
    await api.provision(key);
    // Given by whoever may, since: the console's own user here may not so much as name it.
    await admin.query(`alter role "plugin_${key}" createdb`);
    const worker = processOf();
    await expect(worker.query(key, "select 1", [])).rejects.toMatchObject({
      code: "plugin.unavailable",
    });
    expect(await sessionsOf(key)).toBe(0);
    await admin.query(`alter role "plugin_${key}" nocreatedb`);
    expect((await worker.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
  });

  it("says so where the role answers another password, and has its own again when provisioned", async () => {
    const key = keyOf("other");
    const api = processOf();
    await api.provision(key);
    // A role may change its own password, and a plugin written to do so shuts itself out: no
    // process arrives at the password it chose, the one that ran the statement neither.
    await api.query(
      key,
      `alter role current_user password '${randomBytes(9).toString("hex")}'`,
      [],
    );
    await admin.query(
      "select pg_terminate_backend(pid, 5000) from pg_stat_activity where usename = $1",
      [`plugin_${key}`],
    );
    await expect
      .poll(
        () =>
          api.query(key, "select 1", []).then(
            () => "signed in",
            (error: unknown) => (error as Error).message,
          ),
        { timeout: 5_000 },
      )
      .toContain("its password is not the one this process arrives at");
    await expect(api.begin(key)).rejects.toMatchObject({ code: "plugin.unavailable" });
    await api.provision(key);
    expect((await api.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
  });

  it("comes through where several processes provision it at one moment", async () => {
    const key = keyOf("many");
    const processes = Array.from({ length: 6 }, () => processOf());
    // A deployment starts its roles together, and each provisions the same plugins: two
    // statements that change one role, one schema or one grant at once are refused by the
    // database ("tuple concurrently updated"), and whoever was refused goes round again.
    const outcomes = await Promise.allSettled(processes.map((one) => one.provision(key)));
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toEqual([]);
    // The role has four connections, and a process keeps the one it signed in with a while.
    for (const [index, one] of processes.slice(0, 4).entries()) {
      expect((await one.query(key, "select $1::int as n", [index])).rows).toEqual([{ n: index }]);
    }
    // And again, the role being there now.
    const again = await Promise.allSettled(processes.map((one) => one.provision(key)));
    expect(again.filter((outcome) => outcome.status === "rejected")).toEqual([]);
    expect((await processes[0]?.query(key, "select 1 as n", []))?.rows).toEqual([{ n: 1 }]);
  }, 60_000);
});

describe("purging a plugin's schema", () => {
  it("leaves nothing of a role that made a large object and default privileges, and ends what another process holds", async () => {
    const key = keyOf("gone");
    const api = processOf();
    const worker = processOf();
    await api.provision(key);
    // What a role owns outside its schema: a large object, which any role may make, and the
    // privileges it set for what it makes later. Either kept the role from being dropped.
    const made = await api.query(key, "select lo_from_bytea(0, $1)::int as id", [
      Buffer.from("kept outside the schema"),
    ]);
    const id = made.rows[0]?.id;
    expect(typeof id).toBe("number");
    await api.query(key, "alter default privileges grant select on tables to public", []);
    await api.query(key, "create table things (id int)", []);
    // The worker holds a session of the role, inside a transaction of the plugin's.
    const tx = await worker.begin(key);
    await worker.query(key, "insert into things values (1)", [], tx);
    expect(await sessionsOf(key)).toBeGreaterThan(0);

    await api.purge(key);

    const left = await drizzleOf(console_).execute<{
      roles: number;
      schemas: number;
      objects: number;
    }>(sql`
      select (select count(*)::int from pg_roles where rolname = ${`plugin_${key}`}) as roles,
             (select count(*)::int from pg_namespace where nspname = ${`plugin_${key}`}) as schemas,
             (select count(*)::int from pg_largeobject_metadata where oid = ${id}::oid) as objects`);
    expect(left.rows).toEqual([{ roles: 0, schemas: 0, objects: 0 }]);
    expect(await sessionsOf(key)).toBe(0);
    // The worker's transaction went with its session, and the plugin is nobody's to use.
    await expect(worker.query(key, "select 1", [], tx)).rejects.toMatchObject({
      code: expect.stringMatching(/^plugin\./),
    });
    await worker.rollback(key, tx).catch(() => undefined);
    await expect(api.query(key, "select 1", [])).rejects.toMatchObject({
      code: "plugin.unavailable",
    });
    // Purged twice is purged.
    await api.purge(key);
    // And enabled again it is made anew, for every process.
    await api.provision(key);
    expect((await worker.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
    await api.purge(key);
  }, 30_000);
});

describe("a transaction of a plugin's", () => {
  it("answers the plugin that opened it, and is not found by any other name or plugin", async () => {
    const mine = keyOf("mine");
    const theirs = keyOf("theirs");
    const api = processOf();
    await api.provision(mine);
    await api.provision(theirs);
    await api.query(theirs, "create table kept (id int)", []);
    const tx = await api.begin(theirs);
    await api.query(theirs, "insert into kept values (1)", [], tx);
    // The name of a transaction comes from a plugin's own thread, which may send any: with
    // another plugin's, a statement ran as that plugin's role, in what that plugin had open.
    await expect(api.query(mine, "select current_user::text as who", [], tx)).rejects.toMatchObject(
      { code: "plugin.not_found" },
    );
    await expect(api.query(mine, "delete from kept", [], tx)).rejects.toMatchObject({
      code: "plugin.not_found",
    });
    await expect(api.commit(mine, tx)).rejects.toMatchObject({ code: "plugin.not_found" });
    await expect(api.rollback(mine, tx)).rejects.toMatchObject({ code: "plugin.not_found" });
    for (const name of [
      "",
      tx.toUpperCase(),
      `${tx} `,
      `${theirs}:0`,
      `${mine}:1`,
      "__proto__",
      "constructor",
      "x".repeat(100_000),
    ]) {
      await expect(
        api.query(theirs, "select 1", [], name),
        name.slice(0, 40),
      ).rejects.toMatchObject({ code: "plugin.not_found" });
      await expect(api.commit(theirs, name), name.slice(0, 40)).rejects.toMatchObject({
        code: "plugin.not_found",
      });
    }
    // It is as its plugin left it, and its plugin ends it.
    expect((await api.query(theirs, "select count(*)::int as n from kept", [], tx)).rows).toEqual([
      { n: 1 },
    ]);
    await api.commit(theirs, tx);
    expect((await api.query(theirs, "select count(*)::int as n from kept", [])).rows).toEqual([
      { n: 1 },
    ]);
  });
});

describe("a transaction of a plugin's past its time", () => {
  it("is ended with the statement it runs, whatever timeout the statement set itself", async () => {
    const key = keyOf("slow");
    const api = processOf({ transactionMs: 500 });
    await api.provision(key);
    const free = async (): Promise<boolean> => {
      const got = await drizzleOf(console_).execute<{ got: boolean }>(
        sql`select pg_try_advisory_xact_lock(515151) as got`,
      );
      return got.rows[0]?.got === true;
    };
    const tx = await api.begin(key);
    // A transaction may set its own timeout, to none: its statement then ran for as long as it
    // liked, and the rollback of the minute waited behind it with the lock it held.
    await api.query(key, "set local statement_timeout = 0", [], tx);
    await api.query(key, "select pg_advisory_xact_lock(515151)", [], tx);
    expect(await free()).toBe(false);
    const began = performance.now();
    await expect(api.query(key, "select pg_sleep(120)", [], tx)).rejects.toMatchObject({
      code: "plugin.timeout",
    });
    expect(performance.now() - began).toBeLessThan(10_000);
    await expect.poll(free, { timeout: 5_000 }).toBe(true);
    await expect.poll(() => sessionsOf(key), { timeout: 5_000 }).toBe(0);
    // The transaction is over for its plugin, and the role's pool goes on.
    await expect(api.query(key, "select 1", [], tx)).rejects.toMatchObject({
      code: "plugin.not_found",
    });
    await expect(api.commit(key, tx)).rejects.toMatchObject({ code: "plugin.not_found" });
    expect((await api.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
  }, 30_000);

  it("is rolled back where it runs nothing, and its connection kept", async () => {
    const key = keyOf("idle");
    const api = processOf({ transactionMs: 300 });
    await api.provision(key);
    await api.query(key, "create table things (id int)", []);
    const tx = await api.begin(key);
    await api.query(key, "insert into things values (1)", [], tx);
    const pid = await api.query(key, "select pg_backend_pid() as pid", [], tx);
    await expect
      .poll(
        () =>
          api.query(key, "select 1", [], tx).then(
            () => "open",
            () => "over",
          ),
        {
          timeout: 5_000,
        },
      )
      .toBe("over");
    expect((await api.query(key, "select count(*)::int as n from things", [])).rows).toEqual([
      { n: 0 },
    ]);
    // The same session serves the next statement: nothing had to be ended.
    expect((await api.query(key, "select pg_backend_pid() as pid", [])).rows).toEqual(pid.rows);
  }, 30_000);

  it("ends what is open when the process stops, a running statement with it", async () => {
    const key = keyOf("stop");
    const api = processOf();
    await api.provision(key);
    const tx = await api.begin(key);
    await api.query(key, "set local statement_timeout = 0", [], tx);
    const running = api.query(key, "select pg_sleep(120)", [], tx).then(
      () => "done",
      (error: unknown) => (error as { code?: string }).code,
    );
    await expect
      .poll(async () => {
        const seen = await drizzleOf(console_).execute<{ n: number }>(
          sql`select count(*)::int as n from pg_stat_activity where usename = ${`plugin_${key}`} and state = 'active'`,
        );
        return seen.rows[0]?.n;
      })
      .toBe(1);
    const began = performance.now();
    await api.stop();
    expect(performance.now() - began).toBeLessThan(10_000);
    expect(await running).toBe("plugin.unavailable");
    await expect.poll(() => sessionsOf(key), { timeout: 5_000 }).toBe(0);
  }, 30_000);
});

describe("the connections of a plugin's role across processes", () => {
  it("serves a second process once the first is done with its connections, though it used every one", async () => {
    const key = keyOf("share");
    const api = processOf();
    const worker = processOf();
    await api.provision(key);
    // The role may hold four sessions in the whole deployment, and one process may open as
    // many: four statements at once in the api take every one of them.
    await Promise.all(Array.from({ length: 4 }, () => api.query(key, "select pg_sleep(0.3)", [])));
    expect(await sessionsOf(key)).toBe(4);
    // The api is done with them. A statement of the worker's that comes now, a job's say, is
    // run: the sessions are not kept from another process by one that only holds them idle.
    const began = performance.now();
    expect((await worker.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
    expect(performance.now() - began).toBeLessThan(8_000);
  }, 30_000);

  it("says that every connection is taken where they stay taken, and serves again once one is free", async () => {
    const key = keyOf("taken");
    const api = processOf();
    const worker = processOf();
    await api.provision(key);
    // Four transactions the api holds open: every session of the role is at work.
    const held = await Promise.all(Array.from({ length: 4 }, () => api.begin(key)));
    const refused = await worker.query(key, "select 1 as n", []).then(
      () => undefined,
      (error: unknown) => error as { code?: string; message?: string },
    );
    expect(refused?.code).toBe("plugin.unavailable");
    expect(refused?.message).toContain("every connection of the plugin's role is taken");
    // Nothing of the database's own words for it, which name the role's limit to whoever asked.
    expect(refused?.message).not.toContain("too many connections");
    // One is let go: the worker's next statement finds it.
    await api.rollback(key, held[0] ?? "");
    expect((await worker.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
    for (const tx of held.slice(1)) {
      await api.rollback(key, tx);
    }
  }, 60_000);
});

describe("a migration of a plugin's", () => {
  it("is ended where it runs past the time a step of a plugin's life has, and lets the console's migration lock go", async () => {
    const key = keyOf("mig");
    const migrate = processOf({ migrationMs: 500 });
    await migrate.provision(key);
    const dir = await mkdtemp(join(tmpdir(), "console-migrations-"));
    try {
      // A migration is the plugin's own text: it may set itself any timeout, and ran for as
      // long as it liked under the lock every migration of the console waits for.
      await writeFile(join(dir, "0001-first.sql"), "create table things (id int);\n");
      await writeFile(
        join(dir, "0002-slow.sql"),
        "set local statement_timeout = 0;\ninsert into things values (1);\nselect pg_sleep(120);\n",
      );
      const began = performance.now();
      await expect(migrate.applyMigrations(key, dir)).rejects.toMatchObject({
        code: "plugin.timeout",
        message: "the migration 0002-slow.sql ran past its time",
      });
      expect(performance.now() - began).toBeLessThan(10_000);
      // The console's migrations go on: the lock is free, and the role's session is gone.
      const lock = await drizzleOf(console_).execute<{ got: boolean }>(
        sql`select pg_try_advisory_xact_lock(5434002) as got`,
      );
      expect(lock.rows[0]?.got).toBe(true);
      // What the migration before it made stands, and nothing of the one that was ended.
      expect(
        (await migrate.query(key, "select name from _migrations order by name", [])).rows,
      ).toEqual([{ name: "0001-first.sql" }]);
      expect((await migrate.query(key, "select count(*)::int as n from things", [])).rows).toEqual([
        { n: 0 },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
