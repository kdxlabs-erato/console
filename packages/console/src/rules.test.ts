import { describe, expect, it } from "vitest";
import { isDocumentPath } from "./documents.js";
import { MAX_RULES_LENGTH } from "./limits.js";
import {
  fillRules,
  isReferenceRules,
  languageNameOf,
  PROJECT_RULES_TEMPLATE,
  REFERENCE_RULES,
  RULES_LANGUAGE_PLACEHOLDER,
  RULES_PATH,
} from "./rules.js";

/** Printable ASCII and the newline: English, with nothing invisible in it. */
const PLAIN = /^[\x20-\x7e\n]*$/;

describe("the console's own rules", () => {
  it("fit what a rules page may hold, carry nothing invisible, and are known as themselves", () => {
    expect(REFERENCE_RULES.length).toBeLessThan(MAX_RULES_LENGTH / 2);
    expect(REFERENCE_RULES).toMatch(PLAIN);
    expect(PROJECT_RULES_TEMPLATE).toMatch(PLAIN);
    expect(REFERENCE_RULES.startsWith("# Rules for agents on this board\n")).toBe(true);
    expect(isReferenceRules(REFERENCE_RULES)).toBe(true);
    expect(isReferenceRules(`${REFERENCE_RULES}\n\n`)).toBe(true);
    expect(isReferenceRules(`${REFERENCE_RULES}\nOne more.`)).toBe(false);
    expect(isDocumentPath(RULES_PATH)).toBe(true);
  });

  it("name what an agent runs and reads by name, so that a rename is caught here", () => {
    for (const named of [
      "console rules",
      "console rules write --workspace",
      "console skills",
      "console task <number>",
      "console docs",
      "console ask",
      // What a decision's record is kept with: the answer given elsewhere, and what followed.
      "console answer",
      "console decision <id> --outcome",
      "console take <number>",
      "console task new",
      "console work",
      "working-the-board",
      "console skill <path>",
      "SKILLCDN.md",
      // For an agent account: whom it asks, and the skill that says how one is run.
      "console manager",
      "running-an-agent",
    ]) {
      expect(REFERENCE_RULES).toContain(named);
    }
    // What keeps a board's work from going astray, each said once: a task written from chat can
    // be taken as written, a task of a project several repositories share is worked in its own
    // repository, work found on the way is a task of its own, and with no project named the
    // pack read is the organization's.
    for (const said of [
      'console task new "<title>" --body <markdown> --state ready',
      "in a project several repositories share it names the repository, and is worked in a checkout of that one",
      "Work found on the way that the task does not cover is a task of its own",
      "or of the organization's where no project is named",
      // The rule on work given in chat is for a project's work. A desk is its member's own:
      // what they do there for themselves is no task, and nobody is asked whether it should be.
      "Work of a project given in chat",
      "What a member does in their own desk for themselves is on no board unless they put it there: write no task for it, and do not ask whether to.",
    ]) {
      expect(REFERENCE_RULES).toContain(said);
    }
    // The template is headings alone: nothing an agent could mistake for a rule.
    expect(PROJECT_RULES_TEMPLATE.split("\n").filter((line) => /^[^#\s]/.test(line))).toEqual([
      "Adds to the workspace's rules, for the agents at work here.",
    ]);
  });

  it("say the language of the person where they are read, and the task's when they chose none", () => {
    expect(REFERENCE_RULES).toContain(RULES_LANGUAGE_PLACEHOLDER);
    expect(languageNameOf("ko")).toBe("Korean");
    expect(languageNameOf("en")).toBe("English");
    expect(languageNameOf("ko-KR")).toContain("Korean");
    expect(languageNameOf("not a tag")).toBe("not a tag");
    expect(fillRules("Write in {language}; {language} it is.", "ko")).toBe(
      "Write in Korean; Korean it is.",
    );
    expect(fillRules("Write in {language}.", null)).toBe(
      "Write in the language the task is written in.",
    );
    expect(fillRules(REFERENCE_RULES, "ko")).not.toContain(RULES_LANGUAGE_PLACEHOLDER);
    // The page itself keeps the placeholder: filled, it is no longer the console's own.
    expect(isReferenceRules(fillRules(REFERENCE_RULES, "ko"))).toBe(false);
  });
});
