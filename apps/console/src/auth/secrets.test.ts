import { describe, expect, it } from "vitest";
import {
  createRotation,
  createSecrets,
  hashToken,
  newToken,
  openJson,
  pkceChallenge,
  sameSecret,
  sealJson,
} from "./secrets.js";

const SECRET = "a secret for tests that is long enough to be one";

describe("secrets", () => {
  it("seal what only the same secret opens, and say nothing about why not", () => {
    const secrets = createSecrets(SECRET);
    const sealed = secrets.seal("login", "hello");
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("hello");
    expect(secrets.open("login", sealed)).toBe("hello");
    expect(secrets.seal("login", "hello")).not.toBe(sealed);

    const other = createSecrets("another secret that is also long enough to be one");
    expect(other.open("login", sealed)).toBeUndefined();
    for (const bad of ["", "v1.", "v2.abc", `${sealed}.x`, `${sealed.slice(0, -2)}xx`, "v1.AAAA"]) {
      expect(secrets.open("login", bad), bad).toBeUndefined();
    }
  });

  it("seal JSON that is good until it expires", () => {
    const secrets = createSecrets(SECRET);
    const until = new Date("2026-01-01T00:10:00Z");
    const sealed = sealJson(secrets, "login", { state: "s" }, until);
    expect(openJson(secrets, "login", sealed, new Date("2026-01-01T00:09:59Z"))).toEqual({
      state: "s",
    });
    expect(openJson(secrets, "login", sealed, until)).toBeUndefined();
    expect(openJson(secrets, "login", "nonsense", new Date(0))).toBeUndefined();
    expect(openJson(secrets, "login", secrets.seal("login", "[1,2]"), new Date(0))).toBeUndefined();
  });

  it("make tokens that are long, random and prefixed, and compare them in constant shape", () => {
    const token = newToken("cns_s_");
    expect(token).toMatch(/^cns_s_[A-Za-z0-9_-]{43}$/);
    expect(newToken("cns_s_")).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(sameSecret(token, token)).toBe(true);
    expect(sameSecret(token, `${token}x`)).toBe(false);
    expect(sameSecret("", "a")).toBe(false);
    expect(pkceChallenge("verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("a rotation of the secret (ADR-0127)", () => {
  const OLD = "the secret the deployment had before, long enough";
  const OTHER = "a secret this deployment never had, as long as one is";
  const before = createSecrets(OLD);
  const now = createSecrets(SECRET);
  const both = createSecrets(SECRET, OLD);

  it("opens what the secret before sealed, and seals with the current one alone", () => {
    const old = before.seal("pack-token", "kept from before");
    expect(now.open("pack-token", old)).toBeUndefined();
    expect(both.open("pack-token", old)).toBe("kept from before");
    // An empty value is a value: it is the one before's to open as any other.
    expect(both.open("pack-token", before.seal("pack-token", ""))).toBe("");

    const sealed = both.seal("pack-token", "sealed now");
    expect(now.open("pack-token", sealed)).toBe("sealed now");
    expect(before.open("pack-token", sealed)).toBeUndefined();
    expect(both.open("pack-token", sealed)).toBe("sealed now");
  });

  it("keeps a purpose's key its own under the secret before too, and opens nothing of a third secret", () => {
    const old = before.seal("login", "a sign-in in flight");
    expect(both.open("login", old)).toBe("a sign-in in flight");
    expect(both.open("pack-token", old)).toBeUndefined();
    expect(both.open("login", createSecrets(OTHER).seal("login", "x"))).toBeUndefined();
    for (const bad of ["", "v1.", "v2.abc", `${old}.x`, `${old.slice(0, -2)}xx`, "v1.AAAA"]) {
      expect(both.open("login", bad), bad).toBeUndefined();
    }
    // What is good until a moment is read under either secret, and no longer.
    const until = new Date("2026-01-01T00:10:00Z");
    const pending = sealJson(before, "login", { state: "s" }, until);
    expect(openJson(both, "login", pending, new Date("2026-01-01T00:09:59Z"))).toEqual({
      state: "s",
    });
    expect(openJson(both, "login", pending, until)).toBeUndefined();
  });

  it("says of a sealed value which secret opens it, and seals again what only the one before does", () => {
    const rotation = createRotation(SECRET, OLD);
    expect(rotation.reseal("agent-secret", now.seal("agent-secret", "current"))).toEqual({
      by: "current",
    });
    const old = before.seal("agent-secret", "from before");
    const read = rotation.reseal("agent-secret", old);
    expect(read.by).toBe("previous");
    if (read.by === "previous") {
      expect(read.sealed).not.toBe(old);
      expect(read.sealed).not.toContain("from before");
      expect(now.open("agent-secret", read.sealed)).toBe("from before");
      expect(before.open("agent-secret", read.sealed)).toBeUndefined();
      // Sealed again, it is the current secret's, and a second reading leaves it.
      expect(rotation.reseal("agent-secret", read.sealed)).toEqual({ by: "current" });
    }
    // Another purpose's value, a third secret's, and what is no sealed value at all.
    for (const neither of [
      before.seal("plugin-secret", "another purpose"),
      createSecrets(OTHER).seal("agent-secret", "a third secret"),
      "",
      "v1.AAAA",
      "x".repeat(100_000),
      `v1.${"A".repeat(1_000_000)}`,
    ]) {
      expect(rotation.reseal("agent-secret", neither)).toEqual({ by: "neither" });
    }
  });
});
