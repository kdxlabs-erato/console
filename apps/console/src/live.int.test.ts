import {
  projectPath,
  REST_ROUTES,
  restEventSchema,
  restMeSchema,
  restTokenCreatedSchema,
} from "@skillcdn/console/api";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOf } from "./db/client.js";
import { recordEvent } from "./db/queries/events.js";
import { tasks } from "./db/schema.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "./db/testing.js";
import { createFixtureProvider } from "./testing/fixture-provider.js";
import { createHarness, type Harness, SIGN_IN_URL } from "./testing/harness.js";

// The feed of a project as it happens, as a browser or an agent reads it.

let testDatabase: TestDatabase;
let h: Harness;
let alice: string;
/** The project the tests work in, under its key. */
const IN = projectPath("web");

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  h = createHarness(testDatabase, {
    providers: [createFixtureProvider()],
    live: true,
    feed: { heartbeatMs: 300, pollMs: 60_000 },
  });
  alice = await h.signIn("alice");
  await h.project(alice, { key: "web", name: "The web app", visibility: "workspace" });
});

afterAll(async () => {
  await h?.close();
  await testDatabase?.drop();
});

/** Reads an SSE stream a chunk at a time and hands back what it has seen so far. */
function tail(response: Response) {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("no body to read");
  }
  const decoder = new TextDecoder();
  let text = "";
  let ended = false;
  return {
    /** Waits until the stream has carried `predicate` true, or it ended, or the deadline passes. */
    async until(predicate: (text: string) => boolean, timeoutMs = 5000): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      while (!predicate(text) && !ended) {
        if (Date.now() > deadline) {
          throw new Error(`the stream did not carry what was waited for:\n${text}`);
        }
        const { done, value, timedOut } = await Promise.race([
          reader.read().then((read) => ({ ...read, timedOut: false })),
          new Promise<{ done: true; value: undefined; timedOut: true }>((resolve) =>
            setTimeout(
              () => resolve({ done: true, value: undefined, timedOut: true }),
              deadline - Date.now(),
            ),
          ),
        ]);
        if (value !== undefined) {
          text += decoder.decode(value, { stream: true });
        } else if (done) {
          ended = !timedOut;
          break;
        }
      }
      return text;
    },
    cancel: () => reader.cancel(),
    get text() {
      return text;
    },
    /** Whether the server ended the stream, as against the deadline passing. */
    get ended() {
      return ended;
    },
  };
}

/** The events a stream carried, parsed. */
function eventsOf(text: string) {
  return text
    .split("\n\n")
    .filter((block) => block.includes("data:"))
    .map((block) => {
      const id = /^id: (\d+)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? "";
      return { id: Number(id), event: restEventSchema.parse(JSON.parse(data)) };
    });
}

const writeTask = (title: string) =>
  h.request(`${IN}/tasks`, {
    method: "POST",
    headers: { cookie: alice, origin: SIGN_IN_URL, "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });

describe("the live feed of a project", () => {
  it("carries what happens in it after the cursor as it happens, numbered, with heartbeats between", async () => {
    const stream = await h.request(`${IN}/events/stream?after=0`, {
      headers: { cookie: alice, accept: "text/event-stream" },
    });
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reading = tail(stream);
    // What was there already comes first: the project being made. Who joined the workspace is
    // the workspace's own and not the project's.
    await reading.until((text) => text.includes("project.created"));

    const created = await writeTask("Wake the feed");
    expect(created.status).toBe(201);
    const text = await reading.until((seen) => seen.includes("task.created"));
    const events = eventsOf(text);
    expect(events.map((entry) => entry.event.kind)).toEqual(["project.created", "task.created"]);
    expect(events[1]?.id).toBe(events[1]?.event.id);
    expect(events[1]?.event.data.title).toBe("Wake the feed");
    expect(text).not.toContain("person.joined");

    await reading.until((seen) => seen.includes(": ping"));
    await reading.cancel();
  });

  it("starts where the browser says it was, which wins over the query", async () => {
    const all = await (
      await h.request(`${IN}/events?after=0`, { headers: { cookie: alice } })
    ).json();
    const latest = (all as { items: { id: number }[] }).items.at(-1)?.id ?? 0;
    const stream = await h.request(`${IN}/events/stream?after=0`, {
      headers: { cookie: alice, "last-event-id": String(latest) },
    });
    const reading = tail(stream);
    await writeTask("After the cursor");
    const text = await reading.until((seen) => seen.includes("After the cursor"));
    const events = eventsOf(text);
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBeGreaterThan(latest);
    await reading.cancel();
  });

  it("is read with a token as well as a session, and not for a project the person may not see", async () => {
    const made = await h.request(REST_ROUTES.tokens, {
      method: "POST",
      headers: { cookie: alice, origin: SIGN_IN_URL, "content-type": "application/json" },
      body: JSON.stringify({ name: "a watcher" }),
    });
    expect(made.status).toBe(201);
    const { secret } = restTokenCreatedSchema.parse(await made.json());
    const stream = await h.request(`${IN}/events/stream?after=0`, {
      headers: { authorization: `Bearer ${secret}`, accept: "text/event-stream" },
    });
    expect(stream.status).toBe(200);
    const reading = tail(stream);
    const text = await reading.until((seen) => seen.includes("project.created"));
    expect(eventsOf(text)[0]?.event.kind).toBe("project.created");
    await reading.cancel();
    const nowhere = await h.request(`${projectPath("nothing")}/events/stream?after=0`, {
      headers: { cookie: alice },
    });
    expect(nowhere.status).toBe(404);
  });

  it("ends for a subscriber who may no longer read the project, by the next delivery or heartbeat", async () => {
    // Bob reads a private project as its member, with a token of his own.
    const bob = await h.signIn("bob");
    await h.project(alice, { key: "vault", name: "The vault", visibility: "private" });
    const bobId = restMeSchema.parse(
      await (await h.request(REST_ROUTES.me, { headers: { cookie: bob } })).json(),
    ).person?.id;
    const vault = projectPath("vault");
    const asAlice = (path: string, method: string, body?: unknown) =>
      h.request(path, {
        method,
        headers: { cookie: alice, origin: SIGN_IN_URL, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    expect((await asAlice(`${vault}/members`, "POST", { personId: bobId })).ok).toBe(true);
    const made = await h.request(REST_ROUTES.tokens, {
      method: "POST",
      headers: { cookie: bob, origin: SIGN_IN_URL, "content-type": "application/json" },
      body: JSON.stringify({ name: "a watcher" }),
    });
    const { secret } = restTokenCreatedSchema.parse(await made.json());
    const stream = await h.request(`${vault}/events/stream?after=0`, {
      headers: { authorization: `Bearer ${secret}`, accept: "text/event-stream" },
    });
    expect(stream.status).toBe(200);
    const reading = tail(stream);
    await reading.until((seen) => seen.includes("project.created"));
    // Taken off the project, Bob's stream ends; what happens in it after is not his to read.
    expect((await asAlice(`${vault}/members/${bobId}`, "DELETE")).ok).toBe(true);
    expect((await asAlice(`${vault}/tasks`, "POST", { title: "After Bob left" })).ok).toBe(true);
    const text = await reading.until(() => false, 5000);
    expect(reading.ended).toBe(true);
    expect(text).not.toContain("After Bob left");
  });

  it("shows a page nothing beyond what has settled, and its stream then carries an event numbered before another and committed after it (ADR-0125)", async () => {
    expect((await writeTask("Numbered around")).status).toBe(201);
    expect((await writeTask("Commented on meanwhile")).status).toBe(201);
    const handle = drizzleOf(testDatabase.database);
    const [task] = await handle.select().from(tasks).where(eq(tasks.title, "Numbered around"));
    const [other] = await handle
      .select()
      .from(tasks)
      .where(eq(tasks.title, "Commented on meanwhile"));
    if (task === undefined || other === undefined) {
      throw new Error("the tasks are not there");
    }
    const commentOn = (id: string, body: string) =>
      h.request(`${IN}/tasks/${id}/comments`, {
        method: "POST",
        headers: { cookie: alice, origin: SIGN_IN_URL, "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
    /** The feed as a page reads it to show the board, from which its stream goes on. */
    const shown = async () =>
      (
        (await (
          await h.request(`${IN}/events?latest=true`, { headers: { cookie: alice } })
        ).json()) as { items: { id: number }[] }
      ).items;
    const settled = (await shown()).at(-1)?.id ?? 0;
    // A change that is given its event's number and is slow to commit.
    let numbered: () => void = () => {};
    let commit: () => void = () => {};
    const wasNumbered = new Promise<void>((resolve) => {
      numbered = resolve;
    });
    const mayCommit = new Promise<void>((resolve) => {
      commit = resolve;
    });
    const slow = handle.transaction(async (tx) => {
      await recordEvent(tx, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        kind: "task.commented",
        actor: undefined,
        taskId: task.id,
        data: { number: task.number, title: task.title, excerpt: "Slow to commit", files: 0 },
        now: new Date(),
      });
      numbered();
      await mayCommit;
    });
    let reading: ReturnType<typeof tail> | undefined;
    try {
      await wasNumbered;
      // The next event is numbered after it and committed before it.
      expect((await commentOn(other.id, "Committed first")).status).toBe(201);
      // The page is shown neither, so the number its stream goes on from is before both.
      expect((await shown()).at(-1)?.id).toBe(settled);
      const stream = await h.request(`${IN}/events/stream?after=${settled}`, {
        headers: { cookie: alice, accept: "text/event-stream" },
      });
      reading = tail(stream);
      await reading.until((seen) => seen.includes(": ping"));
      expect(eventsOf(reading.text)).toEqual([]);
    } finally {
      commit();
      await slow;
    }
    // Once the slow change is committed the stream carries both, in the order they were numbered.
    const text = await reading.until((seen) => seen.includes("Committed first"));
    const carried = eventsOf(text);
    expect(carried.map((entry) => entry.event.data.excerpt)).toEqual([
      "Slow to commit",
      "Committed first",
    ]);
    expect(carried.map((entry) => entry.id)).toEqual([settled + 1, settled + 2]);
    await reading.cancel();
  });

  it("ends every stream when the feed closes, so that shutdown can finish", async () => {
    const stream = await h.request(`${IN}/events/stream?after=1000000`, {
      headers: { cookie: alice },
    });
    const reading = tail(stream);
    await reading.until((seen) => seen.includes(": ping"));
    h.feed.close();
    const done =
      (await stream.body?.getReader) === undefined ? "" : await reading.until(() => false, 2000);
    expect(typeof done).toBe("string");
    await h.feed.idle();
    expect(h.feed.size).toBe(0);
  });
});
