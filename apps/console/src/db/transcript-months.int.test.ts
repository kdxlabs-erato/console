import { randomBytes } from "node:crypto";
import process from "node:process";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database, drizzleOf } from "./client.js";
import { attachedMonths, ensureMonths } from "./queries/transcript.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "./testing.js";

// The partitions of a month of the transcript (ADR-0086) against a real PostgreSQL: made while a
// role that may not use the schema holds the transcript's tables and their partitions, as any
// role of the database may through the catalog's functions that take a table's number (a
// plugin's among them, ADR-0133), and made once where two processes make them at once. The
// holder is a role of the cluster's, named for this run.

const adminUrl = process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL;
const holderRole = `console_test_${randomBytes(4).toString("hex")}_holder`;
const holderPassword = randomBytes(18).toString("base64url");
/** The pool's lock timeout (`createDatabase`): what a wait on a lock is bounded by. */
const LOCK_TIMEOUT_MS = 5000;
const TABLES = ["events", "files", "blobs"] as const;

let testDatabase: TestDatabase;
let admin: Client;
const opened: Database[] = [];

beforeAll(async () => {
  testDatabase = await createTestDatabase(adminUrl);
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create role "${holderRole}" with login password '${holderPassword}'`);
});

afterAll(async () => {
  for (const database of opened) {
    await database.close();
  }
  await testDatabase?.drop();
  if (admin !== undefined) {
    await admin.query(`drop role if exists "${holderRole}"`);
    await admin.end();
  }
});

/** Another process's pool on the same database. */
function anotherProcess(): Database {
  const database = createDatabase({
    connectionString: testDatabase.connectionString,
    maxConnections: 2,
  });
  opened.push(database);
  return database;
}

/** The partitions attached to each of the transcript's tables for a month, by their bound. */
async function partitionsOf(month: string): Promise<Record<string, string[]>> {
  const found = await drizzleOf(testDatabase.database).execute<{
    parent: string;
    child: string;
    bound: string;
  }>(sql`
    select parent.relname as parent, child.relname as child,
           pg_get_expr(child.relpartbound, child.oid) as bound
    from pg_inherits
    join pg_class child on child.oid = pg_inherits.inhrelid
    join pg_class parent on parent.oid = pg_inherits.inhparent
    join pg_namespace on pg_namespace.oid = parent.relnamespace
    where pg_namespace.nspname = 'transcript' and parent.relkind = 'p'
    order by child.relname`);
  const partitions: Record<string, string[]> = { events: [], files: [], blobs: [] };
  for (const row of found.rows) {
    if (row.bound === `FOR VALUES IN ('${month}')`) {
      partitions[row.parent]?.push(row.child);
    }
  }
  return partitions;
}

const madeFor = (month: string) => {
  const suffix = month.replace("-", "_");
  return { events: [`events_${suffix}`], files: [`files_${suffix}`], blobs: [`blobs_${suffix}`] };
};

describe("the partitions of a month of the transcript", () => {
  it("are made while a role that may not use the schema holds the tables and their partitions", async () => {
    await ensureMonths(testDatabase.database, ["2030-01"]);
    const url = new URL(testDatabase.connectionString);
    url.username = holderRole;
    url.password = holderPassword;
    const holder = new Client({ connectionString: url.href });
    await holder.connect();
    try {
      // The role may name none of the transcript's tables, and finds their numbers all the same.
      await expect(holder.query("select 1 from transcript.events")).rejects.toMatchObject({
        code: "42501",
      });
      const numbers = await holder.query<{ relname: string; oid: number }>(
        `select c.relname, c.oid::int as oid from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'transcript' and c.relkind in ('p', 'r')`,
      );
      const oidOf = (name: string): number => {
        const row = numbers.rows.find((candidate) => candidate.relname === name);
        if (row === undefined) {
          throw new Error(`no table ${name}`);
        }
        return row.oid;
      };
      const pid = (await holder.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
        ?.pid;
      await holder.query("set statement_timeout = 0");
      await holder.query("begin");
      for (const table of TABLES) {
        // Each holds ACCESS SHARE until the transaction ends: the first on the table itself, the
        // second on every partition of it.
        await holder.query("select pg_get_partition_constraintdef($1::oid)", [
          oidOf(`${table}_2030_01`),
        ]);
        await holder.query("select * from pg_partition_tree($1::oid)", [oidOf(table)]);
      }
      const held = await drizzleOf(testDatabase.database).execute<{ relname: string }>(sql`
        select c.relname from pg_locks l join pg_class c on c.oid = l.relation
        where l.pid = ${pid} and l.mode = 'AccessShareLock' and l.granted
        order by c.relname`);
      expect(held.rows.map((row) => row.relname)).toEqual([
        "blobs",
        "blobs_2030_01",
        "events",
        "events_2030_01",
        "files",
        "files_2030_01",
      ]);
      const started = Date.now();
      await ensureMonths(testDatabase.database, ["2030-02"]);
      expect(Date.now() - started).toBeLessThan(LOCK_TIMEOUT_MS);
      expect(await partitionsOf("2030-02")).toEqual(madeFor("2030-02"));
    } finally {
      await holder.query("rollback").catch(() => undefined);
      await holder.end();
    }
  });

  it("are made once where two processes make the same months at once, and again by none", async () => {
    const months = ["2030-03", "2030-04"];
    await Promise.all([
      ensureMonths(anotherProcess(), months),
      ensureMonths(anotherProcess(), [...months].reverse()),
    ]);
    for (const month of months) {
      expect(await partitionsOf(month)).toEqual(madeFor(month));
    }
    // A process that starts later finds them made, and makes nothing.
    await ensureMonths(anotherProcess(), months);
    const tables = await drizzleOf(testDatabase.database).execute<{ relname: string }>(sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'transcript' and c.relkind = 'r' and c.relname ~ '_2030_0[34]$'
      order by c.relname`);
    expect(tables.rows.map((row) => row.relname)).toEqual([
      "blobs_2030_03",
      "blobs_2030_04",
      "events_2030_03",
      "events_2030_04",
      "files_2030_03",
      "files_2030_04",
    ]);
  });

  it("leave a month whose table its operator detached as the operator left it", async () => {
    await ensureMonths(testDatabase.database, ["2030-05"]);
    await drizzleOf(testDatabase.database).execute(
      sql.raw("alter table transcript.events detach partition transcript.events_2030_05"),
    );
    await ensureMonths(anotherProcess(), ["2030-05"]);
    expect(await partitionsOf("2030-05")).toEqual({ ...madeFor("2030-05"), events: [] });
    expect((await attachedMonths(testDatabase.database)).has("2030-05")).toBe(false);
  });
});
