import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRotation, createSecrets, type SealPurpose } from "../../auth/secrets.js";
import type { Drizzle } from "../client.js";
import { RESEALED_PURPOSES, resealKind, type SealedStore } from "./reseal.js";

// The rotation's step without a database (ADR-0127): how one kind is read through and read
// again, with a store held in memory; and what holds the sealing to one place, so that a value
// sealed somewhere new is one the step reads.

const OLD = "the secret the deployment had before, long enough";
const NEW = "the secret the deployment has now, long enough too";
const before = createSecrets(OLD);
const now = createSecrets(NEW);
const rotation = createRotation(NEW, OLD);
/** The store asks nothing of the database here. */
const NO_DATABASE = undefined as unknown as Drizzle;

/** A kind kept in memory: its rows by key, read a page at a time as a table is, with a count of the reads. */
function memoryStore(
  rows: Map<string, string>,
  onWrite: (key: string, was: string, next: string) => boolean,
): SealedStore<string> & { readonly passes: () => number } {
  let passes = 0;
  return {
    kind: "pluginSecrets",
    purpose: "plugin-secret",
    page: async (_db, after) => {
      if (after === undefined) {
        passes += 1;
      }
      return [...rows.entries()]
        .filter(([key]) => after === undefined || key > after)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .slice(0, 200)
        .map(([key, sealed]) => ({ key, sealed }));
    },
    write: async (_db, key, was, next) => onWrite(key, was, next),
    passes: () => passes,
  };
}

describe("one kind of sealed value, under a rotation", () => {
  it("is read once where nothing changes under the step", async () => {
    const rows = new Map([
      ["a", before.seal("plugin-secret", "one")],
      ["b", now.seal("plugin-secret", "two")],
      ["c", "not a sealed value"],
    ]);
    const store = memoryStore(rows, (key, was, next) => {
      expect(rows.get(key)).toBe(was);
      rows.set(key, next);
      return true;
    });
    expect(await resealKind(NO_DATABASE, rotation, store)).toEqual({
      kind: "pluginSecrets",
      values: 3,
      resealed: 1,
      unopened: 1,
      left: 0,
    });
    expect(store.passes()).toBe(1);
    expect(now.open("plugin-secret", rows.get("a") ?? "")).toBe("one");
    expect(rows.get("c")).toBe("not a sealed value");
  });

  it("is read again when a value changed under it, and then finds it the current secret's", async () => {
    const rows = new Map([["a", before.seal("plugin-secret", "one")]]);
    const fresh = now.seal("plugin-secret", "set meanwhile");
    const store = memoryStore(rows, (key) => {
      // Another console wrote the row between the step's read and its write.
      rows.set(key, fresh);
      return false;
    });
    expect(await resealKind(NO_DATABASE, rotation, store)).toMatchObject({
      values: 1,
      resealed: 0,
      left: 0,
    });
    expect(store.passes()).toBe(2);
    expect(rows.get("a")).toBe(fresh);
  });

  it("gives up after a few readings, and says how many values are left under the secret before", async () => {
    const rows = new Map([
      ["a", before.seal("plugin-secret", "one")],
      ["b", before.seal("plugin-secret", "two")],
    ]);
    // A console still on the old configuration keeps writing under the secret before.
    const store = memoryStore(rows, (key) => {
      rows.set(key, before.seal("plugin-secret", "again"));
      return false;
    });
    expect(await resealKind(NO_DATABASE, rotation, store)).toEqual({
      kind: "pluginSecrets",
      values: 2,
      resealed: 0,
      unopened: 0,
      left: 2,
    });
    expect(store.passes()).toBe(3);
  });

  it("reads every page of a kind with more rows than one", async () => {
    const rows = new Map(
      Array.from({ length: 450 }, (_, index) => [
        `k${String(index).padStart(4, "0")}`,
        before.seal("plugin-secret", `value ${index}`),
      ]),
    );
    const store = memoryStore(rows, (key, _was, next) => {
      rows.set(key, next);
      return true;
    });
    expect(await resealKind(NO_DATABASE, rotation, store)).toMatchObject({
      values: 450,
      resealed: 450,
      left: 0,
    });
    expect(
      [...rows.values()].every((sealed) => now.open("plugin-secret", sealed) !== undefined),
    ).toBe(true);
  });
});

/** Every source file of the app that is not a test and not test support. */
function sources(): { readonly path: string; readonly text: string }[] {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "testing") {
          walk(path);
        }
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        found.push({
          path: relative(root, path).split(sep).join("/"),
          text: readFileSync(path, "utf8"),
        });
      }
    }
  };
  walk(root);
  return found;
}

describe("the sealing of the app", () => {
  const files = sources();

  it("derives its keys and opens a cipher in one module alone", () => {
    const elsewhere = files
      .filter((file) => /\b(?:hkdfSync|createCipheriv|createDecipheriv)\b/.test(file.text))
      .map((file) => file.path);
    expect(elsewhere).toEqual(["auth/secrets.ts"]);
  });

  it("makes its sealer from the configuration with the secret before, wherever it makes one", () => {
    const made = files
      .filter((file) => file.path !== "auth/secrets.ts")
      .flatMap((file) =>
        [...file.text.matchAll(/createSecrets\(([^)]*)\)/g)].map((match) => ({
          path: file.path,
          given: (match[1] ?? "").replace(/\s+/g, " ").trim(),
        })),
      );
    expect(made.length).toBeGreaterThan(0);
    expect(
      made.filter((one) => one.given !== "config.auth.secret, config.auth.previousSecret"),
    ).toEqual([]);
  });

  it("seals for no purpose the rotation's step does not read, but a sign-in in flight", () => {
    const purposes = new Set<string>();
    for (const file of files) {
      for (const match of file.text.matchAll(/\.seal\(\s*"([a-z-]+)"/g)) {
        purposes.add(match[1] ?? "");
      }
      for (const match of file.text.matchAll(/sealJson\(\s*[A-Za-z]+,\s*"([a-z-]+)"/g)) {
        purposes.add(match[1] ?? "");
      }
    }
    const kept: readonly SealPurpose[] = [...RESEALED_PURPOSES, "login"];
    expect([...purposes].sort()).toEqual([...kept].sort());
  });
});
