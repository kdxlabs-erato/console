import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeBytesAt } from "./terminal.js";

// How the command writes a file at a path a person named: whole, or after what is there, and
// for the account alone where it holds what is shown once.

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "console-terminal-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("writing a file at a path", () => {
  it("writes the bytes at the path, or under the file's name where the path is a directory", async () => {
    const at = join(dir, "line.md");
    expect(await writeBytesAt(at, bytes("one"), "named.md")).toBe(at);
    expect(await readFile(at, "utf8")).toBe("one");
    // What was there is replaced.
    await writeBytesAt(at, bytes("two"), "named.md");
    expect(await readFile(at, "utf8")).toBe("two");
    expect(await writeBytesAt(dir, bytes("three"), "named.md")).toBe(join(dir, "named.md"));
    expect(await readFile(join(dir, "named.md"), "utf8")).toBe("three");
  });

  it("tries a path without taking away what is at it, and makes the file where there is none", async () => {
    const kept = join(dir, "kept.md");
    await writeFile(kept, "the line of the invitation before");
    // A try: no bytes, after what the file holds. The line that stands is still there.
    await writeBytesAt(kept, new Uint8Array(), "kept.md", { private: true, after: true });
    expect(await readFile(kept, "utf8")).toBe("the line of the invitation before");
    // The line that takes its place is written whole.
    await writeBytesAt(kept, bytes("the new line"), "kept.md", { private: true });
    expect(await readFile(kept, "utf8")).toBe("the new line");
    const made = join(dir, "made.md");
    await writeBytesAt(made, new Uint8Array(), "made.md", { private: true, after: true });
    expect(await readFile(made, "utf8")).toBe("");
    // A path that cannot be written says so, before anything else is done.
    await expect(
      writeBytesAt(join(dir, "none", "line.md"), new Uint8Array(), "line.md", { after: true }),
    ).rejects.toThrow();
  });

  it("keeps a private file to its account, one that was there before too", async () => {
    // Windows keeps a file to its account's folders by itself and has no such mode.
    if (process.platform === "win32") {
      return;
    }
    const open = join(dir, "open.md");
    await writeFile(open, "x", { mode: 0o644 });
    await writeBytesAt(open, bytes("y"), "open.md", { private: true });
    expect((await stat(open)).mode & 0o777).toBe(0o600);
    await writeBytesAt(open, new Uint8Array(), "open.md", { private: true, after: true });
    expect((await stat(open)).mode & 0o777).toBe(0o600);
  });
});
