import {
  agentPath,
  NOTIFICATION_KINDS,
  projectPath,
  REST_ROUTES,
  restAgentSchema,
  restMeSchema,
  restNotificationSettingsSchema,
  restNotificationsReadSchema,
  restNotificationsSchema,
  restSignalsSchema,
  restTaskFollowSchema,
  restTaskSchema,
  TASK_KINDS_OF,
} from "@skillcdn/console/api";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOf } from "./db/client.js";
import { deleteNotificationsBefore, followsOfTask } from "./db/queries/notifications.js";
import { workspaces } from "./db/schema.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "./db/testing.js";
import { BoardWakes } from "./jobs/board-wakes.js";
import { createFixtureProvider } from "./testing/fixture-provider.js";
import { createHarness, type Harness, SIGN_IN_URL } from "./testing/harness.js";

// Whom the board tells of what happens on it (ADR-0157): the notifications the worker makes of
// the feed, for a person and an agent account by the same rules, what a member chose to be
// told of, whether one task tells them anything, and what they read. On a database of its own,
// with the worker's pass run by hand.

let testDatabase: TestDatabase;
let h: Harness;
let wakes: BoardWakes;
let alice: string;
let bob: string;
let eli: string;
let mira: string;
let bobId: string;
let eliId: string;
let miraId: string;
let now = new Date("2026-11-10T09:00:00.000Z");

const JSON_HEADERS = { "content-type": "application/json" };
const fromPages = (cookie: string) => ({ cookie, origin: SIGN_IN_URL });
const get = (cookie: string, path: string) => h.request(path, { headers: { cookie } });
const send = (cookie: string, method: string, path: string, body?: unknown) =>
  h.request(path, {
    method,
    headers: { ...fromPages(cookie), ...JSON_HEADERS },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const TASKS = projectPath("ops", "tasks");
const task = async (cookie: string, body: unknown) =>
  restTaskSchema.parse(await (await send(cookie, "POST", TASKS, body)).json());
const comment = (cookie: string, id: string, body: string) =>
  send(cookie, "POST", `${projectPath("ops", "tasks", id)}/comments`, { body });
const SETTINGS = `${REST_ROUTES.notifications}/settings`;
const choose = (cookie: string, body: unknown) => send(cookie, "PUT", SETTINGS, body);
const follow = (cookie: string, id: string, on: boolean) =>
  send(cookie, "PUT", `${projectPath("ops", "tasks", id)}/follow`, { on });
/** Whether a task tells a member anything, as it stands and as their settings alone have it. */
const bell = async (cookie: string, id: string) =>
  restTaskFollowSchema.parse(
    await (await get(cookie, `${projectPath("ops", "tasks", id)}/follow`)).json(),
  );
/** A member's notifications after the worker's next pass: why each, what happened, and whether it is read. */
const told = async (cookie: string, query = "") => {
  await wakes.sweep();
  const page = restNotificationsSchema.parse(
    await (await get(cookie, `${REST_ROUTES.notifications}${query}`)).json(),
  );
  return {
    ...page,
    said: page.items.map((one) => ({
      kind: one.kind,
      event: one.event.kind,
      number: one.event.data.number ?? null,
      followed: one.followed,
      read: one.readAt !== null,
    })),
  };
};
const unreadOf = async (cookie: string) =>
  restMeSchema.parse(await (await get(cookie, REST_ROUTES.me)).json()).notifications?.unread;
const signals = async (handle: string) =>
  restSignalsSchema
    .parse(await (await get(alice, agentPath(handle, "signals"))).json())
    .items.map((signal) => signal.text)
    .reverse();

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  h = createHarness(testDatabase, {
    providers: [createFixtureProvider("gh")],
    admins: ["alice"],
    listed: ["alice", "bob", "eli"],
    clock: { now: () => now },
  });
  alice = await h.signIn("alice");
  bob = await h.signIn("bob");
  eli = await h.signIn("eli");
  const idOf = async (cookie: string) =>
    restMeSchema.parse(await (await get(cookie, REST_ROUTES.me)).json()).person?.id ?? "";
  bobId = await idOf(bob);
  eliId = await idOf(eli);
  await h.project(alice, { key: "ops", name: "Operations", visibility: "workspace" });
  miraId = restAgentSchema.parse(
    await (
      await send(alice, "POST", REST_ROUTES.agents, {
        host: "gh",
        login: "carol",
        handle: "mira",
        name: "Mira",
        project: "ops",
      })
    ).json(),
  ).person.id;
  mira = await h.signIn("carol");
  const [workspace] = await drizzleOf(testDatabase.database).select().from(workspaces).limit(1);
  wakes = new BoardWakes({
    database: testDatabase.database,
    workspaceId: async () => workspace?.id ?? "",
    clock: { now: () => now },
    logger: pino({ level: "silent" }),
  });
  // What making the account wrote, its onboarding task among it, is read and behind.
  await wakes.sweep();
  await send(mira, "POST", `${REST_ROUTES.notifications}/read`, { all: true });
});

afterAll(async () => {
  await wakes?.close();
  await testDatabase?.drop();
});

describe("what a member is told of (ADR-0157)", () => {
  it("answers what a member who chose nothing is told of, by what they are", async () => {
    const person = restNotificationSettingsSchema.parse(await (await get(bob, SETTINGS)).json());
    expect(person.kinds).toEqual({
      assigned: false,
      ready: false,
      moved: false,
      changed: false,
      commented: false,
      archived: false,
      decision: false,
      answered: false,
      agent: true,
    });
    expect(person.defaults).toEqual(person.kinds);
    expect(person.projectsOff).toEqual([]);
    expect(person.ownAgents).toBe(false);
    // An agent account is told of what asks something of it: nobody attends it.
    const account = restNotificationSettingsSchema.parse(await (await get(mira, SETTINGS)).json());
    expect(Object.keys(account.kinds).filter((kind) => account.kinds[kind])).toEqual([
      "ready",
      "commented",
      "decision",
      "answered",
      "agent",
    ]);
  });

  it("tells a person nothing of their own work until they turn it on, and then by the kind", async () => {
    const mine = await task(bob, { title: "Renew the certificate" });
    await comment(alice, mine.id, "Is this still due this week?");
    expect((await told(bob)).said).toEqual([]);
    expect(await unreadOf(bob)).toBe(0);

    expect((await choose(bob, { kinds: { commented: true, moved: true } })).status).toBe(200);
    await comment(alice, mine.id, "Then I plan it for Friday.");
    await send(alice, "PATCH", projectPath("ops", "tasks", mine.id), { state: "ready" });
    const page = await told(bob);
    expect(page.said).toEqual([
      { kind: "moved", event: "task.moved", number: mine.number, followed: false, read: false },
      {
        kind: "commented",
        event: "task.commented",
        number: mine.number,
        followed: false,
        read: false,
      },
    ]);
    // What happened is the feed's own event, with who did it, and the project is named to link it.
    expect(page.items[0]?.event.actor?.login).toBe("Alice");
    expect(page.items[0]?.event.data).toMatchObject({ from: "idea", to: "ready" });
    expect(page.items[0]?.project).toMatchObject({ key: "ops", name: "Operations" });
    expect(page.unread).toBe(2);
    expect(await unreadOf(bob)).toBe(2);
    // Whoever does a thing is told nothing of it.
    await comment(bob, mine.id, "Friday is fine.");
    expect((await told(bob)).said).toHaveLength(2);
    expect((await told(alice)).said).toEqual([]);
  });

  it("marks as read what a member read, by its ids or all at once, and nobody else's", async () => {
    const before = await told(bob);
    const first = before.items[0]?.id ?? "";
    const read = (cookie: string, body: unknown) =>
      send(cookie, "POST", `${REST_ROUTES.notifications}/read`, body);
    // Another member's notification is none of theirs to mark.
    const at = now.toISOString();
    expect(
      restNotificationsReadSchema.parse(await (await read(eli, { ids: [first] })).json()),
    ).toEqual({ read: 0, unread: 0, at });
    expect(
      restNotificationsReadSchema.parse(await (await read(bob, { ids: [first] })).json()),
    ).toEqual({ read: 1, unread: 1, at });
    expect((await told(bob, "?unread=true")).said.map((one) => one.kind)).toEqual(["commented"]);
    // Whoever opens their list reads all of it at one moment, which the answer says: what was
    // read at it was new to them until then, and what was read before it was not.
    now = new Date("2026-11-10T09:05:00.000Z");
    const opened = restNotificationsReadSchema.parse(await (await read(bob, { all: true })).json());
    expect(opened).toEqual({ read: 1, unread: 0, at: "2026-11-10T09:05:00.000Z" });
    const listed = await told(bob);
    expect(listed.said.every((one) => one.read)).toBe(true);
    expect(listed.items.map((one) => one.readAt === opened.at)).toEqual([false, true]);
    expect(await unreadOf(bob)).toBe(0);
    // Opened again with nothing new, nothing is read at the later moment.
    now = new Date("2026-11-10T09:06:00.000Z");
    expect(
      restNotificationsReadSchema.parse(await (await read(bob, { all: true })).json()),
    ).toEqual({ read: 0, unread: 0, at: "2026-11-10T09:06:00.000Z" });
    expect((await told(bob)).items.some((one) => one.readAt === "2026-11-10T09:06:00.000Z")).toBe(
      false,
    );
    // Neither both nor neither, and never from another origin on a session.
    expect((await read(bob, {})).status).toBe(400);
    expect((await read(bob, { ids: [first], all: true })).status).toBe(400);
    const foreign = await h.request(`${REST_ROUTES.notifications}/read`, {
      method: "POST",
      headers: { cookie: bob, origin: "https://elsewhere.example", ...JSON_HEADERS },
      body: JSON.stringify({ all: true }),
    });
    expect(foreign.status).toBe(403);
  });

  it("turns a task on for whoever their settings are silent to, off for whoever they tell, and keeps nothing of a task left as they have it", async () => {
    const watched = await task(bob, { title: "Move the registry" });
    const turned = async (cookie: string, id: string, on: boolean) =>
      restTaskFollowSchema.parse(await (await follow(cookie, id, on)).json());
    // Eli is nothing to the task and has turned no kind on: off to begin with. Bob owns it and
    // is told of comments: on to begin with.
    expect(await bell(eli, watched.id)).toEqual({ on: false, usual: false, all: false });
    expect(await bell(bob, watched.id)).toEqual({ on: true, usual: true, all: false });
    // Eli turns it on, which is saying so of this one task: everything on it, whatever kinds.
    expect(await turned(eli, String(watched.number), true)).toEqual({
      on: true,
      usual: false,
      all: true,
    });
    expect(await bell(eli, watched.id)).toEqual({ on: true, usual: false, all: true });
    // Bob turns this one off.
    expect(await turned(bob, watched.id, false)).toEqual({ on: false, usual: true, all: false });
    expect(await bell(bob, watched.id)).toEqual({ on: false, usual: true, all: false });
    const beforeBob = (await told(bob)).said.length;
    await comment(alice, watched.id, "The new host is up.");
    await send(alice, "PATCH", projectPath("ops", "tasks", watched.id), {
      title: "Move the registry to the new host",
    });
    expect((await told(eli)).said).toEqual([
      {
        kind: "changed",
        event: "task.updated",
        number: watched.number,
        followed: true,
        read: false,
      },
      {
        kind: "commented",
        event: "task.commented",
        number: watched.number,
        followed: true,
        read: false,
      },
    ]);
    expect((await told(bob)).said).toHaveLength(beforeBob);
    // Turned the other way again, each is as their settings have it, and nothing is kept of
    // the choice: Bob is told by his kinds as before, and not of everything.
    expect(await turned(eli, watched.id, false)).toEqual({ on: false, usual: false, all: false });
    expect(await turned(bob, watched.id, true)).toEqual({ on: true, usual: true, all: false });
    expect(await followsOfTask(testDatabase.database, watched.id)).toEqual(new Map());
    await comment(alice, watched.id, "And the old one is off.");
    await send(alice, "PATCH", projectPath("ops", "tasks", watched.id), {
      title: "Move the registry to the new host, and the mirror",
    });
    expect((await told(eli)).said).toHaveLength(2);
    const afterBob = (await told(bob)).said;
    expect(afterBob).toHaveLength(beforeBob + 1);
    expect(afterBob[0]).toMatchObject({ kind: "commented", followed: false });
    // Turned to what it is already, it stays so, and still nothing is kept.
    expect(await turned(bob, watched.id, true)).toEqual({ on: true, usual: true, all: false });
    expect(await turned(eli, watched.id, false)).toEqual({ on: false, usual: false, all: false });
    expect(await followsOfTask(testDatabase.database, watched.id)).toEqual(new Map());
    // Whoever is nothing to a task has it off whatever kinds they turn on: a kind tells of
    // one's own tasks.
    await choose(eli, { kinds: { commented: true } });
    expect(await bell(eli, watched.id)).toEqual({ on: false, usual: false, all: false });
    await choose(eli, { reset: true });
    // Put to work on a task, a person who chose nothing has it off still, and on from the
    // moment they turn on a kind it tells its workers under, with nothing turned by hand.
    const shared = await task(bob, { title: "Mirror the registry", workerIds: [eliId] });
    expect(await bell(eli, shared.id)).toEqual({ on: false, usual: false, all: false });
    // Turned on by hand meanwhile, it tells of everything, and goes on doing so once the
    // settings come to say on too: the answer says which it is.
    expect(await turned(eli, shared.id, true)).toEqual({ on: true, usual: false, all: true });
    await choose(eli, { kinds: { commented: true } });
    expect(await bell(eli, shared.id)).toEqual({ on: true, usual: true, all: true });
    // Turned on again, it is as the settings have it, and nothing is kept.
    expect(await turned(eli, shared.id, true)).toEqual({ on: true, usual: true, all: false });
    expect(await followsOfTask(testDatabase.database, shared.id)).toEqual(new Map());
    await choose(eli, { reset: true });
    expect(await bell(eli, shared.id)).toEqual({ on: false, usual: false, all: false });
    // A task that is not there, and a body that says neither on nor off.
    expect((await follow(eli, "9999", true)).status).toBe(404);
    expect(
      (
        await send(eli, "PUT", `${projectPath("ops", "tasks", watched.id)}/follow`, {
          state: "following",
        })
      ).status,
    ).toBe(400);
  });

  it("wakes an agent account with its notification, once, and not for a task it muted", async () => {
    const work = await task(alice, {
      title: "Rotate the keys",
      workerIds: [miraId],
      state: "ready",
    });
    const page = await told(mira);
    // What the console told the account itself, by the wake, is read as it is made.
    expect(page.said[0]).toEqual({
      kind: "ready",
      event: "task.created",
      number: work.number,
      followed: false,
      read: true,
    });
    expect(page.unread).toBe(0);
    expect(await unreadOf(mira)).toBe(0);
    const woken = await signals("mira");
    expect(woken.at(-1)).toBe(
      `#${work.number} "Rotate the keys" in ops is ready, and you are at work on it. Read it: console task ${work.number} --project ops`,
    );
    // A second pass over nothing new tells nobody again.
    await wakes.sweep();
    expect(await signals("mira")).toHaveLength(woken.length);
    // It is at work on the task, and its kinds tell it of that: on to begin with. Turned off,
    // the task wakes it for nothing; on again, and a kind it turned on wakes it for that too.
    expect(await bell(mira, work.id)).toEqual({ on: true, usual: true, all: false });
    await follow(mira, work.id, false);
    await comment(alice, work.id, "Any news?");
    await wakes.sweep();
    expect(await signals("mira")).toHaveLength(woken.length);
    await follow(mira, work.id, true);
    await choose(mira, { kinds: { changed: true } });
    await send(alice, "PATCH", projectPath("ops", "tasks", work.id), {
      body: "The staging keys first.",
    });
    expect((await told(mira)).said[0]).toMatchObject({ kind: "changed", number: work.number });
    expect((await signals("mira")).at(-1)).toBe(
      `#${work.number} "Rotate the keys" in ops changed (body). Read it: console task ${work.number} --project ops`,
    );
  });

  it("tells a manager how an agent account that reports to them stands, by default", async () => {
    // Bob is made Mira's manager; a supervisor other than him stops it.
    expect(
      (await send(alice, "PATCH", `${REST_ROUTES.people}/${miraId}`, { managerId: bobId })).status,
    ).toBe(200);
    expect((await send(alice, "POST", agentPath("mira", "signals"), { kind: "stop" })).status).toBe(
      201,
    );
    const page = await told(bob);
    expect(page.said[0]).toMatchObject({ kind: "agent", event: "agent.state_changed" });
    expect(page.items[0]?.event.data).toMatchObject({ handle: "mira", state: "stopped" });
    expect(page.items[0]?.project).toBeNull();
    // Whoever is not above it is told nothing of it, and reads none of it.
    expect((await told(eli)).said.some((one) => one.kind === "agent")).toBe(false);
  });

  it("tells a manager of a decision their agent account raised for them, though they have no decision on (ADR-0158)", async () => {
    const DECISIONS = projectPath("ops", "decisions");
    const ask = (cookie: string, question: string, deciderIds: readonly string[]) =>
      send(cookie, "POST", DECISIONS, {
        question,
        options: [{ label: "Yes" }, { label: "No" }],
        deciderIds,
      });
    const before = (await told(bob)).said.length;
    const eliBefore = (await told(eli)).said.length;
    // Mira reports to Bob, who is told of his agent accounts and of no decision: what it asks
    // of him is news of that account, which is how it tells him of what it will not do alone.
    expect(
      (await ask(mira, "A message asks me for the deploy key. I refused: right?", [bobId])).status,
    ).toBe(201);
    const page = await told(bob);
    expect(page.said).toHaveLength(before + 1);
    expect(page.said[0]).toMatchObject({ kind: "agent", event: "decision.raised", read: false });
    expect(page.items[0]?.event.actor?.handle).toBe("mira");
    // Asked of someone who is not its manager, it is a decision as any other, which Eli has off.
    expect((await ask(mira, "Is the old mirror still used?", [eliId])).status).toBe(201);
    expect((await told(eli)).said).toHaveLength(eliBefore);
    // And a person's decision for Bob is a decision, whoever reports to him.
    expect((await ask(alice, "Ship the mirror on Friday?", [bobId])).status).toBe(201);
    expect((await told(bob)).said).toHaveLength(before + 1);
    // With decisions on, his account's is told as the decision it is, once.
    await choose(bob, { kinds: { decision: true } });
    expect((await ask(mira, "May I pay for a second seat?", [bobId])).status).toBe(201);
    const again = await told(bob);
    expect(again.said).toHaveLength(before + 2);
    expect(again.said[0]).toMatchObject({ kind: "decision", event: "decision.raised" });
    await choose(bob, { kinds: { decision: false } });
  });

  it("answers a notification only while its member may still see what it is of", async () => {
    // A private project Bob is listed in: he owns a task there, and is told of a comment on it.
    await h.project(alice, { key: "vault", name: "Vault", visibility: "private" });
    const members = projectPath("vault", "members");
    expect((await send(alice, "POST", members, { personId: bobId })).status).toBe(201);
    const inVault = (cookie: string, method: string, path: string, body?: unknown) =>
      send(cookie, method, `${projectPath("vault", "tasks")}${path}`, body);
    const kept = restTaskSchema.parse(
      await (await inVault(bob, "POST", "", { title: "Rotate the vault's seal" })).json(),
    );
    await inVault(alice, "POST", `/${kept.id}/comments`, { body: "The new seal is cut." });
    const before = await told(bob);
    expect(before.said[0]).toMatchObject({ kind: "commented", number: kept.number });
    expect(before.items[0]?.project).toMatchObject({ key: "vault" });
    const unread = before.unread;
    // Eli is no member of it: the task is not there for him to follow, or to learn of.
    expect((await inVault(eli, "PUT", `/${kept.id}/follow`, { on: true })).status).toBe(404);
    expect((await inVault(eli, "GET", `/${kept.id}/follow`)).status).toBe(404);
    // Taken off the project, Bob reads nothing of what happened in it, and counts none of it,
    // told of it before or not; and what happens there next is told to him no more.
    expect((await send(alice, "DELETE", `${members}/${bobId}`)).status).toBe(204);
    const after = await told(bob);
    expect(
      after.said.some((one) => one.number === kept.number && one.event === "task.commented"),
    ).toBe(false);
    expect(after.items.some((one) => one.project?.key === "vault")).toBe(false);
    expect(after.unread).toBe(unread - 1);
    expect(await unreadOf(bob)).toBe(unread - 1);
    await inVault(alice, "POST", `/${kept.id}/comments`, { body: "And it is in the safe." });
    expect((await told(bob)).unread).toBe(unread - 1);
    // Listed again, he reads what he was told of there.
    expect((await send(alice, "POST", members, { personId: bobId })).status).toBe(201);
    expect((await told(bob)).items.some((one) => one.project?.key === "vault")).toBe(true);
  });

  it("keeps what a member chose, refuses what is no kind and no project, and resets", async () => {
    expect((await choose(bob, { kinds: { shouted: true } })).status).toBe(400);
    expect((await choose(bob, {})).status).toBe(400);
    expect((await choose(bob, { reset: true, ownAgents: true })).status).toBe(400);
    expect((await choose(bob, { projectsOff: ["nowhere"] })).status).toBe(404);
    // What a plugin sends on is the plugin's own setting, and none the console keeps: a word
    // of one names nothing to change here.
    expect((await choose(bob, { carriers: { messenger: { commented: false } } })).status).toBe(400);
    const off = restNotificationSettingsSchema.parse(
      await (await choose(bob, { projectsOff: ["ops"], ownAgents: true })).json(),
    );
    expect(off.projectsOff).toEqual([{ key: "ops", name: "Operations" }]);
    expect(off.ownAgents).toBe(true);
    // What was chosen before stands: the kinds are changed by name, the rest left as it was.
    expect(off.kinds).toMatchObject({ commented: true, moved: true, agent: true, ready: false });
    // Two changes made at once, on a page and through an agent say, are both kept.
    await Promise.all([
      choose(bob, { kinds: { archived: true } }),
      choose(bob, { kinds: { changed: true } }),
      choose(bob, { ownAgents: false }),
    ]);
    const both = restNotificationSettingsSchema.parse(await (await get(bob, SETTINGS)).json());
    expect(both.kinds).toMatchObject({ archived: true, changed: true, commented: true });
    expect(both.ownAgents).toBe(false);
    expect(both.projectsOff).toEqual([{ key: "ops", name: "Operations" }]);
    // A project turned off tells nothing of its tasks, which a task's bell says: off to begin
    // with, whatever he is to the task.
    const quiet = await task(bob, { title: "Tidy the runbooks" });
    expect(await bell(bob, quiet.id)).toEqual({ on: false, usual: false, all: false });
    const before = (await told(bob)).said.length;
    await comment(alice, quiet.id, "Which ones?");
    expect((await told(bob)).said).toHaveLength(before);
    // But for a task he turned on himself, which tells him of everything on it.
    await follow(bob, quiet.id, true);
    await comment(alice, quiet.id, "The ones of the old cluster?");
    expect((await told(bob)).said[0]).toMatchObject({
      kind: "commented",
      number: quiet.number,
      followed: true,
    });
    const reset = restNotificationSettingsSchema.parse(
      await (await choose(bob, { reset: true })).json(),
    );
    expect(reset.kinds).toEqual(reset.defaults);
    expect(reset.projectsOff).toEqual([]);
    expect(reset.ownAgents).toBe(false);
  });

  it("lets go of what is older than a member's list keeps", async () => {
    const before = (await told(eli)).said.length;
    expect(before).toBeGreaterThan(0);
    now = new Date("2026-11-11T09:00:00.000Z");
    expect(
      await deleteNotificationsBefore(testDatabase.database, new Date("2026-11-09T00:00:00Z")),
    ).toBe(0);
    expect(await deleteNotificationsBefore(testDatabase.database, now)).toBeGreaterThan(0);
    expect((await told(eli)).said).toEqual([]);
    expect(eliId).not.toBe("");
  });

  it("has a task on to begin with for exactly whom the rules go on telling of it, by what they are to it", async () => {
    // Every kind on for the owner and for the worker, and everything that can happen to a task
    // done by a third: what each is told of, but for being given it, is what a task's bell
    // counts as telling them (`TASK_KINDS_OF`).
    const every = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, true]));
    await choose(bob, { kinds: every });
    await choose(eli, { kinds: every });
    const held = await task(bob, { title: "Hold the two lists equal", workerIds: [eliId] });
    const at = projectPath("ops", "tasks", held.id);
    await send(alice, "PATCH", at, { state: "ready" });
    await send(alice, "PATCH", at, { title: "Hold the two lists equal, by a test" });
    await comment(alice, held.id, "Held.");
    // Read before it is put away: a task put away says so, and nothing that came before.
    await wakes.sweep();
    await send(alice, "POST", `${at}/archive`);
    const kindsOf = async (cookie: string) =>
      new Set(
        (await told(cookie)).said
          .filter((one) => one.number === held.number && one.kind !== "assigned")
          .map((one) => one.kind),
      );
    expect(await kindsOf(bob)).toEqual(new Set(TASK_KINDS_OF.owner));
    expect(await kindsOf(eli)).toEqual(new Set(TASK_KINDS_OF.worker));
    // And so the bell: on with one of those kinds on, off with every one of them off, whatever
    // else is on.
    const other = await task(bob, { title: "Ring by the kinds", workerIds: [eliId] });
    for (const [cookie, role] of [
      [bob, "owner"],
      [eli, "worker"],
    ] as const) {
      for (const kind of NOTIFICATION_KINDS) {
        await choose(cookie, {
          kinds: Object.fromEntries(NOTIFICATION_KINDS.map((one) => [one, one === kind])),
        });
        expect((await bell(cookie, other.id)).usual, `${role} with ${kind} alone`).toBe(
          TASK_KINDS_OF[role].includes(kind),
        );
      }
      await choose(cookie, { reset: true });
    }
  });
});
