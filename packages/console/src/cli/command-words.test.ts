import { describe, expect, it } from "vitest";
import { commandLine, commandWord } from "./command-words.js";

// The spellings below were run through bash 5 and Windows PowerShell 5.1, a program that prints
// its arguments behind each: every one came out as the one argument it spells, with nothing in
// it expanded. A single quote was tried every way: `'it'\''s'` is bash's and a parse error in
// PowerShell; `'it''s'` is PowerShell's and `its` in bash; `'it'"'"'s'` is one word in bash and
// three in PowerShell, which joins no quoted pieces. Double quotes serve both where nothing
// inside is read by either.

describe("a word of a line printed to run", () => {
  it("is as it is where neither shell reads anything of it", () => {
    for (const word of [
      "review",
      "skills/review/SKILL.md",
      "docs/annex/codes-1.md",
      "a.b/c_d-e+f=g:h@i",
      "--cursor",
      "https://console.test",
    ]) {
      expect(commandWord(word), word).toBe(word);
    }
  });

  it("is in single quotes where it holds what a shell expands, splits or reads as more", () => {
    // `$`, a backtick, parentheses and a space: bash and PowerShell both read into none of them
    // inside single quotes.
    expect(commandWord("skills/$(x)/SKILL.md")).toBe("'skills/$(x)/SKILL.md'");
    expect(commandWord("skills/$HOME/`whoami`/a b/SKILL.md")).toBe(
      "'skills/$HOME/`whoami`/a b/SKILL.md'",
    );
    expect(commandWord("docs/my codes.md")).toBe("'docs/my codes.md'");
    // A tilde bash makes a home of, first or after `=`; an `@` first, which PowerShell spreads.
    expect(commandWord("~/skills")).toBe("'~/skills'");
    expect(commandWord("a=~/b")).toBe("'a=~/b'");
    expect(commandWord("@x")).toBe("'@x'");
    expect(commandWord("@x/SKILL.md")).toBe("'@x/SKILL.md'");
    // What either shell runs, chains, comments out or makes a list or a pattern of.
    for (const word of [
      "a;b",
      "a|b",
      "a&b",
      "a<b",
      "a>b",
      "#a",
      "a,b",
      "a*b",
      "a?b",
      "a{b}c",
      "a%b",
    ]) {
      expect(commandWord(word), word).toBe(`'${word}'`);
    }
    // A backslash and a `!` are nothing inside single quotes.
    expect(commandWord("a\\b!c")).toBe("'a\\b!c'");
  });

  it("is in double quotes where it holds a single quote and nothing either shell reads there", () => {
    expect(commandWord("skills/it's/SKILL.md")).toBe('"skills/it\'s/SKILL.md"');
    expect(commandWord("skills/it's (draft) a b/SKILL.md")).toBe(
      '"skills/it\'s (draft) a b/SKILL.md"',
    );
    // A curly single quote ends a single-quoted word in PowerShell as a straight one does.
    const curly = `it${String.fromCodePoint(0x2019)}s`;
    expect(commandWord(curly)).toBe(`"${curly}"`);
    expect(commandWord(`a${String.fromCodePoint(0x2018)}b c`)).toBe(
      `"a${String.fromCodePoint(0x2018)}b c"`,
    );
  });

  it("has no spelling where a single quote goes with what a shell reads inside double quotes", () => {
    for (const word of [
      "skills/it's $(x)/SKILL.md",
      "it's `x`",
      'it\'s "x"',
      "it's a\\b",
      "it's!",
      `it's ${String.fromCodePoint(0x201c)}x`,
      `it${String.fromCodePoint(0x2019)}s $x`,
    ]) {
      expect(commandWord(word), word).toBeUndefined();
    }
  });

  it("has no spelling where it is empty, or holds a character that does not show", () => {
    for (const word of [
      "",
      "a\nb",
      "a\tb",
      `a${String.fromCodePoint(0)}b`,
      `a${String.fromCodePoint(0x202e)}b`,
      `a${String.fromCodePoint(0x200b)}b`,
      `a${String.fromCodePoint(0xd800)}b`,
    ]) {
      expect(commandWord(word), JSON.stringify(word)).toBeUndefined();
    }
  });

  it("makes a line of words, or none where one word has no spelling", () => {
    expect(
      commandLine("console skill", [
        "skills/$(x)/SKILL.md",
        "--cursor",
        "three",
        "--project",
        "web",
      ]),
    ).toBe("console skill 'skills/$(x)/SKILL.md' --cursor three --project web");
    expect(commandLine("console skill", ["it's", "--cursor", "c"])).toBe(
      `console skill "it's" --cursor c`,
    );
    expect(commandLine("console skill", ["it's $x", "--cursor", "c"])).toBeUndefined();
    expect(commandLine("console skill", [])).toBe("console skill");
  });
});
