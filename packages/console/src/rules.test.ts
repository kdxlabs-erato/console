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

/** How long the console's own rules may be: they are printed with a take, so they stay short. */
const REFERENCE_RULES_BOUND = 3_600;

describe("the console's own rules", () => {
  it("stay short, carry nothing invisible, and are known as themselves", () => {
    expect(REFERENCE_RULES.length).toBeLessThan(REFERENCE_RULES_BOUND);
    // An organization's own rules have the rest of the page.
    expect(REFERENCE_RULES_BOUND).toBeLessThan(MAX_RULES_LENGTH / 2);
    expect(REFERENCE_RULES).toMatch(PLAIN);
    expect(PROJECT_RULES_TEMPLATE).toMatch(PLAIN);
    expect(REFERENCE_RULES.startsWith("# Rules for agents on this board\n")).toBe(true);
    expect(isReferenceRules(REFERENCE_RULES)).toBe(true);
    expect(isReferenceRules(`${REFERENCE_RULES}\n\n`)).toBe(true);
    expect(isReferenceRules(`${REFERENCE_RULES}\nOne more.`)).toBe(false);
    expect(isDocumentPath(RULES_PATH)).toBe(true);
  });

  it("say what an organization could decide otherwise, in the order an agent meets it", () => {
    const lines = REFERENCE_RULES.split("\n");
    expect(lines.filter((line) => line.startsWith("## "))).toEqual([
      "## Before work",
      "## While working",
      "## Asking",
      "## Reporting",
      "## An agent account",
      "## What never happens",
    ]);
    // What costs most when missed, each said once in a line of its own.
    for (const said of [
      "A project's work has a task before it is done.",
      "What a member does in their own desk for themselves is on no board unless they put it there: write no task for it, and do not ask whether to.",
      "In a project several repositories share it names the repository, and is worked in a checkout of that one.",
      "Work found on the way that the task does not cover is a new task, named in the report.",
      "It is for the person you work for unless the task or the rules name another, and is never asked twice.",
      "An agent writes these rules only when a person asked for exactly that.",
    ]) {
      expect(lines.filter((line) => line.includes(said))).toHaveLength(1);
    }
  });

  it("name a command only where the command is what the rule is about, so that a rename is caught here", () => {
    for (const named of [
      "console rules write --workspace",
      "`console task new` with `--state ready`",
      "console skills --search <words> --limit 5",
      "console ask",
    ]) {
      expect(REFERENCE_RULES).toContain(named);
    }
    // How the board is worked is the skill's, and a command's use is its help's: none of it here.
    const commands = [...REFERENCE_RULES.matchAll(/`console ([a-z-]+)/g)].map((match) => match[1]);
    expect([...new Set(commands)].sort()).toEqual(["ask", "rules", "skills", "task"]);
    for (const elsewhere of ["working-the-board", "running-an-agent", "SKILLCDN.md"]) {
      expect(REFERENCE_RULES).not.toContain(elsewhere);
    }
  });

  it("give a project's rules five things to say, and nothing an agent could mistake for a rule", () => {
    expect(REFERENCE_RULES).toContain(
      "where its work lives, the skills to load first, its pages' folders, who decides what, and its language where it is another",
    );
    const lines = PROJECT_RULES_TEMPLATE.split("\n");
    expect(lines.filter((line) => line.startsWith("## "))).toEqual([
      "## Where the work lives",
      "## Skills to load first",
      "## The pages",
      "## Who decides what",
      "## Language",
    ]);
    expect(lines.filter((line) => /^[^#\s]/.test(line))).toEqual([
      "Adds to the workspace's rules, for the agents at work here: what differs in this project, and nothing else.",
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
