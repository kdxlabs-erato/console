import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, drizzleOf } from "../db/client.js";
import { readJobs } from "../db/queries/plugin-board.js";
import { ensureWorkspace, type WorkspaceRecord } from "../db/queries/workspaces.js";
import { pluginJobs } from "../db/schema.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "../db/testing.js";
import { failsRepeatedly, PluginScheduler, type Scheduling } from "./scheduler.js";

// The scheduler against a real database: a job's lock held for as long as the job runs, whatever
// the server lets a transaction idle, so that two processes never run one job at once.

let testDatabase: TestDatabase;
let workspace: WorkspaceRecord;

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  workspace = await ensureWorkspace(testDatabase.database, { name: "Acme", now: new Date() });
});

afterAll(async () => {
  await testDatabase?.drop();
});

describe("the scheduler", () => {
  it("holds a job's lock for as long as the job runs, past the server's idle timeout", async () => {
    // Two processes, each with a pool whose idle transactions the server ends after a second,
    // and a job that runs longer: the lock went with the session, and the second process ran the
    // job again while the first was still at it.
    const first = createDatabase({
      connectionString: testDatabase.connectionString,
      maxConnections: 4,
      idleInTransactionMs: 1_000,
    });
    const second = createDatabase({
      connectionString: testDatabase.connectionString,
      maxConnections: 4,
      idleInTransactionMs: 1_000,
    });
    try {
      let running = 0;
      let overlapped = false;
      let ran = 0;
      const jobs: Scheduling = {
        jobTargets: async () => [
          { key: "long", boardProjectId: undefined, jobs: { report: { every: "PT5M", at: null } } },
        ],
        runJob: async () => {
          running += 1;
          overlapped ||= running > 1;
          await sleep(2_500);
          ran += 1;
          running -= 1;
          return { ok: true, value: null };
        },
        recordFailure: async () => {},
      };
      const warnings: string[] = [];
      const logger = pino(
        { level: "warn" },
        { write: (line: string) => warnings.push((JSON.parse(line) as { msg: string }).msg) },
      );
      let at = new Date("2026-11-08T09:00:00.000Z");
      const clock = { now: () => at };
      const one = new PluginScheduler({
        database: first,
        workspace: async () => workspace,
        plugins: jobs,
        clock,
        logger,
      });
      const two = new PluginScheduler({
        database: second,
        workspace: async () => workspace,
        plugins: jobs,
        clock,
        logger,
      });
      // The job is seen, and runs a period later.
      await one.tick();
      at = new Date(at.getTime() + 5 * 60_000);
      const ticking = one.tick();
      await sleep(1_500);
      await two.tick();
      await ticking;
      expect(overlapped).toBe(false);
      expect(ran).toBe(1);
      expect(warnings).toEqual([]);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it("runs a job once when another process ran it while this one was at the job before", async () => {
    // Each process reads a plugin's jobs once, then runs them one after another. One was at a
    // long job while the other ran the next one; it came to that job with what it had read
    // before, took the lock the other had let go, and ran it a second time.
    const first = createDatabase({
      connectionString: testDatabase.connectionString,
      maxConnections: 4,
    });
    const second = createDatabase({
      connectionString: testDatabase.connectionString,
      maxConnections: 4,
    });
    try {
      let quickRuns = 0;
      const jobs: Scheduling = {
        jobTargets: async () => [
          {
            key: "twice",
            boardProjectId: undefined,
            jobs: { long: { every: "PT5M", at: null }, quick: { every: "PT5M", at: null } },
          },
        ],
        runJob: async (_key, name) => {
          if (name === "long") {
            await sleep(1_500);
          } else {
            quickRuns += 1;
          }
          return { ok: true, value: null };
        },
        recordFailure: async () => {},
      };
      let at = new Date("2026-11-16T09:00:00.000Z");
      const clock = { now: () => at };
      const logger = pino({ level: "silent" });
      const one = new PluginScheduler({
        database: first,
        workspace: async () => workspace,
        plugins: jobs,
        clock,
        logger,
      });
      const two = new PluginScheduler({
        database: second,
        workspace: async () => workspace,
        plugins: jobs,
        clock,
        logger,
      });
      await one.tick();
      at = new Date(at.getTime() + 5 * 60_000);
      // The first is at the long job; the second finds it taken and runs the quick one.
      const ticking = one.tick();
      await sleep(500);
      await two.tick();
      expect(quickRuns).toBe(1);
      await ticking;
      expect(quickRuns).toBe(1);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it("keeps a job's period whatever its run takes, and skips the periods it was away for", async () => {
    // The scheduler looks once a minute, and a run ends after the tick that began it. Counted
    // from the end of the run, the next time fell just past the tick a period on, and a job of
    // five minutes ran every six, one of an hour every sixty-one.
    const started: string[] = [];
    let at = new Date("2026-11-14T09:00:30.000Z");
    const jobs: Scheduling = {
      jobTargets: async () => [
        { key: "steady", boardProjectId: undefined, jobs: { sync: { every: "PT5M", at: null } } },
      ],
      runJob: async () => {
        started.push(at.toISOString().slice(11, 19));
        at = new Date(at.getTime() + 5_000);
        return { ok: true, value: null };
      },
      recordFailure: async () => {},
    };
    const scheduler = new PluginScheduler({
      database: testDatabase.database,
      workspace: async () => workspace,
      plugins: jobs,
      clock: { now: () => at },
      logger: pino({ level: "silent" }),
    });
    // Seen at 09:00:30, so first due at 09:05:30; then a tick every minute, half past.
    await scheduler.tick();
    for (let minute = 1; minute <= 16; minute += 1) {
      at = new Date(Date.parse("2026-11-14T09:00:30.000Z") + minute * 60_000);
      await scheduler.tick();
    }
    expect(started).toEqual(["09:05:30", "09:10:30", "09:15:30"]);
    // Away for a quarter of an hour: one run when it is back, and the period goes on from the
    // time the job was due, not from the run.
    at = new Date("2026-11-14T09:33:30.000Z");
    await scheduler.tick();
    expect(started).toHaveLength(4);
    const row = (await readJobs(testDatabase.database, workspace.id, "steady")).find(
      (candidate) => candidate.name === "sync",
    );
    expect(row?.nextAt).toEqual(new Date("2026-11-14T09:35:30.000Z"));
  });

  it("keeps since when a job has failed, run after run, and forgets it when the job goes well (ADR-0128)", async () => {
    // What the plugin's problems are read from: the first failure after the job went well is
    // where the run of failures began, a second failure running is one that keeps failing, and
    // one run that goes well ends it.
    const outcomes = [false, false, false, true, false];
    const jobs: Scheduling = {
      jobTargets: async () => [
        { key: "flaky", boardProjectId: undefined, jobs: { sync: { every: "PT5M", at: null } } },
      ],
      runJob: async () =>
        outcomes.shift() === true
          ? { ok: true, value: null }
          : { ok: false, error: { code: "plugin.failed", message: "it failed" } },
      recordFailure: async () => {},
    };
    let at = new Date("2026-11-10T02:00:00.000Z");
    const scheduler = new PluginScheduler({
      database: testDatabase.database,
      workspace: async () => workspace,
      plugins: jobs,
      clock: { now: () => at },
      logger: pino({ level: "silent" }),
    });
    const job = async () =>
      (await readJobs(testDatabase.database, workspace.id, "flaky")).find(
        (row) => row.name === "sync",
      );
    const next = async () => {
      at = new Date(at.getTime() + 5 * 60_000);
      await scheduler.tick();
      const row = await job();
      if (row === undefined) {
        throw new Error("the job has no row");
      }
      return row;
    };
    // Seen for the first time: nothing ran, nothing failed.
    await scheduler.tick();
    expect(await job()).toMatchObject({ lastOutcome: undefined, failedSince: undefined });

    const firstFailure = new Date(at.getTime() + 5 * 60_000);
    const once = await next();
    expect(once).toMatchObject({ lastOutcome: "failed", failedSince: firstFailure });
    expect(failsRepeatedly(once)).toBe(false);

    const twice = await next();
    expect(twice).toMatchObject({ lastOutcome: "failed", failedSince: firstFailure });
    expect(twice.lastRunAt?.getTime()).toBe(firstFailure.getTime() + 5 * 60_000);
    expect(failsRepeatedly(twice)).toBe(true);

    const thrice = await next();
    expect(thrice.failedSince).toEqual(firstFailure);
    expect(failsRepeatedly(thrice)).toBe(true);

    // It went well: the run of failures is over, and the next failure begins another.
    const well = await next();
    expect(well).toMatchObject({ lastOutcome: "ok", failedSince: undefined });
    expect(failsRepeatedly(well)).toBe(false);

    const again = await next();
    expect(again).toMatchObject({ lastOutcome: "failed", failedSince: again.lastRunAt });
    expect(failsRepeatedly(again)).toBe(false);
  });

  it("begins a run of failures at its first failure, whatever a worker of the version before left in the row (ADR-0128)", async () => {
    // While a deployment moves to this version, a worker of the one before still runs jobs: it
    // writes a run that went well as it always did, and knows nothing of `failed_since`, which
    // stays as the run of failures before it left it. The job's next failure is the first of a
    // new run, not one more of the run that ended: one failure, and no problem of its plugin.
    const outcomes = [false, false, false];
    const jobs: Scheduling = {
      jobTargets: async () => [
        { key: "rolling", boardProjectId: undefined, jobs: { sync: { every: "PT5M", at: null } } },
      ],
      runJob: async () =>
        outcomes.shift() === true
          ? { ok: true, value: null }
          : { ok: false, error: { code: "plugin.failed", message: "it failed" } },
      recordFailure: async () => {},
    };
    let at = new Date("2026-11-12T02:00:00.000Z");
    const scheduler = new PluginScheduler({
      database: testDatabase.database,
      workspace: async () => workspace,
      plugins: jobs,
      clock: { now: () => at },
      logger: pino({ level: "silent" }),
    });
    const job = async () => {
      const row = (await readJobs(testDatabase.database, workspace.id, "rolling")).find(
        (candidate) => candidate.name === "sync",
      );
      if (row === undefined) {
        throw new Error("the job has no row");
      }
      return row;
    };
    const next = async () => {
      at = new Date(at.getTime() + 5 * 60_000);
      await scheduler.tick();
      return job();
    };
    await scheduler.tick();
    const firstFailure = new Date(at.getTime() + 5 * 60_000);
    await next();
    const failing = await next();
    expect(failing.failedSince).toEqual(firstFailure);
    expect(failsRepeatedly(failing)).toBe(true);

    // The worker of before runs it, and it goes well: the row as that version writes it, the
    // last run, its outcome and the next time, and not a word of since when it failed.
    at = new Date(at.getTime() + 5 * 60_000);
    const wentWell = at;
    await drizzleOf(testDatabase.database)
      .update(pluginJobs)
      .set({
        lastRunAt: wentWell,
        lastOutcome: "ok",
        nextAt: new Date(wentWell.getTime() + 5 * 60_000),
        updatedAt: wentWell,
      })
      .where(
        and(
          eq(pluginJobs.workspaceId, workspace.id),
          eq(pluginJobs.pluginKey, "rolling"),
          eq(pluginJobs.name, "sync"),
        ),
      );
    expect(await job()).toMatchObject({ lastOutcome: "ok", failedSince: firstFailure });
    expect(failsRepeatedly(await job())).toBe(false);

    // Hours later it fails once, under this version.
    at = new Date(wentWell.getTime() + 6 * 60 * 60_000);
    const once = await next();
    expect(once.lastOutcome).toBe("failed");
    expect(once.failedSince).toEqual(once.lastRunAt);
    expect(once.failedSince?.getTime()).toBeGreaterThan(wentWell.getTime());
    expect(failsRepeatedly(once)).toBe(false);
  });
});
