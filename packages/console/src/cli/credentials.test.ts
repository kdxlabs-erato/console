import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_SECRET_LENGTH, MAX_URL_LENGTH } from "../limits.js";
import { restConnectionSchema } from "../schemas.js";
import {
  type Credentials,
  CredentialsError,
  createFileStore,
  defaultConfigDir,
  fitsFile,
  keepsNothing,
  type Login,
  lasts,
  type PendingConnection,
  parseCredentials,
  pendingAt,
  resolveLogin,
  withLogin,
  withoutLogin,
  withoutPending,
  withPending,
} from "./credentials.js";

const A = "https://a.test";
const B = "https://b.test";
const login = (url: string, account: string | undefined, token: string): Login => ({
  url,
  account,
  token,
  agent: undefined,
  since: undefined,
});
const kept: Credentials = {
  default: A,
  logins: [
    login(A, "alice", "cns_t_a"),
    login(B, "alice", "cns_t_b"),
    login(B, "bob", "cns_t_bob"),
  ],
};

describe("the credentials the command keeps", () => {
  it("read the current shape, the first shape as one login that is the default, and nothing else", () => {
    expect(
      parseCredentials({
        version: 2,
        default: A,
        logins: [
          {
            url: A,
            account: "alice",
            token: "cns_t_a",
            agent: "Codex",
            since: "2026-10-14T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      default: A,
      logins: [
        {
          url: A,
          account: "alice",
          token: "cns_t_a",
          agent: "Codex",
          since: "2026-10-14T00:00:00.000Z",
        },
      ],
    });
    expect(parseCredentials({ url: A, token: "cns_t_old" })).toEqual({
      default: A,
      logins: [login(A, undefined, "cns_t_old")],
    });
    for (const hostile of [
      null,
      7,
      "x",
      [],
      {},
      { version: 3, logins: [] },
      { url: "", token: "t" },
      { version: 2, logins: [{ url: A }] },
    ]) {
      expect(parseCredentials(hostile)).toBeUndefined();
    }
  });

  it("keep a login per console and account, the first as the default, and let one go", () => {
    const first = withLogin({ default: undefined, logins: [] }, login(A, "alice", "cns_t_a"));
    expect(first).toEqual({ default: A, logins: [login(A, "alice", "cns_t_a")] });
    const second = withLogin(first, login(B, "alice", "cns_t_b"));
    expect(second.default).toBe(A);
    expect(second.logins).toHaveLength(2);
    const asDefault = withLogin(second, login(B, "bob", "cns_t_bob"), { default: true });
    expect(asDefault.default).toBe(B);
    // The same console and account again: the token replaced, nothing added.
    const again = withLogin(asDefault, login(A, "alice", "cns_t_a2"));
    expect(again.logins.filter((entry) => entry.url === A)).toEqual([
      login(A, "alice", "cns_t_a2"),
    ]);
    expect(again.logins).toHaveLength(3);
    // Letting go: one account at a console, or every account there; the default moves when it must.
    expect(withoutLogin(again, B, "bob").logins.map((entry) => entry.token)).toEqual([
      "cns_t_b",
      "cns_t_a2",
    ]);
    expect(withoutLogin(again, B).default).toBe(A);
    expect(withoutLogin(withoutLogin(again, B), A)).toEqual({ default: undefined, logins: [] });
  });

  it("resolve the console first and the token for it alone, in the order the flag, the environment, the directory, the default", () => {
    expect(resolveLogin({ credentials: kept })).toMatchObject({
      ok: true,
      url: A,
      token: "cns_t_a",
      source: "default",
      via: "login",
    });
    expect(
      resolveLogin({ credentials: kept, directoryUrl: B, directoryAccount: "bob" }),
    ).toMatchObject({
      ok: true,
      url: B,
      token: "cns_t_bob",
      account: "bob",
      source: "directory",
    });
    expect(resolveLogin({ credentials: kept, directoryUrl: B })).toEqual({
      ok: false,
      reason: "ambiguous",
      url: B,
      accounts: ["alice", "bob"],
    });
    expect(
      resolveLogin({ credentials: kept, directoryUrl: B, flagAccount: "alice" }),
    ).toMatchObject({ ok: true, token: "cns_t_b" });
    expect(resolveLogin({ credentials: kept, flagUrl: A, directoryUrl: B })).toMatchObject({
      ok: true,
      url: A,
      source: "flag",
    });
    expect(resolveLogin({ credentials: kept, flagUrl: "https://c.test" })).toEqual({
      ok: false,
      reason: "no_login",
      url: "https://c.test",
      account: undefined,
      source: "flag",
    });
    expect(
      resolveLogin({ credentials: kept, directoryUrl: A, directoryAccount: "carol" }),
    ).toMatchObject({
      ok: false,
      reason: "no_login",
      account: "carol",
      source: "directory",
    });
    // The environment: a pair, for its own address; half a pair is nothing.
    expect(resolveLogin({ credentials: kept, envUrl: B, envToken: "cns_t_env" })).toMatchObject({
      ok: true,
      url: B,
      token: "cns_t_env",
      via: "environment",
    });
    expect(
      resolveLogin({ credentials: kept, envUrl: B, envToken: "cns_t_env", flagUrl: A }),
    ).toMatchObject({ ok: true, url: A, token: "cns_t_a", via: "login" });
    expect(resolveLogin({ credentials: undefined, envUrl: A })).toEqual({
      ok: false,
      reason: "environment_half",
      have: "CONSOLE_URL",
    });
    expect(resolveLogin({ credentials: undefined, envToken: "cns_t_env" })).toEqual({
      ok: false,
      reason: "environment_half",
      have: "CONSOLE_TOKEN",
    });
    // Nothing anywhere; and the one console signed in to stands as the default when none is marked.
    expect(resolveLogin({ credentials: undefined })).toEqual({ ok: false, reason: "nothing" });
    expect(
      resolveLogin({ credentials: { default: undefined, logins: [login(B, "bob", "cns_t_bob")] } }),
    ).toMatchObject({ ok: true, url: B, token: "cns_t_bob" });
    // A login kept before accounts were known answers for the console, as nobody in particular.
    expect(
      resolveLogin({ credentials: { default: A, logins: [login(A, undefined, "cns_t_old")] } }),
    ).toMatchObject({ ok: true, token: "cns_t_old", account: undefined });
  });

  it("keep a connection that waits for a person, one a console, and none past the end of its code (ADR-0129)", () => {
    const END = "2026-10-09T10:00:00.000Z";
    const before = Date.parse("2026-10-09T09:55:00.000Z");
    const after = Date.parse("2026-10-09T10:00:00.000Z");
    const waits = (url: string, code: string, expiresAt = END): PendingConnection => ({
      url,
      secret: "cns_c_secret",
      code,
      page: `${url}/connect/${code}`,
      expiresAt,
      interval: 5,
    });
    expect(lasts(waits(A, "AAAA-AAAA"), before)).toBe(true);
    // At its end a code is over, and an end that is no moment never lasts.
    expect(lasts(waits(A, "AAAA-AAAA"), after)).toBe(false);
    expect(lasts(waits(A, "AAAA-AAAA", "soon"), before)).toBe(false);
    const one = withPending(kept, waits(B, "BBBB-BBBB"), before);
    expect(one.logins).toEqual(kept.logins);
    expect(pendingAt(one, B)?.code).toBe("BBBB-BBBB");
    expect(pendingAt(one, A)).toBeUndefined();
    expect(pendingAt(undefined, A)).toBeUndefined();
    // A second at the same console takes the place of the first; one elsewhere stands beside it.
    const two = withPending(
      withPending(one, waits(B, "CCCC-CCCC"), before),
      waits(A, "AAAA-AAAA"),
      before,
    );
    expect(two.pending?.map((waiting) => waiting.code)).toEqual(["CCCC-CCCC", "AAAA-AAAA"]);
    // Whatever is kept anew carries no connection whose code ran out.
    const stale = withPending(one, waits(A, "AAAA-AAAA", "2026-10-09T11:00:00.000Z"), after);
    expect(stale.pending?.map((waiting) => waiting.code)).toEqual(["AAAA-AAAA"]);
    expect(withoutPending(two, B, before).pending?.map((waiting) => waiting.code)).toEqual([
      "AAAA-AAAA",
    ]);
    expect(withoutPending(two, "https://c.test", after).pending).toBeUndefined();
    // A login kept or let go leaves the connections that wait as they are.
    expect(withLogin(two, login(A, "carol", "cns_t_c")).pending).toEqual(two.pending);
    expect(withoutLogin(two, A).pending).toEqual(two.pending);
    expect(keepsNothing({ default: undefined, logins: [] })).toBe(true);
    expect(keepsNothing({ default: undefined, logins: [], pending: [] })).toBe(true);
    expect(keepsNothing({ default: undefined, logins: [], pending: [waits(A, "AAAA-AAAA")] })).toBe(
      false,
    );
    expect(keepsNothing(kept)).toBe(false);

    // Read from a file: whole, or not at all. A file from before has none.
    const file = {
      version: 2,
      default: A,
      logins: [{ url: A, account: "alice", token: "cns_t_a" }],
    };
    expect(parseCredentials(file)?.pending).toBeUndefined();
    expect(parseCredentials({ ...file, pending: [] })?.pending).toBeUndefined();
    expect(
      parseCredentials({
        ...file,
        pending: [{ ...waits(B, "BBBB-BBBB"), self: true, default: true }],
      })?.pending,
    ).toEqual([{ ...waits(B, "BBBB-BBBB"), self: true, default: true }]);
    for (const hostile of [
      "many",
      [{ ...waits(B, "BBBB-BBBB"), secret: "" }],
      [{ ...waits(B, "BBBB-BBBB"), secret: "x".repeat(1025) }],
      [{ ...waits(B, "BBBB-BBBB"), code: "x".repeat(65) }],
      [{ ...waits(B, "BBBB-BBBB"), interval: 0 }],
      [{ ...waits(B, "BBBB-BBBB"), interval: "5" }],
      [{ ...waits(B, "BBBB-BBBB"), url: { nested: [[[[]]]] } }],
      Array.from({ length: 101 }, () => waits(B, "BBBB-BBBB")),
    ]) {
      expect(parseCredentials({ ...file, pending: hostile })).toBeUndefined();
    }
  });

  it("read back whatever a console may answer to begin a connection, which is bounded no wider", () => {
    // The widest answer the REST shape takes: kept as the connection that waits, it fits.
    const widest = {
      code: "C".repeat(64),
      url: `https://${"a".repeat(MAX_URL_LENGTH - "https://".length)}`,
      secret: "s".repeat(MAX_SECRET_LENGTH),
      expiresAt: `2026-10-09T10:00:00.${"0".repeat(19)}Z`,
      interval: 600,
    };
    expect(widest.url).toHaveLength(2048);
    expect(widest.expiresAt).toHaveLength(40);
    const answered = restConnectionSchema.parse(widest);
    expect(
      fitsFile({
        default: undefined,
        logins: [],
        pending: [
          {
            url: A,
            secret: answered.secret,
            code: answered.code,
            page: answered.url,
            expiresAt: answered.expiresAt,
            interval: answered.interval,
          },
        ],
      }),
    ).toBe(true);
    // One past a bound, and the answer is refused as no console's before the command has it.
    for (const beyond of [
      { code: "C".repeat(65) },
      { code: "" },
      { url: `${widest.url}a` },
      { url: "" },
      { secret: "s".repeat(MAX_SECRET_LENGTH + 1) },
      { secret: "" },
      { expiresAt: `2026-10-09T10:00:00.${"0".repeat(20)}Z` },
      { interval: 601 },
      { interval: 0 },
      { interval: 1.5 },
    ]) {
      expect(restConnectionSchema.safeParse({ ...widest, ...beyond }).success).toBe(false);
    }
  });

  it("name the directory the file lives in", () => {
    expect(defaultConfigDir({ XDG_CONFIG_HOME: "/xdg" })).toBe(join("/xdg", "skillcdn-console"));
    expect(defaultConfigDir({})).toContain(join(".config", "skillcdn-console"));
  });
});

describe("the credentials file", () => {
  const made: string[] = [];
  const directory = async () => {
    const path = await mkdtemp(join(tmpdir(), "console-credentials-"));
    made.push(path);
    return path;
  };
  afterEach(async () => {
    for (const path of made.splice(0)) {
      await rm(path, { recursive: true, force: true });
    }
  });

  it("is written whole and read back, with nothing left beside it", async () => {
    const dir = await directory();
    const store = createFileStore(dir);
    expect(await store.load()).toBeUndefined();
    const path = await store.save(kept);
    expect(path).toBe(join(dir, "credentials.json"));
    expect(await store.load()).toEqual(kept);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ version: 2, default: A });
    expect(await readdir(dir)).toEqual(["credentials.json"]);
    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    await store.clear();
    expect(await store.load()).toBeUndefined();
  });

  it("keeps with a login that the command is the account itself, and the zone its workspace keeps its times in", async () => {
    const store = createFileStore(await directory());
    const own: Credentials = {
      default: A,
      logins: [
        { ...login(A, "mira@acme.example", "cns_a_mira"), self: true, timeZone: "Asia/Seoul" },
        login(B, "alice", "cns_t_b"),
      ],
    };
    await store.save(own);
    expect(await store.load()).toEqual(own);
  });

  it("keeps a connection that waits beside the logins, in the one file under the one mode (ADR-0129)", async () => {
    const dir = await directory();
    const store = createFileStore(dir);
    const waiting: Credentials = {
      default: undefined,
      logins: [],
      pending: [
        {
          url: A,
          secret: "cns_c_secret",
          code: "ABCD-EFGH",
          page: `${A}/connect/ABCD-EFGH`,
          expiresAt: "2026-10-09T10:00:00.000Z",
          interval: 5,
          self: true,
          default: true,
        },
      ],
    };
    const path = await store.save(waiting);
    expect(await store.load()).toEqual(waiting);
    expect(await readdir(dir)).toEqual(["credentials.json"]);
    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    // With none, the file names none: a command from before reads it as it always did.
    await store.save(kept);
    expect(JSON.parse(await readFile(path, "utf8"))).not.toHaveProperty("pending");
  });

  it("reads the file of before as one login, and refuses one it cannot read without touching it", async () => {
    const dir = await directory();
    const store = createFileStore(dir);
    const path = join(dir, "credentials.json");
    await writeFile(path, JSON.stringify({ url: A, token: "cns_t_old" }));
    expect(await store.load()).toEqual({ default: A, logins: [login(A, undefined, "cns_t_old")] });
    await writeFile(path, "{ not json");
    await expect(store.load()).rejects.toBeInstanceOf(CredentialsError);
    await expect(store.load()).rejects.toMatchObject({ code: "credentials.malformed" });
    expect(await readFile(path, "utf8")).toBe("{ not json");
    await writeFile(path, JSON.stringify({ version: 2, logins: "many" }));
    await expect(store.load()).rejects.toMatchObject({ code: "credentials.malformed" });
    await writeFile(path, `{"version":2,"logins":[],"pad":"${"x".repeat(70 * 1024)}"}`);
    await expect(store.load()).rejects.toMatchObject({ code: "credentials.too_large" });
  });

  it("is never written in a shape it would not read back", async () => {
    const dir = await directory();
    const store = createFileStore(dir);
    const path = await store.save(kept);
    const written = await readFile(path, "utf8");
    const waits: PendingConnection = {
      url: B,
      secret: "cns_c_secret",
      code: "ABCD-EFGH",
      page: `${B}/connect/ABCD-EFGH`,
      expiresAt: "2026-10-09T10:00:00.000Z",
      interval: 5,
    };
    // What a console answered, beyond the bounds the file reads: a wait, a code, a page, a
    // secret and an end of a connection, and a token, an account and a zone of a login.
    const beyond: Credentials[] = [
      { ...kept, pending: [{ ...waits, interval: 601 }] },
      { ...kept, pending: [{ ...waits, interval: 0.5 }] },
      { ...kept, pending: [{ ...waits, code: "" }] },
      { ...kept, pending: [{ ...waits, page: `${B}/${"x".repeat(2049)}` }] },
      { ...kept, pending: [{ ...waits, secret: "x".repeat(1025) }] },
      { ...kept, pending: [{ ...waits, expiresAt: "x".repeat(41) }] },
      { ...kept, logins: [login(A, "alice", "x".repeat(1025))] },
      { ...kept, logins: [login(A, "", "cns_t_a")] },
      { ...kept, logins: [{ ...login(A, "alice", "cns_t_a"), timeZone: "x".repeat(65) }] },
    ];
    for (const unfit of beyond) {
      expect(fitsFile(unfit)).toBe(false);
      await expect(store.save(unfit)).rejects.toMatchObject({ code: "credentials.unfit" });
      // Nothing was written: the file is as it was, with nothing beside it, and still reads.
      expect(await readFile(path, "utf8")).toBe(written);
      expect(await readdir(dir)).toEqual(["credentials.json"]);
      expect(await store.load()).toEqual(kept);
    }
    expect(fitsFile(kept)).toBe(true);
    expect(fitsFile({ ...kept, pending: [waits] })).toBe(true);
    expect(fitsFile({ default: undefined, logins: [] })).toBe(true);
  });
});
