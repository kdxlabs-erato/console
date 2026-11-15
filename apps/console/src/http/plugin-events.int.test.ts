import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import {
  pluginPath,
  projectPath,
  REST_ROUTES,
  type RestEvent,
  type RestEvents,
  restEventsSchema,
  restPluginDetailSchema,
  restTokenCreatedSchema,
} from "@skillcdn/console/api";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgBlobStore } from "../adapters/pg-blob-store.js";
import { createSecrets } from "../auth/secrets.js";
import { ensureWorkspace } from "../db/queries/workspaces.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "../db/testing.js";
import { discoverPlugins } from "../plugins/discovery.js";
import { PluginHost } from "../plugins/host.js";
import { allowedReadRoots } from "../plugins/paths.js";
import { RecordStore } from "../plugins/records.js";
import { Plugins } from "../plugins/registry.js";
import { createFixtureProvider } from "../testing/fixture-provider.js";
import { createHarness, type Harness, SIGN_IN_URL } from "../testing/harness.js";
import {
  GATE_PLUGIN_DIR,
  HELLO_PLUGIN_DIR,
  HOST_ENTRY,
  hostEnvironment,
  writePluginsDir,
} from "../testing/plugins.js";

// Who reads a plugin's events (docs/specs/plugins.md, "REST", `GET .../events`): an
// administrator every one; anyone else those of a project they may see, as that project's feed
// shows them, and of what belongs to no project their own doing and what the console says of
// the plugin with nobody in it. Two plugins against a real database and a real host: `gate`,
// whose events are its private board project's, and `hello`, which has no board project. Needs
// PostgreSQL, the compiled host and the example plugin built.

let testDatabase: TestDatabase;
let root: string;
let plugins: Plugins;
let h: Harness;
let alice: string;
let bob: string;
let carol: string;
let carolId: string;

const BOARD = "gate-board";

const json = (body: unknown, cookie: string, method = "POST"): RequestInit => ({
  method,
  headers: { cookie, origin: SIGN_IN_URL, "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Runs a command of a plugin as the person, by its words. */
async function run(key: string, cookie: string, argv: readonly string[]): Promise<void> {
  const response = await h.request(pluginPath(key, "invoke"), json({ argv }, cookie));
  expect(response.status, await response.clone().text()).toBe(200);
}

/** A page of a plugin's events as whoever the headers carry reads it. */
async function page(key: string, headers: Record<string, string>, query = ""): Promise<RestEvents> {
  const response = await h.request(`${pluginPath(key, "events")}${query}`, { headers });
  expect(response.status, await response.clone().text()).toBe(200);
  return restEventsSchema.parse(await response.json());
}

const events = async (key: string, cookie: string, query = ""): Promise<RestEvent[]> =>
  (await page(key, { cookie }, query)).items;

/** An event in a word: its kind, and who did it. */
const said = (event: RestEvent): string =>
  `${event.kind} ${event.actor?.login.toLowerCase() ?? "console"}`;

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  root = await writePluginsDir(await mkdtemp(join(tmpdir(), "console-plugin-events-")), [
    { name: "console-plugin-hello", dir: HELLO_PLUGIN_DIR },
    { name: "console-plugin-gate", dir: GATE_PLUGIN_DIR },
  ]);
  const logger = pino({ level: "warn" }, { write: () => {} });
  const holder: { current: Plugins | undefined } = { current: undefined };
  const host = new PluginHost({
    entry: HOST_ENTRY,
    allowRead: await allowedReadRoots(root),
    env: hostEnvironment(process.env),
    logger,
    onContext: (call) =>
      holder.current === undefined
        ? Promise.reject(new Error("not started"))
        : holder.current.contextHandler(call),
  });
  const provider = createFixtureProvider("gh");
  h = createHarness(testDatabase, { providers: [provider], admins: ["alice"] });
  alice = await h.signIn("alice");
  bob = await h.signIn("bob");
  carol = await h.signIn("carol");
  const me = async (cookie: string) =>
    (
      (await (await h.request(REST_ROUTES.me, { headers: { cookie } })).json()) as {
        person: { id: string };
      }
    ).person.id;
  const bobId = await me(bob);
  carolId = await me(carol);
  const workspace = await ensureWorkspace(testDatabase.database, { name: "Acme", now: new Date() });
  const clock = { now: () => new Date() };
  plugins = new Plugins({
    database: testDatabase.database,
    workspace: async () => workspace,
    host,
    discovery: await discoverPlugins(root),
    memoryMb: 64,
    secrets: createSecrets("a secret for tests, long enough to be one"),
    records: new RecordStore({
      database: testDatabase.database,
      blobs: createPgBlobStore(testDatabase.database),
      clock,
      fileBytesAtMost: undefined,
    }),
    clock,
    logger,
    timeouts: { command: 5_000, query: 5_000, endpoint: 5_000, lifecycle: 5_000 },
  });
  holder.current = plugins;
  await host.start();
  await plugins.start();
  h = createHarness(testDatabase, { providers: [provider], admins: ["alice"], plugins });

  // Gate, on a private board project of its own: bob is listed in it, carol is not.
  const gate = await h.request(
    pluginPath("gate", "enable"),
    json(
      {
        consent: ["endpoints", "files"],
        board: {
          create: { key: BOARD, name: "Gate board", description: "Where the gate decides." },
        },
        projects: [BOARD],
      },
      alice,
    ),
  );
  expect(gate.status, await gate.clone().text()).toBe(200);
  expect(restPluginDetailSchema.parse(await gate.json()).board?.key).toBe(BOARD);
  const listed = await h.request(
    projectPath(BOARD, "members"),
    json({ personId: bobId, role: "member" }, alice),
  );
  expect(listed.status).toBe(201);
  await run("gate", bob, ["plan", "Mend the hinge", "--token", "hush"]);
  await run("gate", alice, ["decide"]);
  const boss = await h.request(
    pluginPath("gate", "grants"),
    json({ role: "boss", person: bobId }, alice),
  );
  expect(boss.status, await boss.clone().text()).toBe(201);

  // Hello, with no board project: what it leaves belongs to no project.
  const hello = await h.request(
    pluginPath("hello", "enable"),
    json({ consent: [], board: null, projects: "all" }, alice),
  );
  expect(hello.status, await hello.clone().text()).toBe(200);
  await run("hello", bob, ["greet", "Dana"]);
  await run("hello", carol, ["greet", "Erin", "--text", "A word between the two of us"]);
  await run("hello", alice, ["greet", "Finn"]);
  await run("hello", bob, ["greet", "Gale"]);
  await run("hello", bob, ["greet", "Hugo"]);
  // The console's own word of the plugin, as a job that failed leaves it: nobody's doing.
  await plugins.recordFailure("hello", undefined, "the job tidy failed (plugin.timeout)");
  const greeter = await h.request(
    pluginPath("hello", "grants"),
    json({ role: "greeter", person: carolId }, alice),
  );
  expect(greeter.status, await greeter.clone().text()).toBe(201);
}, 120_000);

afterAll(async () => {
  await plugins?.stop();
  await h?.close();
  await testDatabase?.drop();
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("a plugin's events", () => {
  it("are all an administrator's to read, whatever their project and whoever did them", async () => {
    expect((await events("gate", alice)).map(said)).toEqual([
      "plugin.granted alice",
      "plugin.command alice",
      "plugin.command bob",
      "plugin.enabled alice",
    ]);
    expect((await events("hello", alice)).map(said)).toEqual([
      "plugin.granted alice",
      "plugin.failed console",
      "plugin.command bob",
      "plugin.command bob",
      "plugin.command alice",
      "plugin.command carol",
      "plugin.command bob",
      "plugin.enabled alice",
    ]);
  });

  it("of a private project are read by its members as its feed shows them, and by nobody outside it", async () => {
    // Bob is in the board project: what the route answers him is what the project's own feed does.
    const feed = restEventsSchema.parse(
      await (
        await h.request(`${projectPath(BOARD, "events")}?after=0&limit=100`, {
          headers: { cookie: bob },
        })
      ).json(),
    );
    const ofGate = feed.items.filter((event) => event.plugin === "gate").map((event) => event.id);
    expect(ofGate).toHaveLength(4);
    const forBob = await events("gate", bob);
    expect(forBob.map((event) => event.id)).toEqual([...ofGate].reverse());
    expect(forBob.map(said)).toContain("plugin.command alice");

    // Carol knows of the plugin, which is enabled, and is in no role of its board project: the
    // project's feed is not hers, and neither are its events here, with no word that there are any.
    expect((await h.request(pluginPath("gate"), { headers: { cookie: carol } })).status).toBe(200);
    expect(
      (await h.request(projectPath(BOARD, "events"), { headers: { cookie: carol } })).status,
    ).toBe(404);
    expect(await page("gate", { cookie: carol })).toEqual({ items: [], more: false });
    expect(await page("gate", { cookie: carol }, "?kind=plugin.command&limit=1")).toEqual({
      items: [],
      more: false,
    });
  });

  it("of no project are a member's own, and what the console says of the plugin; never another person's doing", async () => {
    const forBob = await events("hello", bob);
    expect(forBob.map(said)).toEqual([
      "plugin.failed console",
      "plugin.command bob",
      "plugin.command bob",
      "plugin.command bob",
    ]);
    expect(forBob[0]?.data.problem).toBe("the job tidy failed (plugin.timeout)");
    // Carol's command and its words, the administrator's, who enabled the plugin and whom a
    // role went to: none of it is bob's to read.
    const text = JSON.stringify(forBob);
    expect(text).not.toContain("Erin");
    expect(text).not.toContain("A word between the two of us");
    expect(text).not.toContain("Finn");
    expect(text).not.toContain("greeter");

    const forCarol = await events("hello", carol);
    expect(forCarol.map(said)).toEqual(["plugin.failed console", "plugin.command carol"]);
    expect(forCarol[1]?.data.args).toMatchObject({ to: "Erin" });
  });

  it("keep the kind and the paging under what the reader may see", async () => {
    // Of one kind: bob's three commands and no other person's, two a page.
    const first = await page("hello", { cookie: bob }, "?kind=plugin.command&limit=2");
    expect(first.items.map(said)).toEqual(["plugin.command bob", "plugin.command bob"]);
    expect(first.more).toBe(true);
    const second = await page("hello", { cookie: bob }, "?kind=plugin.command&limit=2&offset=2");
    expect(second.items.map(said)).toEqual(["plugin.command bob"]);
    expect(second.more).toBe(false);
    expect(await page("hello", { cookie: bob }, "?kind=plugin.granted")).toEqual({
      items: [],
      more: false,
    });

    // Read a page of one at a time, the pages are the whole of what bob may see, in order, with
    // no page left empty by an event that is not his and `more` false exactly at the end.
    const whole = await events("hello", bob);
    const walked: number[] = [];
    for (let offset = 0; offset < 10; offset += 1) {
      const one = await page("hello", { cookie: bob }, `?limit=1&offset=${offset}`);
      expect(one.items).toHaveLength(1);
      walked.push(...one.items.map((event) => event.id));
      if (!one.more) {
        break;
      }
    }
    expect(walked).toEqual(whole.map((event) => event.id));
    expect(await page("hello", { cookie: bob }, `?limit=1&offset=${whole.length}`)).toEqual({
      items: [],
      more: false,
    });
  });

  it("are read with a token as by the person who made it", async () => {
    const tokenOf = async (cookie: string): Promise<Record<string, string>> => {
      const made = await h.request(REST_ROUTES.tokens, json({ name: "Claude Code" }, cookie));
      expect(made.status, await made.clone().text()).toBe(201);
      return { authorization: `Bearer ${restTokenCreatedSchema.parse(await made.json()).secret}` };
    };
    const bobsAgent = await tokenOf(bob);
    for (const key of ["hello", "gate"]) {
      expect(await page(key, bobsAgent)).toEqual(await page(key, { cookie: bob }));
    }
    const carolsAgent = await tokenOf(carol);
    expect(await page("gate", carolsAgent)).toEqual({ items: [], more: false });
    expect((await page("hello", carolsAgent)).items.map(said)).toEqual([
      "plugin.failed console",
      "plugin.command carol",
    ]);
    // An administrator's agent reads what the administrator reads.
    const alicesAgent = await tokenOf(alice);
    for (const key of ["hello", "gate"]) {
      expect(await page(key, alicesAgent)).toEqual(await page(key, { cookie: alice }));
    }
    expect((await h.request(pluginPath("hello", "events"))).status).toBe(401);
  });

  it("are asked for again at every read: listed in the project, its events are the member's from then on", async () => {
    const added = await h.request(
      projectPath(BOARD, "members"),
      json({ personId: carolId, role: "member" }, alice),
    );
    expect(added.status).toBe(201);
    expect((await events("gate", carol)).map(said)).toEqual(
      (await events("gate", alice)).map(said),
    );
  });
});
