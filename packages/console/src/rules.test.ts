import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

/** The page of the skill planning-the-board that gives a project's rules as an example. */
const THE_EXAMPLE = fileURLToPath(
  new URL("../../../skills/planning-the-board/references/project-rules.md", import.meta.url),
);

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
    expect(head).toContain("The console's rules always hold.");
    // Which holds is said without an order: the command prints what differs first (ADR-0119).
    expect(head).toContain("This organization adds to them, and a project to both");
    expect(head).toContain("a project's hold over the organization's, and both over these");
    expect(head).toContain("but none takes back what never happens");
    // Nobody rewrites them, so nothing here says how they would be.
    expect(CONSOLE_RULES).not.toContain("until an administrator");
    expect(CONSOLE_RULES).not.toContain("console rules write");
  });

  it("name a command only where the command is what the rule is about, so that a rename is caught here", () => {
    for (const named of [
      "`console task new` with `--take`",
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
      // What the language is of, said where it is set: what people read on the project's
      // board. Read as the language of the work, it had an agent write a repository's own
      // documents in it, against the repository's agreement.
      "## Language on the board",
    ]);
    expect(lines.filter((line) => /^[^#\s]/.test(line))).toEqual([
      "Adds to the workspace's rules, for the agents at work here: what differs in this project, and nothing else.",
    ]);
  });

  it("are what the planning skill's example of a project's rules is written from", async () => {
    const page = await readFile(THE_EXAMPLE, "utf8");
    const example = /\n~~~markdown\n([\s\S]*?)\n~~~\n/.exec(page)?.[1] ?? "";
    // The same title, the same line under it and the same five headings, in the template's
    // order, with lines of a list under each and nothing else.
    const outline = (text: string): string[] =>
      text.split("\n").filter((line) => line !== "" && !/^(- | {2})/.test(line));
    expect(outline(example)).toEqual(outline(PROJECT_RULES_TEMPLATE));
    // The language is of what people read on the board, and the example says what that is and
    // what it is not: a repository's own documents follow the repository.
    expect(example).toContain(
      "\n## Language on the board\n\n- Korean, for what people read on this project's board: reports, tasks, pages. A repository's own documents follow the repository.",
    );
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

  it("know the console's rules where the whole comes back as it was read: {language} filled, and the line ends a file keeps", () => {
    // As `console rules` prints them, for a person who reads in English, in Korean or in no
    // language yet: a command of before sends back what it printed, and so does a person.
    for (const language of ["en", "ko", null]) {
      const printed = fillRules(rulesWith("Ask first."), language);
      expect(printed).not.toContain(RULES_LANGUAGE_PLACEHOLDER);
      expect(addedRulesOf(printed)).toBe("Ask first.");
      // The console's rules alone, read so, still add nothing.
      expect(addedRulesOf(fillRules(CONSOLE_RULES, language))).toBe("");
    }
    // Whatever words stand where the language did: the rules are known by the rest of them.
    expect(addedRulesOf(rulesWith("Ask first.").replace("{language}", "plain words"))).toBe(
      "Ask first.",
    );
    // Saved on the way by an editor that ends a line with a carriage return and a line feed.
    const crlf = (text: string): string => text.split("\n").join("\r\n");
    expect(addedRulesOf(crlf(fillRules(rulesWith("Ask first."), "ko")))).toBe("Ask first.");
    expect(addedRulesOf(crlf(CONSOLE_RULES))).toBe("");
    expect(addedRulesOf(crlf(`${CONSOLE_RULES}\nOne more.`))).toBe("One more.");
    // What was added stands before the whole, after it, or both: the whole is cut, and the
    // heading with it where it follows.
    const whole = fillRules(CONSOLE_RULES, "en").trim();
    expect(addedRulesOf(`Ask first.\n\n${whole}\n`)).toBe("Ask first.");
    expect(addedRulesOf(`Ask first.\n\n${whole}\n\nAnd tell us after.\n`)).toBe(
      "Ask first.\n\nAnd tell us after.",
    );
    expect(
      addedRulesOf(`Ask first.\n\n${whole}\n\n${ADDED_RULES_HEADING}\n\nAnd tell us after.\n`),
    ).toBe("Ask first.\n\nAnd tell us after.");
    // A whole sent twice is cut twice: none of it is kept as an addition.
    expect(addedRulesOf(`${whole}\n\nAsk first.\n\n${crlf(whole)}\n`)).toBe("Ask first.");
  });

  it("keep an addition that quotes the console's rules, a sentence or a part of them: only the whole is the console's", () => {
    const sentence =
      "No token is looked for, read, printed or sent, and nothing secret goes into a report, a page or these rules.";
    expect(CONSOLE_RULES).toContain(sentence);
    const quoting = `As the console's rules say: "${sentence}" Here that goes for a customer's name too.`;
    expect(addedRulesOf(quoting)).toBe(quoting);
    // Up to the last part and no further: not the whole, so nothing is cut.
    const most = CONSOLE_RULES.slice(0, CONSOLE_RULES.indexOf("## What never happens"));
    expect(addedRulesOf(`${most}\nOurs ends here.`)).toBe(`${most}\nOurs ends here.`.trim());
    // The head line alone, which a text of the organization's own may well begin with.
    expect(addedRulesOf("# Rules for agents on this board\n\nAsk first.")).toBe(
      "# Rules for agents on this board\n\nAsk first.",
    );
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
