import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database, drizzleOf } from "./client.js";
import { holdEventOrder, settledEnd, settledEndOrRefused } from "./queries/event-order.js";
import { latestEventId, listEventsAfter, recordEvent } from "./queries/events.js";
import { emitPluginEvent, listPluginEventsAfter } from "./queries/plugin-board.js";
import { ensureWorkspace } from "./queries/workspaces.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "./testing.js";

// The order of a feed (ADR-0125) against a real PostgreSQL: what the decision rests on of the
// server's own behaviour, and what a reader by number is given while a writer is under way.

let testDatabase: TestDatabase;
let database: Database;
let workspaceId: string;
const NOW = new Date("2026-11-15T09:00:00.000Z");

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  database = testDatabase.database;
  workspaceId = (await ensureWorkspace(database, { name: "Acme", now: NOW })).id;
});

afterAll(async () => {
  await testDatabase?.drop();
});

/** An event of the workspace's own, written and committed. */
const happen = (on: Database = database): Promise<number> =>
  drizzleOf(on).transaction((tx) =>
    recordEvent(tx, {
      workspaceId,
      kind: "workspace.updated",
      actor: undefined,
      data: { fields: ["name"] },
      now: NOW,
    }),
  );

/**
 * A change that is given its event's number and is slow to commit: resolves with the number once
 * it is given, and commits when `commit` is called.
 */
function slowChange(stream: "console" | "plugin" = "console") {
  let commit: () => void = () => {};
  let numbered: (id: number) => void = () => {};
  const mayCommit = new Promise<void>((resolve) => {
    commit = resolve;
  });
  const number = new Promise<number>((resolve) => {
    numbered = resolve;
  });
  const done = drizzleOf(database).transaction(async (tx) => {
    if (stream === "console") {
      numbered(
        await recordEvent(tx, {
          workspaceId,
          kind: "workspace.updated",
          actor: undefined,
          data: { fields: ["name"] },
          now: NOW,
        }),
      );
    } else {
      // As `emitPluginEvent` writes one, whose transaction is its own and cannot be held open.
      await holdEventOrder(tx, "plugin");
      const made = await tx.execute<{ id: string }>(
        sql`insert into plugin_events (workspace_id, plugin_key, kind, created_at)
            values (${workspaceId}, 'slow', 'ping', ${NOW.toISOString()}) returning id`,
      );
      numbered(Number(made.rows[0]?.id));
    }
    await mayCommit;
  });
  return { number, commit, done };
}

const scope = () => ({ workspaceId, projectId: null });

describe("what the order of a feed rests on in PostgreSQL", () => {
  /** The locks on a feed's table in this database: the server lists those of every database. */
  const locksOn = (table: "feed_order.events" | "feed_order.plugin_events") =>
    drizzleOf(database)
      .execute<{ mode: string; granted: boolean }>(
        sql`select mode, granted from pg_locks
            where locktype = 'relation' and relation = ${table}::regclass
              and database = (select oid from pg_database where datname = current_database())
            order by mode`,
      )
      .then((found) => found.rows);
  /** The reader's question, as `settledEnd` asks it: whether no writer of the feed is under way. */
  const alone = (feed: "console" | "plugin" = "console") =>
    drizzleOf(database)
      .execute<{ alone: boolean }>(sql`select feed_order.writers_ended(${feed}) as alone`)
      .then((asked) => asked.rows[0]?.alone);
  /** Whether a lock of `mode` on the board's feed's table is given at once, in a transaction that ends with it. */
  const given = (mode: string): Promise<boolean> =>
    drizzleOf(database)
      .transaction(async (tx) => {
        await tx.execute(sql.raw(`lock table feed_order.events in ${mode} mode nowait`));
        return true;
      })
      .catch(() => false);

  it("gives the numbers of both streams one at a time: no session keeps numbers ahead", async () => {
    // A sequence that cached numbers per session would give a lower number after a higher one
    // without any transaction being slow, and the proof of ADR-0125 would not hold.
    const rows = await drizzleOf(database).execute<{ cache: string }>(
      sql`select seqcache as cache from pg_sequence
          where seqrelid in (
            pg_get_serial_sequence('events', 'id')::regclass,
            pg_get_serial_sequence('plugin_events', 'id')::regclass)`,
    );
    expect(rows.rows.map((row) => Number(row.cache))).toEqual([1, 1]);
  });

  it("takes no lock on a table outside a transaction, which is why a reader asks through a function", async () => {
    await expect(
      drizzleOf(database).execute(sql`lock table feed_order.events in exclusive mode nowait`),
    ).rejects.toMatchObject({ cause: { code: "25P01" } });
    // The function's lock goes with the statement that called it: asked twice, given twice.
    expect([await alone(), await alone(), await locksOn("feed_order.events")]).toEqual([
      true,
      true,
      [],
    ]);
    await expect(
      drizzleOf(database).execute(sql`select feed_order.writers_ended('neither')`),
    ).rejects.toMatchObject({ cause: { message: "no such feed: neither" } });
  });

  it("holds no row in the tables it locks, ever", async () => {
    for (const table of ["feed_order.events", "feed_order.plugin_events"]) {
      await expect(
        drizzleOf(database).execute(sql.raw(`insert into ${table} values (true)`)),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
    }
  });

  it("refuses a reader at once while a writer is under way, and leaves it in no queue: the next writer does not wait", async () => {
    const slow = slowChange();
    await slow.number;
    try {
      // The writer's lock is of the kind the server keeps with the session and not in its shared
      // table, until someone asks for the table alone: the reader's try still meets it.
      expect(await locksOn("feed_order.events")).toEqual([{ mode: "RowShareLock", granted: true }]);
      const began = performance.now();
      expect(await alone()).toBe(false);
      expect(performance.now() - began).toBeLessThan(1000);
      // Nothing waits for the lock: a reader that had queued would show here, not granted.
      expect(await locksOn("feed_order.events")).toEqual([{ mode: "RowShareLock", granted: true }]);
      // And the next writer is numbered and committed while the first is still under way.
      const next = await Promise.race([happen(), sleep(3000).then(() => "waited" as const)]);
      expect(next).toBeGreaterThan(await slow.number);
      // The plugins' stream is another table: a writer of the one holds up no reader of the other.
      expect(await alone("plugin")).toBe(true);
    } finally {
      slow.commit();
      await slow.done;
    }
    expect(await alone()).toBe(true);
  });

  it("has a writer wait for nothing but a lock taken alone: a vacuum, an analyze and every weaker lock go beside it", async () => {
    const slow = slowChange();
    await slow.number;
    try {
      const beside: Record<string, boolean> = {};
      for (const mode of [
        "access share",
        "row share",
        "row exclusive",
        "share update exclusive",
        "share",
        "share row exclusive",
        "exclusive",
        "access exclusive",
      ]) {
        beside[mode] = await given(mode);
      }
      expect(beside).toEqual({
        "access share": true,
        "row share": true,
        "row exclusive": true,
        "share update exclusive": true,
        share: true,
        "share row exclusive": true,
        exclusive: false,
        "access exclusive": false,
      });
      // What the server does to every table on its own takes the fourth of these.
      await drizzleOf(database).execute(sql`analyze feed_order.events`);
      await drizzleOf(database).execute(sql`vacuum feed_order.events`);
    } finally {
      slow.commit();
      await slow.done;
    }
  });

  it("refuses a reader beside whatever else holds the table, a dump's lock apart, and gives it nothing to wait for", async () => {
    // A reader that is refused asks again: none of these is held for longer than a moment on a
    // table with no row. A dump reads every table under the weakest lock, which it goes beside.
    const beside: Record<string, boolean | undefined> = {};
    for (const mode of ["access share", "share update exclusive", "share", "exclusive"]) {
      await drizzleOf(database).transaction(async (tx) => {
        await tx.execute(sql.raw(`lock table feed_order.events in ${mode} mode`));
        beside[mode] = await alone();
      });
    }
    expect(beside).toEqual({
      "access share": true,
      "share update exclusive": false,
      share: false,
      exclusive: false,
    });
    expect(await locksOn("feed_order.events")).toEqual([]);
  });

  it("holds a writer's lock to the end of its transaction, and never past it", async () => {
    const held = async () => (await locksOn("feed_order.events")).length;
    const slow = slowChange();
    try {
      await slow.number;
      expect(await held()).toBe(1);
    } finally {
      slow.commit();
      await slow.done;
    }
    expect(await held()).toBe(0);
    // A change that fails after its event was numbered gives the lock up too.
    await expect(
      drizzleOf(database).transaction(async (tx) => {
        await recordEvent(tx, {
          workspaceId,
          kind: "workspace.updated",
          actor: undefined,
          data: { fields: ["name"] },
          now: NOW,
        });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await held()).toBe(0);
  });
});

describe("the settled end of a feed", () => {
  it("is the newest event while no writer is under way", async () => {
    const newest = await happen();
    expect(await settledEnd(database, "console")).toBe(newest);
    expect(await latestEventId(database, workspaceId)).toBe(newest);
  });

  it("stays before an event numbered and not committed, whatever is committed after it, and takes both in once it is", async () => {
    const before = await latestEventId(database, workspaceId);
    const slow = slowChange();
    const first = await slow.number;
    let second = 0;
    try {
      second = await happen();
      expect(second).toBeGreaterThan(first);
      // A reader by number is given nothing of the two: the second is committed, and beyond the end.
      expect(await settledEnd(database, "console")).toBe(before);
      expect(await latestEventId(database, workspaceId)).toBe(before);
      expect((await listEventsAfter(database, scope(), before, 10)).items).toEqual([]);
    } finally {
      slow.commit();
      await slow.done;
    }
    expect(await settledEnd(database, "console")).toBe(second);
    expect((await listEventsAfter(database, scope(), before, 10)).items.map((e) => e.id)).toEqual([
      first,
      second,
    ]);
  });

  it("takes in an event whose transaction failed after it was numbered: its number never comes", async () => {
    const before = await latestEventId(database, workspaceId);
    await drizzleOf(database)
      .transaction(async (tx) => {
        await recordEvent(tx, {
          workspaceId,
          kind: "workspace.updated",
          actor: undefined,
          data: { fields: ["name"] },
          now: NOW,
        });
        throw new Error("the change failed");
      })
      .catch(() => undefined);
    const after = await happen();
    expect(after).toBe(before + 2);
    expect(await settledEnd(database, "console")).toBe(after);
  });

  it("answers those who ask together with one look, and each stream by itself", async () => {
    const newest = await happen();
    const answers = await Promise.all(
      Array.from({ length: 20 }, () => settledEnd(database, "console")),
    );
    expect(new Set(answers)).toEqual(new Set([newest]));
    // The plugins' stream settles under a lock of its own: a writer of the one holds up no
    // reader of the other.
    const emitted = await emitPluginEvent(database, {
      workspaceId,
      key: "audit",
      kind: "ping",
      data: null,
      now: NOW,
    });
    const slow = slowChange();
    await slow.number;
    try {
      expect(await settledEnd(database, "plugin")).toBe(emitted);
    } finally {
      slow.commit();
      await slow.done;
    }
  });

  it("holds the plugins' stream the same way", async () => {
    const before = (await settledEnd(database, "plugin")) ?? 0;
    const slow = slowChange("plugin");
    const first = await slow.number;
    let second = 0;
    try {
      second = await emitPluginEvent(database, {
        workspaceId,
        key: "quick",
        kind: "ping",
        data: null,
        now: NOW,
      });
      expect(second).toBeGreaterThan(first);
      expect(await listPluginEventsAfter(database, workspaceId, before, 10)).toEqual([]);
    } finally {
      slow.commit();
      await slow.done;
    }
    expect(
      (await listPluginEventsAfter(database, workspaceId, before, 10)).map((event) => event.id),
    ).toEqual([first, second]);
  });

  it("answers nothing in a process that never saw the feed settle while a writer is under way, and reads nothing by number", async () => {
    // Another process: a pool of its own, which has looked at nothing yet.
    const other = createDatabase({
      connectionString: testDatabase.connectionString,
      maxConnections: 2,
    });
    const slow = slowChange();
    const emitting = slowChange("plugin");
    await slow.number;
    await emitting.number;
    try {
      expect(await settledEnd(other, "console")).toBeUndefined();
      expect(await latestEventId(other, workspaceId)).toBe(0);
      expect((await listEventsAfter(other, scope(), 0, 10)).items).toEqual([]);
      // A read that answers where a stream stands is refused there: 0 would be its beginning.
      await expect(settledEndOrRefused(other, "plugin")).rejects.toMatchObject({
        name: "FeedUnsettledError",
        code: "feed.unsettled",
      });
    } finally {
      slow.commit();
      emitting.commit();
      await slow.done;
      await emitting.done;
    }
    try {
      const end = await settledEnd(other, "console");
      expect(end).toBe(await slow.number);
      expect((await listEventsAfter(other, scope(), 0, 1000)).items.at(-1)?.id).toBe(end);
      expect(await settledEndOrRefused(other, "plugin")).toBe(await emitting.number);
    } finally {
      await other.close();
    }
  });
});
