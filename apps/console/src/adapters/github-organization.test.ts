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

  it("says which account a member's login is, by the host's id, and nothing for anyone else (ADR-0126)", async () => {
    const members = [{ id: 1101, login: "acme-mira" }];
    /** The host with its accounts: a member's, and one outside the organization. */
    const accounts = (
      users: Readonly<Record<string, unknown>>,
    ): { answer: FetchLike; calls: string[] } => {
      const { answer: organization } = host(members);
      const calls: string[] = [];
      return {
        calls,
        answer: async (url, init) => {
          const path = new URL(url).pathname;
          calls.push(path);
          if (path.startsWith("/users/")) {
            const user = users[decodeURIComponent(path.slice("/users/".length))];
            return user === undefined ? json({ message: "Not Found" }, 404) : json(user);
          }
          return organization(url, init);
        },
      };
    };
    const known = accounts({
      "acme-mira": { id: 1101, login: "acme-mira", type: "User" },
      outsider: { id: 7, login: "outsider" },
    });
    const acme = directory(known.answer);
    // A member: asked whether it is one, then which account the login is.
    expect(await acme.findMember("acme-mira")).toEqual({ accountId: "1101", login: "acme-mira" });
    expect(known.calls.slice(-2)).toEqual(["/orgs/acme/members/acme-mira", "/users/acme-mira"]);
    // An account of the host that is no member is nobody here, and its account is not asked for.
    expect(await acme.findMember("outsider")).toBeUndefined();
    expect(known.calls.at(-1)).toBe("/orgs/acme/members/outsider");
    expect(await acme.findMember("nobody")).toBeUndefined();
    // A member renamed between the two questions is no longer called so.
    expect(await directory(accounts({}).answer).findMember("acme-mira")).toBeUndefined();

    // What the host makes up is refused as such, never read as an account: an id that is no
    // whole number, one written as text, a login that goes on, another account's answer, and a
    // reply longer than an account is.
    for (const made of [
      { id: "1101", login: "acme-mira" },
      { id: 11.5, login: "acme-mira" },
      { id: -3, login: "acme-mira" },
      { id: 1e40, login: "acme-mira" },
      { id: 1101, login: "a".repeat(101) },
      { id: 1101 },
      { id: 9001, login: "someone-else" },
      { id: 1101, login: "acme-mira", bio: "x".repeat(70_000) },
      [],
    ]) {
      await expect(
        directory(accounts({ "acme-mira": made }).answer).findMember("acme-mira"),
      ).rejects.toMatchObject({ kind: "invalid" });
    }
    // A host that cannot be asked says so, by kind.
    const down: FetchLike = async (url, init) =>
      new URL(url).pathname.startsWith("/users/") ? empty(503) : host(members).answer(url, init);
    await expect(directory(down).findMember("acme-mira")).rejects.toMatchObject({
      kind: "transient",
    });
  });
});
