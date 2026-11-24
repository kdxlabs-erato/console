import { describe, expect, it } from "vitest";
import {
  HEADLESS_TOOL,
  HEADLESS_WORDS,
  headlessServers,
  headlessToolCommand,
  headlessToolKnowsWords,
  WINDOW_WORDS,
} from "./browser.js";

// The program that drives an agent's headless browser (ADR-0151): how it is started on each
// system, and what a product is handed to start it with.

describe("the program that drives a headless Chrome", () => {
  it("is started as it is installed, and through the system's interpreter on Windows", () => {
    for (const platform of ["darwin", "linux", undefined]) {
      expect(headlessToolCommand(platform, ["--version"])).toEqual({
        command: "chrome-devtools-mcp",
        args: ["--version"],
      });
    }
    // npm installs it as a `.cmd` file there, which no program starts by its name alone.
    expect(headlessToolCommand("win32", ["--version"])).toEqual({
      command: "cmd",
      args: ["/c", "chrome-devtools-mcp", "--version"],
    });
  });

  it("is handed to a product as one server, with no window and nothing sent to its maker", () => {
    expect(headlessServers("linux")).toEqual({
      mcpServers: {
        "chrome-devtools": {
          command: "chrome-devtools-mcp",
          // The headers a sign-in is carried in are left out of what its tools answer, which
          // is in the session's record.
          args: [
            "--headless",
            "--no-usage-statistics",
            "--no-performance-crux",
            "--redact-network-headers",
          ],
          // Nothing is asked of a registry when a session starts.
          env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1" },
        },
      },
    });
    expect(headlessServers("win32").mcpServers[HEADLESS_TOOL.server]).toEqual({
      command: "cmd",
      args: ["/c", "chrome-devtools-mcp", ...HEADLESS_WORDS],
      // The interpreter looks for the program where programs are installed, never first in
      // the directory it is started in, which is the agent's desk.
      env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1", NoDefaultCurrentDirectoryInExePath: "1" },
    });
    // With its window, it is the same program and the same profile, and only the word that
    // takes the window away is left out.
    expect(headlessServers("linux", true).mcpServers[HEADLESS_TOOL.server]?.args).toEqual([
      ...WINDOW_WORDS,
    ]);
    expect([...HEADLESS_WORDS]).toEqual(["--headless", ...WINDOW_WORDS]);
    expect(WINDOW_WORDS.join(" ")).not.toMatch(/headless|isolated|user-data-dir/i);
    // The profile is the program's own, the same one every time: a word that named a new one
    // for a session would have every service take the agent for a stranger.
    expect(HEADLESS_WORDS.join(" ")).not.toMatch(/isolated|user-data-dir/i);
  });

  it("takes a version for one that knows its words from the first that knows them all", () => {
    // What npm installs on a Node.js older than the program needs, and the versions around
    // the first that knows every word: the one before it, itself, and the ones run for real.
    for (const old of [
      "0.2.6",
      "0.22.9",
      "v0.2.6",
      " 0.2.6 ",
      `0.2.6${String.fromCodePoint(13)}`,
    ]) {
      expect(headlessToolKnowsWords(old)).toBe(false);
    }
    for (const known of [HEADLESS_TOOL.least, "0.23.1", "0.26.0", "1.13.0", "1.14.0", "10.0.0"]) {
      expect(headlessToolKnowsWords(known)).toBe(true);
    }
    // An answer that names no version says nothing against the program.
    for (const unread of ["", "chrome-devtools-mcp", "1.x", "9".repeat(400)]) {
      expect(headlessToolKnowsWords(unread)).toBe(true);
    }
    // What a machine is told to run names the tag: by the name alone, npm picks that old one.
    expect(HEADLESS_TOOL.install).toBe("npm install -g chrome-devtools-mcp@latest");
  });
});
