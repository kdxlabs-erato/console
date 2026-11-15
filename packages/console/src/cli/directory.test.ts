import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDirectoryStore,
  DIRECTORY_FILE,
  parseDirectorySettings,
  THE_SENTENCE,
} from "./directory.js";

/** The page of the skill working-the-board that keeps the sentence, in the console's repository. */
const THE_PAGE = fileURLToPath(
  new URL("../../../../skills/working-the-board/references/the-sentence.md", import.meta.url),
);

describe("the sentence a checkout's agreement carries", () => {
  it("says to run whoami before the first step, and is what the skill's page quotes", async () => {
    expect(THE_SENTENCE).toBe(
      "**Bound to a console?** Before the first step, run `console whoami`: when it names a project, or `.skillcdn-console.json` is in this checkout, work the task through that SkillCDN console (its answer says how).",
    );
    // A pack says it with "the checkout" for "this checkout": the words it changes are there, once.
    expect(THE_SENTENCE.split("this checkout")).toHaveLength(2);
    // One sentence, kept in two places: what console use prints is what the page gives to copy.
    expect(await readFile(THE_PAGE, "utf8")).toContain(`\n> ${THE_SENTENCE}\n`);
  });
});

describe("what a directory says of its project", () => {
  const made: string[] = [];
  const directory = async () => {
    const path = await mkdtemp(join(tmpdir(), "console-directory-"));
    made.push(path);
    return path;
  };
  afterEach(async () => {
    for (const path of made.splice(0)) {
      await rm(path, { recursive: true, force: true });
    }
  });

  it("keeps the project, the console and the account, and drops everything else", () => {
    expect(parseDirectorySettings({ project: "web" })).toEqual({ project: "web" });
    expect(
      parseDirectorySettings({
        project: "web",
        url: "https://b.test",
        account: "bob",
        token: "cns_t_x",
        code: 1,
      }),
    ).toEqual({ project: "web", url: "https://b.test", account: "bob" });
    for (const hostile of [
      null,
      "web",
      [],
      {},
      { project: "" },
      { project: 7 },
      { project: "web", url: "" },
    ]) {
      expect(parseDirectorySettings(hostile)).toBeUndefined();
    }
  });

  it("is found in the directory or one above it, and written with the three settings alone", async () => {
    const root = await directory();
    const nested = join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(root, DIRECTORY_FILE),
      JSON.stringify({ project: "web", url: "https://b.test", token: "cns_t_leaked" }),
    );
    const store = createDirectoryStore(nested);
    // With where it was found: the directory above, which is what `console whoami` names.
    expect(await store.load()).toEqual({ project: "web", url: "https://b.test", directory: root });
    const path = await store.save({ project: "ops", url: "https://b.test", account: "bob" });
    expect(path).toBe(join(nested, DIRECTORY_FILE));
    const written = await readFile(path, "utf8");
    expect(JSON.parse(written)).toEqual({ project: "ops", url: "https://b.test", account: "bob" });
    expect(written).not.toContain("token");
    // The nearest file is the one read: the working directory's own, once it has one.
    expect(await store.load()).toEqual({
      project: "ops",
      url: "https://b.test",
      account: "bob",
      directory: nested,
    });
    // A file that is not the settings, or is far too large, is as good as none.
    await writeFile(path, "not json");
    expect(await store.load()).toBeUndefined();
    await writeFile(path, JSON.stringify({ project: "x".repeat(20_000) }));
    expect(await store.load()).toBeUndefined();
  });
});
