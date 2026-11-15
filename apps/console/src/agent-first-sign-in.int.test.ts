import {
  REST_ROUTES,
  restAgentSchema,
  restAgentsSchema,
  restErrorSchema,
  restMeSchema,
} from "@skillcdn/console/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "./db/testing.js";
import {
  createFixtureOrganization,
  type FixtureOrganization,
} from "./testing/fixture-organization.js";
import { createFixtureProvider } from "./testing/fixture-provider.js";
import { createHarness, type Harness, SIGN_IN_URL } from "./testing/harness.js";

// What the first sign-in of an agent account is held to at a git host (ADR-0126), where a login
// is whoever's registers it: the account the organization said its login is when it was added,
// by the host's id of it; else the organization's word at that sign-in. On a database of its
// own, with an organization the console reads. The provider answers as the host does when
// someone signs in, which is after whatever the test says happened at the host meanwhile.

let testDatabase: TestDatabase;
let h: Harness;
let organization: FixtureOrganization;
let alice: string;

const JSON_HEADERS = { "content-type": "application/json" };
const get = (cookie: string, path: string) => h.request(path, { headers: { cookie } });
const post = (cookie: string, path: string, body: unknown) =>
  h.request(path, {
    method: "POST",
    headers: { cookie, origin: SIGN_IN_URL, ...JSON_HEADERS },
    body: JSON.stringify(body),
  });
const add = (fields: { readonly login: string; readonly handle: string }) =>
  post(alice, REST_ROUTES.agents, { host: "gh", name: "An agent", project: "ops", ...fields });
const meOf = async (cookie: string) => {
  const { person } = restMeSchema.parse(await (await get(cookie, REST_ROUTES.me)).json());
  if (person === null) {
    throw new Error("the cookie carries nobody's session");
  }
  return person;
};
/** The agent account as the administrator reads it. */
const agentOf = async (handle: string) =>
  restAgentSchema.parse(await (await get(alice, `${REST_ROUTES.agents}/${handle}`)).json());
const refused = /sign_in=refused/;

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  organization = createFixtureOrganization({
    Alice: "1001",
    bob: "1002",
    "acme-mira": "1101",
    "acme-otis": "1103",
  });
  h = createHarness(testDatabase, {
    providers: [
      createFixtureProvider("gh", {
        changed: {
          // The organization's own account, as the host calls it by the time it signs in:
          // renamed since the console was told of it.
          "acme-mira": { login: "acme-mira-2" },
          // Another account of the host, which registered the name the renaming left free.
          gus: { accountId: "9001", login: "acme-mira" },
          // Accounts that hold a name the organization has no member of when it is added.
          eli: { accountId: "9002", login: "acme-juno" },
          dana: { accountId: "9003", login: "acme-wren" },
        },
      }),
    ],
    organization,
    admins: ["alice"],
    listed: [],
  });
  alice = await h.signIn("alice");
  await h.project(alice, { key: "ops", name: "Operations", visibility: "private" });
});

afterAll(async () => {
  await testDatabase?.drop();
});

describe("an agent account's first sign-in at a git host (ADR-0126)", () => {
  it("is the account the organization said its login is, and nobody else's who carries the name", async () => {
    const made = await add({ login: "acme-mira", handle: "mira" });
    expect(made.status).toBe(201);
    const agent = restAgentSchema.parse(await made.json());
    expect(agent.person).toMatchObject({ login: "acme-mira", kind: "agent", invited: true });
    // The host was asked once, and said which account the login is.
    expect(agent.firstSignIn).toBe("account");
    expect(organization.calls.findMember).toBe(1);
    expect((await agentOf("mira")).firstSignIn).toBe("account");
    const listed = restAgentsSchema.parse(await (await get(alice, REST_ROUTES.agents)).json());
    expect(listed.items.map((item) => [item.person.handle, item.firstSignIn])).toEqual([
      ["mira", "account"],
    ]);

    // At the host the organization's account is renamed, and someone else registers the name.
    organization.members.delete("acme-mira");
    organization.members.set("acme-mira-2", "1101");
    // The name under another id of the host is refused, as anyone nothing lets in is, and
    // nothing is written; whether or not the organization can be asked.
    await expect(h.signIn("gus")).rejects.toThrow(refused);
    organization.unreachable(true);
    await expect(h.signIn("gus")).rejects.toThrow(refused);
    organization.unreachable(false);
    // Even where the organization takes that other account in under the name: while the agent
    // account waits for its own, the name is not a way in.
    organization.members.set("acme-mira", "9001");
    await expect(h.signIn("gus")).rejects.toThrow(refused);
    expect((await agentOf("mira")).person).toMatchObject({ login: "acme-mira", invited: true });
    expect((await agentOf("mira")).firstSignIn).toBe("account");

    // The account itself is let in under the name it carries now, and is the row the
    // administrator made: bound by the host's id, not by what it is called.
    const mira = await h.signIn("acme-mira");
    const signedIn = await meOf(mira);
    expect(signedIn).toMatchObject({
      id: agent.person.id,
      kind: "agent",
      handle: "mira",
      login: "acme-mira-2",
    });
    expect(signedIn.invited).toBeUndefined();
    // Once it has signed in, nothing is held any more, and the name's new holder, whom the
    // organization has as a member, is a person of their own.
    expect((await agentOf("mira")).firstSignIn).toBeUndefined();
    const gus = await meOf(await h.signIn("gus"));
    expect(gus).toMatchObject({ login: "acme-mira", kind: "person", source: "organization" });
    expect(gus.id).not.toBe(agent.person.id);
  });

  it("is let in as itself where nothing changed at the host", async () => {
    const made = await add({ login: "acme-otis", handle: "otis" });
    expect(made.status).toBe(201);
    const agent = restAgentSchema.parse(await made.json());
    expect(agent.firstSignIn).toBe("account");
    expect(await meOf(await h.signIn("acme-otis"))).toMatchObject({
      id: agent.person.id,
      kind: "agent",
      handle: "otis",
      login: "acme-otis",
    });
  });

  it("is not confirmed where the organization has no member called so, and is let in once it has", async () => {
    const made = await add({ login: "acme-juno", handle: "juno" });
    expect(made.status).toBe(201);
    const agent = restAgentSchema.parse(await made.json());
    expect(agent.person).toMatchObject({ login: "acme-juno", invited: true });
    expect(agent.firstSignIn).toBe("member");
    // Whoever holds the login at the host is not let in on the name alone: the organization
    // does not have it as a member.
    await expect(h.signIn("eli")).rejects.toThrow(refused);
    expect((await agentOf("juno")).person.invited).toBe(true);
    // Nor while the organization cannot be asked: nothing vouches for the login then.
    organization.unreachable(true);
    await expect(h.signIn("eli")).rejects.toThrow(refused);
    organization.unreachable(false);
    expect((await agentOf("juno")).person.invited).toBe(true);
    // The organization takes the account in: its word at the sign-in binds it.
    organization.members.set("acme-juno", "9002");
    const juno = await h.signIn("eli");
    expect(await meOf(juno)).toMatchObject({ id: agent.person.id, kind: "agent", handle: "juno" });
    expect((await agentOf("juno")).firstSignIn).toBeUndefined();
  });

  it("is added not confirmed while the host cannot be asked", async () => {
    organization.members.set("acme-wren", "9003");
    organization.unreachable(true);
    const made = await add({ login: "acme-wren", handle: "wren" });
    organization.unreachable(false);
    expect(made.status).toBe(201);
    const agent = restAgentSchema.parse(await made.json());
    expect(agent.firstSignIn).toBe("member");
    expect(h.logs.some((line) => String(line.msg).includes("it is added not confirmed"))).toBe(
      true,
    );
    // The organization has it as a member at its sign-in, which binds it.
    const wren = await h.signIn("dana");
    expect(await meOf(wren)).toMatchObject({ id: agent.person.id, kind: "agent", handle: "wren" });
  });

  it("finds the member an account already is, whatever they are called here", async () => {
    // Bob signed in as `bob`; the host has since renamed the account, and the console has not
    // seen him sign in again. An agent account named by the new login is that member, and is
    // made one only where that is asked for (ADR-0104): never a second row for one account.
    const bob = await h.signIn("bob");
    const bobId = (await meOf(bob)).id;
    organization.members.delete("bob");
    organization.members.set("bobby", "1002");
    const made = await add({ login: "bobby", handle: "pax" });
    expect(made.status).toBe(409);
    expect(restErrorSchema.parse(await made.json()).error.code).toBe("agent.login_is_member");
    expect((await meOf(bob)).id).toBe(bobId);
  });
});
