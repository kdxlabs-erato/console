import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pluginPath, REST_ROUTES, restErrorSchema, restPluginsSchema } from "@skillcdn/console/api";
import { sql } from "drizzle-orm";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgBlobStore } from "../adapters/pg-blob-store.js";
import { createSecrets } from "../auth/secrets.js";
import { createDatabase, type Database, drizzleOf } from "../db/client.js";
import { findPerson, type PersonRecord } from "../db/queries/people.js";
import { enableInstall, findInstall } from "../db/queries/plugins.js";
import { ensureWorkspace, type WorkspaceRecord } from "../db/queries/workspaces.js";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "../db/testing.js";
import { discoverPlugins } from "../plugins/discovery.js";
import { PluginHost } from "../plugins/host.js";
import { allowedReadRoots } from "../plugins/paths.js";
import { RecordStore } from "../plugins/records.js";
import { type Invoker, Plugins } from "../plugins/registry.js";
import { PluginSqlService } from "../plugins/sql.js";
import { createFixtureProvider } from "../testing/fixture-provider.js";
import { createHarness, type Harness, SIGN_IN_URL } from "../testing/harness.js";
import {
  HOST_ENTRY,
  hostEnvironment,
  SQL_PLUGIN_DIR,
  writePluginsDir,
} from "../testing/plugins.js";

// A plugin with a schema of its own, end to end: enabled with consent to storage:sql, its schema
// and role made and its migrations applied, its commands running statements as the role through
// ctx.sql, held to the role's rights and the bounds, and nothing left of the schema after purge.

let testDatabase: TestDatabase;
let root: string;
let plugins: Plugins;
let h: Harness;
let admin: string;
let alice: PersonRecord;

const json = (body: unknown, cookie: string): RequestInit => ({
  method: "POST",
  headers: { cookie, origin: SIGN_IN_URL, "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function schemaExists(): Promise<boolean> {
  const result = await drizzleOf(testDatabase.database).execute<{ n: number }>(
    sql`select count(*)::int as n from pg_namespace where nspname = 'plugin_tally'`,
  );
  return result.rows[0]?.n === 1;
}

const logger = pino({ level: "warn" }, { write: () => {} });
const provider = createFixtureProvider("gh");
let workspace: WorkspaceRecord;

/** The plugins of a console whose plugins' schemas are made by `sqlService`, in a host of their own, started. */
async function pluginsWith(sqlService: PluginSqlService): Promise<Plugins> {
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
  const made = new Plugins({
    database: testDatabase.database,
    workspace: async () => workspace,
    host,
    discovery: await discoverPlugins(root),
    memoryMb: 64,
    secrets: createSecrets("a secret for tests, long enough to be one"),
    records: new RecordStore({
      database: testDatabase.database,
      blobs: createPgBlobStore(testDatabase.database),
      clock: { now: () => new Date() },
      fileBytesAtMost: undefined,
    }),
    sql: sqlService,
    clock: { now: () => new Date() },
    logger,
    timeouts: { command: 15_000, query: 5_000, lifecycle: 5_000 },
  });
  holder.current = made;
  await host.start();
  await made.start();
  return made;
}

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  root = await writePluginsDir(await mkdtemp(join(tmpdir(), "console-plugin-sql-")), [
    { name: "console-plugin-tally", dir: SQL_PLUGIN_DIR },
  ]);
  h = createHarness(testDatabase, { providers: [provider], admins: ["alice"] });
  admin = await h.signIn("alice");
  workspace = await ensureWorkspace(testDatabase.database, { name: "Acme", now: new Date() });
  const me = (await (await h.request(REST_ROUTES.me, { headers: { cookie: admin } })).json()) as {
    person: { id: string };
  };
  const found = await findPerson(testDatabase.database, workspace.id, me.person.id);
  if (found === undefined) {
    throw new Error("alice is not a person");
  }
  alice = found;
  plugins = await pluginsWith(
    new PluginSqlService({
      database: testDatabase.database,
      connectionString: testDatabase.connectionString,
      ca: undefined,
      logger,
    }),
  );
  h = createHarness(testDatabase, { providers: [provider], admins: ["alice"], plugins });
}, 120_000);

afterAll(async () => {
  await plugins?.stop();
  await h?.close();
  await testDatabase?.drop();
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true });
  }
});

const invoker = (): Invoker => ({
  person: alice,
  actor: { id: alice.id },
  agent: undefined,
  run: undefined,
  project: undefined,
  language: "en",
});

describe("a plugin with a schema of its own, where the console may not close the schema public", () => {
  // As an operator may set a console up: the database is another's, and the console's user may
  // make roles and use `public` through PUBLIC, which only the schema's owner may take from it
  // (ADR-0133). It runs first, while the database is as it was made; its role is this run's.
  const run = randomBytes(4).toString("hex");
  const user = `console_test_${run}_user`;
  const password = randomBytes(18).toString("base64url");
  const statement = `GRANT USAGE, CREATE ON SCHEMA "public" TO "${user}"; REVOKE ALL ON SCHEMA "public" FROM PUBLIC;`;
  let userDatabase: Database | undefined;
  let refusing: Plugins | undefined;
  let refusingHarness: Harness | undefined;

  beforeAll(async () => {
    const operator = drizzleOf(testDatabase.database);
    await operator.execute(
      sql.raw(`create role "${user}" with login createrole password '${password}'`),
    );
    await operator.execute(sql.raw(`grant create on schema public to "${user}"`));
    const url = new URL(testDatabase.connectionString);
    url.username = user;
    url.password = password;
    userDatabase = createDatabase({ connectionString: url.href, maxConnections: 2 });
    // Enabled before, on a console that could: this start is the next boot.
    const tally = (await discoverPlugins(root)).plugins.find((plugin) => plugin.key === "tally");
    if (tally === undefined) {
      throw new Error("the fixture is not there");
    }
    await enableInstall(testDatabase.database, {
      workspaceId: workspace.id,
      key: "tally",
      packageName: tally.packageName,
      version: tally.version,
      dataVersion: tally.manifest.dataVersion,
      consent: ["storage:sql"],
      boardProjectId: undefined,
      projects: "all",
      settings: {},
      name: "Tally",
      actor: { id: alice.id },
      now: new Date(),
    });
    refusing = await pluginsWith(
      new PluginSqlService({
        database: userDatabase,
        connectionString: url.href,
        ca: undefined,
        logger,
      }),
    );
    refusingHarness = createHarness(testDatabase, {
      providers: [provider],
      admins: ["alice"],
      plugins: refusing,
    });
  }, 120_000);

  afterAll(async () => {
    await refusing?.stop();
    await refusingHarness?.close();
    await userDatabase?.close();
    const operator = drizzleOf(testDatabase.database);
    await operator.execute(sql.raw(`revoke all on schema public from "${user}"`));
    await operator.execute(sql.raw(`drop role if exists "${user}"`));
  });

  it("holds an enabled plugin failed at start, with what the database's owner runs as its problem", async () => {
    const detail = await refusing?.get("tally", alice);
    expect(detail?.problems).toEqual([expect.stringContaining(`once: ${statement}`)]);
    const failed = await drizzleOf(testDatabase.database).execute<{ problem: string }>(
      sql`select data->>'problem' as problem from events where kind = 'plugin.failed' and data->>'key' = 'tally'`,
    );
    expect(failed.rows).toEqual([{ problem: expect.stringContaining(`once: ${statement}`) }]);
    expect(await schemaExists()).toBe(false);
    await expect(
      refusing?.invoke("tally", "command", "count", {}, invoker()),
    ).rejects.toMatchObject({ code: "plugin.unavailable" });
  });

  it("is refused enabling in the same words, and left disabled with nothing made", async () => {
    const cookie = await refusingHarness?.signIn("alice");
    const refused = await refusingHarness?.request(
      pluginPath("tally", "enable"),
      json({ consent: ["storage:sql"], board: null, projects: "all" }, cookie ?? ""),
    );
    expect(refused?.status).toBe(503);
    const body = restErrorSchema.parse(await refused?.json());
    expect(body.error.code).toBe("plugin.unavailable");
    expect(body.error.message).toContain(`The database's owner runs, once: ${statement}`);
    expect(await schemaExists()).toBe(false);
    expect((await findInstall(testDatabase.database, workspace.id, "tally"))?.state).toBe(
      "disabled",
    );
    const usage = await drizzleOf(testDatabase.database).execute<{ everyone: boolean }>(sql`
      select exists (select 1 from aclexplode(n.nspacl) a where a.grantee = 0) as everyone
      from pg_namespace n where n.nspname = 'public'`);
    expect(usage.rows).toEqual([{ everyone: true }]);
  });
});

describe("a plugin with a schema of its own", () => {
  it("says the deployment may give one, and is enabled only with consent to storage:sql", async () => {
    const listed = restPluginsSchema.parse(
      await (await h.request(REST_ROUTES.plugins, { headers: { cookie: admin } })).json(),
    );
    expect(listed.sql).toBe(true);
    expect(listed.items.map((plugin) => [plugin.key, plugin.capabilities])).toEqual([
      ["tally", ["storage:sql"]],
    ]);
    const refused = await h.request(
      pluginPath("tally", "enable"),
      json({ consent: [], board: null, projects: "all" }, admin),
    );
    expect(refused.status).toBe(409);
    expect(restErrorSchema.parse(await refused.json()).error.code).toBe("plugin.needs_consent");
    expect(await schemaExists()).toBe(false);
    const enabled = await h.request(
      pluginPath("tally", "enable"),
      json({ consent: ["storage:sql"], board: null, projects: "all" }, admin),
    );
    expect(enabled.status).toBe(200);
    expect(await schemaExists()).toBe(true);
  });

  it("runs the plugin's statements as its role, within its schema and the bounds", async () => {
    expect((await plugins.invoke("tally", "command", "tally", {}, invoker())).text).toBe(
      "tallied 1",
    );
    expect((await plugins.invoke("tally", "command", "count", {}, invoker())).text).toBe("1");
    expect((await plugins.invoke("tally", "command", "both", {}, invoker())).text).toBe("3");
    await expect(plugins.invoke("tally", "command", "peek", {}, invoker())).rejects.toMatchObject({
      code: "plugin.invalid_args",
      message: expect.stringContaining("permission denied"),
    });
    await expect(plugins.invoke("tally", "command", "flood", {}, invoker())).rejects.toMatchObject({
      code: "plugin.too_many",
    });
    const events = (await (
      await h.request(pluginPath("tally", "events"), { headers: { cookie: admin } })
    ).json()) as {
      items: { kind: string; data: { command?: string; outcome?: string } }[];
    };
    const outcomes = events.items
      .filter((event) => event.kind === "plugin.command")
      .map((event) => [event.data.command, event.data.outcome]);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        ["tally", "ok"],
        ["peek", "refused"],
        ["flood", "refused"],
      ]),
    );
  });

  it("drops the schema and the role on purge", async () => {
    expect((await h.request(pluginPath("tally", "disable"), json({}, admin))).status).toBe(200);
    expect(await schemaExists()).toBe(true);
    expect(
      (await h.request(pluginPath("tally", "purge"), json({ confirm: "tally" }, admin))).status,
    ).toBe(204);
    expect(await schemaExists()).toBe(false);
    const roles = await drizzleOf(testDatabase.database).execute<{ n: number }>(
      sql`select count(*)::int as n from pg_roles where rolname = 'plugin_tally'`,
    );
    expect(roles.rows[0]?.n).toBe(0);
  });
});
