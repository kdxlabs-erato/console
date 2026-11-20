import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONSOLE_TOKENS } from "./tokens.js";

// The list of tokens the package exports is what a console sends its plugins' frames and what
// `/parts` shows, so a token the stylesheet's root sets and the list leaves out reaches no frame
// and is seen nowhere: three were added to the one and not the other, and nothing said so.

describe("the tokens the package names", () => {
  it("are the ones the stylesheet's root sets, each once, in the order they stand there", async () => {
    const css = await readFile(
      fileURLToPath(new URL("./styles/tokens.css", import.meta.url)),
      "utf8",
    );
    const from = css.indexOf(":root {");
    const root = css.slice(from, css.indexOf("\n}\n", from));
    const set = [...root.matchAll(/^ {2}(--sc-[a-z0-9-]+):/gm)].map((found) => found[1]);
    expect(set.length).toBeGreaterThan(90);
    expect(new Set(set).size).toBe(set.length);
    expect(CONSOLE_TOKENS).toEqual(set);
  });
});
