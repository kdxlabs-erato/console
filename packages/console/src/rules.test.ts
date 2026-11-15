import { describe, expect, it } from "vitest";
import { isDocumentPath } from "./documents.js";
import { MAX_RULES_LENGTH } from "./limits.js";
import {
  ADDED_RULES_HEADING,
  addedRulesOf,
  CONSOLE_RULES,
  fillRules,
  languageNameOf,
  PROJECT_RULES_TEMPLATE,
  RULES_LANGUAGE_PLACEHOLDER,
  RULES_PATH,
  rulesWith,
} from "./rules.js";

/** Printable ASCII and the newline: English, with nothing invisible in it. */
const PLAIN = /^[\x20-\x7e\n]*$/;

/** How long the console's rules may be: they are printed with a take, so they stay short. */
const CONSOLE_RULES_BOUND = 3_600;

describe("the console's rules", () => {
  it("stay short and carry nothing invisible", () => {
    expect(CONSOLE_RULES.length).toBeLessThan(CONSOLE_RULES_BOUND);
    // What an organization adds has the rest of the page, and more.
    expect(CONSOLE_RULES_BOUND).toBeLessThan(MAX_RULES_LENGTH / 2);
    expect(CONSOLE_RULES).toMatch(PLAIN);
    expect(PROJECT_RULES_TEMPLATE).toMatch(PLAIN);
    expect(CONSOLE_RULES.startsWith("# Rules for agents on this board\n")).toBe(true);
    expect(isDocumentPath(RULES_PATH)).toBe(true);
  });

  it("say what an organization could decide otherwise, in the order an agent meets it", () => {
    const lines = CONSOLE_RULES.split("\n");
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
      "An agent adds to these rules only when a person asked for exactly that.",
    ]) {
      expect(lines.filter((line) => line.includes(said))).toHaveLength(1);
    }
  });

  it("say at their head that they always hold, what follows them, and what no addition takes back (ADR-0120)", () => {
    const head = CONSOLE_RULES.split("\n")[2] ?? "";
    expect(head).toContain("The console's rules: they always hold.");
    expect(head).toContain("What this organization adds follows them, then what the project adds");
    expect(head).toContain("an addition holds where it differs from what stands before it");
    expect(head).toContain("but none takes back what never happens");
    // Nobody rewrites them, so nothing here says how they would be.
    expect(CONSOLE_RULES).not.toContain("until an administrator");
    expect(CONSOLE_RULES).not.toContain("console rules write");
  });

  it("name a command only where the command is what the rule is about, so that a rename is caught here", () => {
    for (const named of [
      "`console task new` with `--state ready`",
      "console skills --search <words> --limit 5",
      "console ask",
    ]) {
      expect(CONSOLE_RULES).toContain(named);
    }
    // How the board is worked is the skill's, and a command's use is its help's: none of it here.
    const commands = [...CONSOLE_RULES.matchAll(/`console ([a-z-]+)/g)].map((match) => match[1]);
    expect([...new Set(commands)].sort()).toEqual(["ask", "skills", "task"]);
    for (const elsewhere of ["working-the-board", "running-an-agent", "SKILLCDN.md"]) {
      expect(CONSOLE_RULES).not.toContain(elsewhere);
    }
  });

  it("give a project's rules five things to say, and nothing an agent could mistake for a rule", () => {
    expect(CONSOLE_RULES).toContain(
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

  it("are read whole with what an organization adds under a heading of its own, and alone where it adds nothing", () => {
    expect(rulesWith(undefined)).toBe(CONSOLE_RULES);
    expect(rulesWith("  \n")).toBe(CONSOLE_RULES);
    expect(rulesWith("Ask first.\n")).toBe(
      `${CONSOLE_RULES.trimEnd()}\n\n${ADDED_RULES_HEADING}\n\nAsk first.\n`,
    );
    expect(ADDED_RULES_HEADING).toBe("# What this organization adds");
  });

  it("take from a text sent as the rules what it adds: itself, or what follows the console's own where the whole came back", () => {
    // What a page or a command of now sends: the addition alone.
    expect(addedRulesOf("Ask first.\n")).toBe("Ask first.");
    expect(addedRulesOf("# Ours\n\nAsk first.")).toBe("# Ours\n\nAsk first.");
    // What one of before sends back: the whole it read, changed or not.
    expect(addedRulesOf(rulesWith("Ask first."))).toBe("Ask first.");
    expect(addedRulesOf(`${CONSOLE_RULES}\nOne more.`)).toBe("One more.");
    // The console's rules alone add nothing.
    expect(addedRulesOf(CONSOLE_RULES)).toBe("");
    expect(addedRulesOf(`${CONSOLE_RULES}\n\n`)).toBe("");
    expect(addedRulesOf(`${CONSOLE_RULES}\n${ADDED_RULES_HEADING}\n`)).toBe("");
    // A whole whose console part was changed is no whole of ours: taken as it is.
    const changed = CONSOLE_RULES.replace("never asked twice", "asked as often as needed");
    expect(addedRulesOf(changed)).toBe(changed.trim());
  });

  it("say the language of the person where they are read, and the task's when they chose none", () => {
    expect(CONSOLE_RULES).toContain(RULES_LANGUAGE_PLACEHOLDER);
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
    expect(fillRules(CONSOLE_RULES, "ko")).not.toContain(RULES_LANGUAGE_PLACEHOLDER);
  });
});
