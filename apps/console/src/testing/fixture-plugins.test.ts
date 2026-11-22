import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { satisfiesRange } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../version.js";

// The plugins the tests install are run by the console of this checkout, whatever its version.
// One that named the consoles it runs on up to the present line passed every check on `main`
// and failed the pull request that versions a new line, where the console is that line's first
// version for the first time: the release found it, and nothing before.

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

describe("the plugins the tests install", () => {
  it("run on this console, and on the first of the line after it", async () => {
    const [major = 0, minor = 0] = APP_VERSION.split(".").map(Number);
    const next = `${major}.${minor + 1}.0`;
    const names = (await readdir(FIXTURES)).filter((name) => name.startsWith("plugin-"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const manifest = JSON.parse(
        await readFile(`${FIXTURES}${name}/console-plugin.json`, "utf8"),
      ) as { console?: unknown };
      if (manifest.console === undefined) {
        continue;
      }
      expect(typeof manifest.console, name).toBe("string");
      const range = String(manifest.console);
      expect(satisfiesRange(APP_VERSION, range), `${name}: ${range} and ${APP_VERSION}`).toBe(true);
      expect(satisfiesRange(next, range), `${name}: ${range} and ${next}`).toBe(true);
    }
  });
});
