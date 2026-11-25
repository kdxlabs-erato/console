import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api.js";
import { en } from "./i18n/en.js";
import { ko } from "./i18n/ko.js";
import { errorWords, wordsForFailure } from "./use-action.js";

const SERVER_WORDS = "the manager is not another active person of the workspace";

describe("what a failure says to a person", () => {
  it("is the code read in their language, never the server's English", () => {
    const failure = new ApiError(400, "person.invalid_manager", SERVER_WORDS);
    expect(errorWords(failure, "fallback", ko)).toBe(ko.errors["person.invalid_manager"]);
    expect(errorWords(failure, "fallback", ko)).not.toContain("manager");
    expect(errorWords(failure, "fallback", en)).toBe(en.errors["person.invalid_manager"]);
    expect(errorWords(failure)).toBe(en.errors["person.invalid_manager"]);
  });

  it("falls back where the pack has no words: a code it does not know, or no answer at all", () => {
    expect(errorWords(new ApiError(400, "plugin.hr.over_limit", "Ten days."), "fallback", ko)).toBe(
      "fallback",
    );
    expect(errorWords(new Error("boom"), "fallback", ko)).toBe("fallback");
    expect(errorWords(undefined, "fallback", ko)).toBe("fallback");
    expect(errorWords(new ApiError(400, "constructor", "no"), "fallback", ko)).toBe("fallback");
  });

  it("is said in the reader's language on every page: no page leaves the pack out", () => {
    // Without a pack the words are English: a list that could not be read said so in English on
    // a Korean page. The pack is named wherever a page says a failure.
    const source = fileURLToPath(new URL(".", import.meta.url));
    const without: string[] = [];
    for (const name of readdirSync(source, { recursive: true, encoding: "utf8" })) {
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) {
        continue;
      }
      const text = readFileSync(`${source}/${name}`, "utf8");
      for (const call of text.matchAll(/(?<!function )\berrorWords\(/g)) {
        // What the call is given, up to the bracket that closes it, counted at its own depth.
        const from = call.index + call[0].length;
        let depth = 1;
        let given = 1;
        let at = from;
        for (; depth > 0 && at < text.length; at += 1) {
          const character = text[at];
          if (character === "(" || character === "[" || character === "{") {
            depth += 1;
          } else if (character === ")" || character === "]" || character === "}") {
            depth -= 1;
          } else if (character === "," && depth === 1) {
            given += 1;
          }
        }
        // A comma before the closing bracket ends the last one given, and gives nothing more.
        if (
          text
            .slice(from, at - 1)
            .trimEnd()
            .endsWith(",")
        ) {
          given -= 1;
        }
        if (given < 3) {
          without.push(`${name}:${text.slice(0, call.index).split("\n").length}`);
        }
      }
    }
    expect(without).toEqual([]);
  });

  it("leaves a plugin's own refusal to the plugin", () => {
    expect(wordsForFailure(new ApiError(400, "plugin.hr.over_limit", "Ten days."), ko)).toBe(
      undefined,
    );
    expect(wordsForFailure(new ApiError(403, "plugin.forbidden", "no"), ko)).toBe(
      ko.errors["plugin.forbidden"],
    );
  });
});
