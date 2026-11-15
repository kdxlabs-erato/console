import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProviderError } from "../ports/identity-provider.js";
import { createGitHubOrganization } from "./github-organization.js";
import type { FetchLike } from "./upstream.js";

// A key pair of the test's own: the app's private key signs, and the public half checks.
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const T0 = new Date("2026-10-12T10:00:00Z");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const empty = (status: number) => new Response(null, { status });

/** The host's side: the installation, its token, and the members, with every call kept. */
function host(
  members: readonly { id: number; login: string }[],
  options: { tokenLives?: string } = {},
) {
  const calls: { url: string; authorization: string | undefined; method: string }[] = [];
  let tokens = 0;
  const answer: FetchLike = async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({
      url,
      authorization: headers.get("authorization") ?? undefined,
      method: init.method ?? "GET",
    });
    const path = new URL(url).pathname;
    const query = new URL(url).searchParams;
    if (path === "/orgs/acme/installation") {
      return json({ id: 42 });
    }
    if (path === "/app/installations/42/access_tokens") {
      tokens += 1;
      return json(
        { token: `ghs_token_${tokens}`, expires_at: options.tokenLives ?? "2026-10-12T11:00:00Z" },
        201,
      );
    }
    if (path.startsWith("/orgs/acme/members/")) {
      const login = decodeURIComponent(path.slice("/orgs/acme/members/".length));
      return empty(members.some((member) => member.login === login) ? 204 : 404);
    }
    if (path.startsWith("/orgs/acme/memberships/")) {
      // One's membership, as the host answers it: whether it stands, and the account it is of,
      // among what else the host says of it.
      const login = decodeURIComponent(path.slice("/orgs/acme/memberships/".length));
      const member = members.find((one) => one.login === login);
      return member === undefined
        ? json({ message: "Not Found" }, 404)
        : json({
            url: url,
            state: "active",
            role: "member",
            organization: { login: "acme", id: 77 },
            user: { ...member, type: "User" },
          });
    }
    if (path === "/orgs/acme/members") {
      const page = Number(query.get("page"));
      const size = Number(query.get("per_page"));
      return json(members.slice((page - 1) * size, page * size));
    }
    return empty(500);
  };
  return { answer, calls };
}

function directory(answer: FetchLike, now = () => T0) {
  return createGitHubOrganization({
    apiUrl: "https://api.github.test/",
    organization: "acme",
    appId: "12345",
    privateKey,
    userAgent: "console-test",
    clock: { now },
    fetch: answer,
    timeoutMs: 1000,
  });
}

describe("the GitHub organization", () => {
  it("asks for the installation's token with a JWT the app's key signed, and holds the token", async () => {
    const { answer, calls } = host([{ id: 1001, login: "Alice" }]);
    const acme = directory(answer);
    expect(acme.name).toBe("acme");
    expect(await acme.isMember("Alice")).toBe(true);
    expect(await acme.isMember("bob")).toBe(false);
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.github.test/orgs/acme/installation",
      "https://api.github.test/app/installations/42/access_tokens",
      "https://api.github.test/orgs/acme/members/Alice",
      "https://api.github.test/orgs/acme/members/bob",
    ]);
    // The JWT: three parts, RS256, the app as its issuer, dated around now, checked by the public key.
    const jwt = calls[0]?.authorization?.replace("Bearer ", "") ?? "";
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header ?? "", "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString());
    expect(claims).toEqual({ iat: 1791799140, exp: 1791799740, iss: "12345" });
    expect(
      createVerify("RSA-SHA256")
        .update(`${header}.${payload}`)
        .verify(publicKey, Buffer.from(signature ?? "", "base64url")),
    ).toBe(true);
    expect(calls[1]?.method).toBe("POST");
    // The members are read with the installation's token, held across calls.
    expect(calls[2]?.authorization).toBe("Bearer ghs_token_1");
    expect(calls[3]?.authorization).toBe("Bearer ghs_token_1");
  });

  it("asks for a new token near the end of the one it holds", async () => {
    let now = T0;
    const { answer, calls } = host([]);
    const acme = directory(answer, () => now);
    await acme.isMember("alice");
    now = new Date("2026-10-12T10:56:00Z");
    await acme.isMember("alice");
    expect(calls.filter((call) => call.url.endsWith("/access_tokens"))).toHaveLength(2);
    expect(calls.at(-1)?.authorization).toBe("Bearer ghs_token_2");
  });

  it("lists everyone, a page at a time, by the host's id of the account", async () => {
    const members = Array.from({ length: 150 }, (_, index) => ({
      id: 1000 + index,
      login: `person-${index}`,
    }));
    const { answer, calls } = host(members);
    const listed = await directory(answer).listMembers();
    expect(listed).toHaveLength(150);
    expect(listed[0]).toEqual({ accountId: "1000", login: "person-0" });
    expect(listed[149]).toEqual({ accountId: "1149", login: "person-149" });
    expect(calls.filter((call) => call.url.includes("/orgs/acme/members?"))).toHaveLength(2);
    // An organization of exactly a page is read in two: the second is empty.
    const { answer: oneFull, calls: pages } = host(members.slice(0, 100));
    expect(await directory(oneFull).listMembers()).toHaveLength(100);
    expect(pages.filter((call) => call.url.includes("/orgs/acme/members?"))).toHaveLength(2);
  });

  it("says what went wrong, by kind, and keeps nothing of a token the host refuses", async () => {
    const refusedKey: FetchLike = async () => empty(401);
    await expect(directory(refusedKey).isMember("alice")).rejects.toMatchObject({
      kind: "unauthorized",
    });
    const notInstalled: FetchLike = async () => json({ message: "Not Found" }, 404);
    await expect(directory(notInstalled).listMembers()).rejects.toMatchObject({
      kind: "invalid",
    });
    const down: FetchLike = async () => empty(503);
    await expect(directory(down).isMember("alice")).rejects.toMatchObject({ kind: "transient" });

    // The token refused at the members: not a member, not an error; forbidden is the app's permissions.
    let members = 302;
    const forbidden: FetchLike = async (url) =>
      url.endsWith("/installation")
        ? json({ id: 42 })
        : url.endsWith("/access_tokens")
          ? json({ token: "ghs_x", expires_at: "2026-10-12T11:00:00Z" }, 201)
          : empty(members);
    const acme = directory(forbidden);
    await expect(acme.isMember("alice")).rejects.toMatchObject({ kind: "unauthorized" });
    members = 403;
    await expect(acme.listMembers()).rejects.toBeInstanceOf(ProviderError);
    // A page the host made up is refused as such.
    const odd: FetchLike = async (url) =>
      url.endsWith("/installation")
        ? json({ id: 42 })
        : url.endsWith("/access_tokens")
          ? json({ token: "ghs_x", expires_at: "2026-10-12T11:00:00Z" }, 201)
          : json([{ id: "one", login: 1 }]);
    await expect(directory(odd).listMembers()).rejects.toMatchObject({ kind: "invalid" });
  });

  it("says which account a member's login is, by the host's id, in the one answer that says it is a member (ADR-0126)", async () => {
    const members = [{ id: 1101, login: "acme-mira" }];
    const MEMBERSHIP = "/orgs/acme/memberships/acme-mira";
    /** The host, with what it answers at some paths said by the test, and every path asked kept. */
    const answering = (
      answers: Readonly<Record<string, () => Response>>,
    ): { answer: FetchLike; calls: string[] } => {
      const { answer: organization } = host(members);
      const calls: string[] = [];
      return {
        calls,
        answer: async (url, init) => {
          const path = new URL(url).pathname;
          calls.push(path);
          const made = answers[path];
          return made === undefined ? organization(url, init) : made();
        },
      };
    };
    const known = answering({});
    const acme = directory(known.answer);
    // A member: one question, whose answer says that it is one and which account that is.
    expect(await acme.findMember("acme-mira")).toEqual({ accountId: "1101", login: "acme-mira" });
    expect(known.calls.filter((path) => path.startsWith("/orgs/acme/member"))).toEqual([
      MEMBERSHIP,
    ]);
    // Whoever the organization has no membership of is nobody here: an account of the host
    // outside it, and a name nobody carries.
    expect(await acme.findMember("outsider")).toBeUndefined();
    expect(known.calls.at(-1)).toBe("/orgs/acme/memberships/outsider");
    expect(await acme.findMember("nobody")).toBeUndefined();
    // One invited who has not come in yet is no member.
    const invited = answering({
      [MEMBERSHIP]: () => json({ state: "pending", user: { id: 1101, login: "acme-mira" } }),
    });
    expect(await directory(invited.answer).findMember("acme-mira")).toBeUndefined();

    // A member renamed between two questions, with the name registered by someone else: asked
    // "is the login a member" and then "which account carries the login", the host answered
    // the second about the other account, and that account was bound. The account is the one
    // the membership is of, and the host is never asked which account carries a name.
    const squatted = answering({
      "/users/acme-mira": () => json({ id: 9001, login: "acme-mira", type: "User" }),
    });
    expect(await directory(squatted.answer).findMember("acme-mira")).toEqual({
      accountId: "1101",
      login: "acme-mira",
    });
    expect(squatted.calls.some((path) => path.startsWith("/users/"))).toBe(false);
    // Renamed before the question, the organization has no member called so, whoever carries
    // the name at the host by then.
    const gone = answering({
      [MEMBERSHIP]: () => json({ message: "Not Found" }, 404),
      "/users/acme-mira": () => json({ id: 9001, login: "acme-mira", type: "User" }),
    });
    expect(await directory(gone.answer).findMember("acme-mira")).toBeUndefined();
    expect(gone.calls.some((path) => path.startsWith("/users/"))).toBe(false);

    // What the host makes up is refused as such, never read as an account: an id that is no
    // whole number, one written as text, a login that goes on, another account's answer, a
    // reply longer than a membership is, a state the host has none of, and no account at all.
    for (const made of [
      { state: "active", user: { id: "1101", login: "acme-mira" } },
      { state: "active", user: { id: 11.5, login: "acme-mira" } },
      { state: "active", user: { id: -3, login: "acme-mira" } },
      { state: "active", user: { id: 1e40, login: "acme-mira" } },
      { state: "active", user: { id: 1101, login: "a".repeat(101) } },
      { state: "active", user: { id: 1101 } },
      { state: "active", user: { id: 9001, login: "someone-else" } },
      { state: "active", user: { id: 1101, login: "acme-mira", bio: "x".repeat(70_000) } },
      { state: "owner", user: { id: 1101, login: "acme-mira" } },
      { user: { id: 1101, login: "acme-mira" } },
      { state: "active", user: null },
      { state: "active" },
      { id: 1101, login: "acme-mira" },
      [],
    ]) {
      await expect(
        directory(answering({ [MEMBERSHIP]: () => json(made) }).answer).findMember("acme-mira"),
      ).rejects.toMatchObject({ kind: "invalid" });
    }
    // A host that cannot be asked, or does not let the app read, says so, by kind.
    for (const [status, kind] of [
      [503, "transient"],
      [429, "rate_limited"],
      [403, "unauthorized"],
      [401, "unauthorized"],
    ] as const) {
      await expect(
        directory(answering({ [MEMBERSHIP]: () => empty(status) }).answer).findMember("acme-mira"),
      ).rejects.toMatchObject({ kind });
    }
  });
});
