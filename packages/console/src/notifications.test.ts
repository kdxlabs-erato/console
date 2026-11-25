import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
  notificationSettingsOf,
  TASK_KINDS_OF,
  taskFollowToKeep,
  taskTold,
  taskToldByDefault,
  unseenSince,
} from "./notifications.js";

// What a member is told of (ADR-0157), where it needs no database: whether a task tells them
// anything where they chose nothing of it, what is kept when they turn it, and from when a
// list that opens shows what is new. Whom an event concerns is the
// worker's, and is tested where the board is (`apps/console`, `notifications.int.test.ts`).

const PROJECT = "0195c0de-0000-7000-8000-00000000000a";
const only = (...on: NotificationKind[]) =>
  notificationSettingsOf("person", {
    kinds: Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, on.includes(kind)])),
  });

describe("whether a task tells a member anything where they chose nothing of it", () => {
  const usual = (
    settings: ReturnType<typeof only>,
    who: { owner?: boolean; worker?: boolean },
  ): boolean =>
    taskToldByDefault({
      settings,
      owner: who.owner === true,
      worker: who.worker === true,
      projectId: PROJECT,
    });

  it("is on for its owner and its workers by the kinds a task goes on telling each under", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(usual(only(kind), { owner: true }), `owner, ${kind}`).toBe(
        TASK_KINDS_OF.owner.includes(kind),
      );
      expect(usual(only(kind), { worker: true }), `worker, ${kind}`).toBe(
        TASK_KINDS_OF.worker.includes(kind),
      );
      // Whoever is both is told by either.
      expect(usual(only(kind), { owner: true, worker: true }), `both, ${kind}`).toBe(
        TASK_KINDS_OF.owner.includes(kind) || TASK_KINDS_OF.worker.includes(kind),
      );
    }
    // Being given a task is said once, and is none of what it still tells.
    expect(TASK_KINDS_OF.owner).not.toContain("assigned");
    expect(TASK_KINDS_OF.worker).not.toContain("assigned");
  });

  it("is off for whoever is nothing to the task, whatever they have on, and in a project they turned off", () => {
    expect(usual(only(...NOTIFICATION_KINDS), {})).toBe(false);
    const off = { ...only("commented"), projectsOff: [PROJECT] };
    expect(usual(off, { owner: true, worker: true })).toBe(false);
    expect(usual({ ...off, projectsOff: ["another"] }, { owner: true })).toBe(true);
  });

  it("is, for members who chose nothing, off for a person and on for an agent account at work on it", () => {
    const person = notificationSettingsOf("person", undefined);
    const account = notificationSettingsOf("agent", undefined);
    expect(usual(person, { owner: true, worker: true })).toBe(false);
    expect(usual(account, { worker: true })).toBe(true);
    expect(usual(account, { owner: true })).toBe(true);
  });
});

describe("what is kept when a member turns a task's notifications", () => {
  it("is nothing where that is what their settings say, and the turn itself where it is not", () => {
    expect(taskFollowToKeep(true, true)).toBeUndefined();
    expect(taskFollowToKeep(false, false)).toBeUndefined();
    expect(taskFollowToKeep(true, false)).toBe("following");
    expect(taskFollowToKeep(false, true)).toBe("muted");
  });

  it("reads a task as on by what was kept of it, over what the settings say", () => {
    expect(taskTold(undefined, true)).toBe(true);
    expect(taskTold(undefined, false)).toBe(false);
    expect(taskTold("following", false)).toBe(true);
    expect(taskTold("muted", true)).toBe(false);
    // What was kept before the settings changed still holds.
    expect(taskTold("following", true)).toBe(true);
    expect(taskTold("muted", false)).toBe(false);
  });
});

describe("from when a list that opens shows what is new", () => {
  const T1 = "2026-11-24T03:00:00.000Z";
  const T2 = "2026-11-24T03:00:05.000Z";

  it("is the moment this opening read something at", () => {
    expect(unseenSince(undefined, { read: 3, at: T1 })).toBe(T1);
  });

  it("is nothing where it read nothing and no opening before it was left unshown", () => {
    expect(unseenSince(undefined, { read: 0, at: T1 })).toBeUndefined();
  });

  it("stays an earlier opening's, whose rows were never shown: closed and opened again before its answer, or its listing failed", () => {
    // The first opening read three and was let go; the second reads none, and must still show
    // those three as new, which were read at the first's moment.
    const kept = unseenSince(undefined, { read: 3, at: T1 });
    expect(unseenSince(kept, { read: 0, at: T2 })).toBe(T1);
    // And one that reads more meanwhile shows them all: the earlier moment is before them.
    expect(unseenSince(kept, { read: 2, at: T2 })).toBe(T1);
  });
});
