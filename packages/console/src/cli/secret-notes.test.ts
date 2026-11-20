import { describe, expect, it } from "vitest";
import { secretNotes } from "./secret-notes.js";

// What the command says of a secret's value as it is kept (ADR-0140): a value that is not of the
// shape its name says is kept all the same, and said so. The values here are invented, and of
// no service.

describe("what is said of a secret's value as it is kept", () => {
  it("says nothing of a value that looks like what its name holds", () => {
    expect(secretNotes("slack.app_token", `xapp-${"1-A0".repeat(6)}`)).toEqual([]);
    expect(secretNotes("git.token", `ghp_${"a1B2".repeat(9)}`, "github")).toEqual([]);
    expect(secretNotes("git.token", `github_pat_${"a1B2".repeat(9)}`, "github")).toEqual([]);
    expect(secretNotes("git.token", `glpat-${"a1B2".repeat(5)}`, "gitlab")).toEqual([]);
    // A host the package knows no shape of, and a name it reads nothing of.
    expect(secretNotes("git.token", "anything-at-all", "forge")).toEqual([]);
    expect(secretNotes("git.token", "anything-at-all")).toEqual([]);
    expect(secretNotes("mail.password", "two words")).toEqual([]);
  });

  it("says that a value is not of the shape its name says, and never the value", () => {
    const other = "what-the-page-copied-instead";
    const github = secretNotes("git.token", other, "github");
    expect(github).toEqual([
      "The value does not look like what git.token holds: a token of GitHub begins with ghp_ or github_pat_. It is kept as it is; set it again if another value was pasted.",
    ]);
    expect(github.join("\n")).not.toContain(other);
    expect(secretNotes("slack.app_token", "xoxb-not-the-app-level-one")[0]).toContain(
      "an app-level token of Slack begins with xapp-",
    );
  });

  it("says that a token holds a space or a line break", () => {
    expect(secretNotes("git.token", `ghp_${"a1B2".repeat(9)}\nextra`, "github")).toEqual([
      "The value holds a space or a line break, which a token does not: check that it was copied whole and alone.",
    ]);
  });
});
