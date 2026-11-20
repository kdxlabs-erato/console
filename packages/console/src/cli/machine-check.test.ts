import { describe, expect, it } from "vitest";
import { awakeWords, heldAwake, lookAtMachine } from "./machine-check.js";
import type { Ran, SetupMachine } from "./setup-machine.js";

// What a setup looks for on a machine before anyone is asked to sign in (ADR-0140), by
// platform. The setup's own tests hold what it does with the look.

function machineOf(
  platform: string,
  over: {
    readonly there?: readonly string[];
    readonly ran?: (command: string, args: readonly string[]) => Ran | undefined;
  } = {},
): { readonly machine: SetupMachine; readonly asked: string[] } {
  const asked: string[] = [];
  const home = platform === "win32" ? "C:\\Users\\mira" : "/home/mira";
  const machine: SetupMachine = {
    platform,
    user: "mira",
    home,
    uid: 1000,
    self: undefined,
    searchPath: undefined,
    path: (...parts) => parts.join(platform === "win32" ? "\\" : "/"),
    exists: async (path) => (over.there ?? []).includes(path),
    read: async () => undefined,
    holds: async () => false,
    write: async () => undefined,
    run: async (command, args) => {
      asked.push([command, ...args].join(" "));
      return over.ran?.(command, args) ?? { code: 0, out: "", err: "" };
    },
    open: async () => false,
  };
  return { machine, asked };
}

const NOT_THERE: Ran = { code: null, out: "", err: "spawn ENOENT" };

describe("the look at a machine before a setup", () => {
  it("finds git, the first product that answers, and its browser, where each system keeps them", async () => {
    const linux = machineOf("linux", {
      ran: (command) => (command === "claude" ? NOT_THERE : undefined),
    });
    expect(await lookAtMachine(linux.machine, { browser: true })).toMatchObject({
      driver: "codex",
      product: "Codex",
      // A product with no browser tool of its own asks for no browser.
      browser: undefined,
      missing: [],
    });
    expect(linux.asked).toEqual(["git --version", "claude --version", "codex --version"]);

    const windows = machineOf("win32", {
      there: ["C:\\Users\\mira\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"],
    });
    const found = await lookAtMachine(windows.machine, { browser: true });
    expect(found).toMatchObject({ driver: "claude", browser: "chrome", missing: [] });
    expect(found.notes[0]).toContain("the Claude in Chrome extension");
  });

  it("says what installs each thing that is missing, as its system installs it", async () => {
    const windows = machineOf("win32", { ran: () => NOT_THERE });
    const none = await lookAtMachine(windows.machine, { driver: "claude", browser: true });
    expect(none.missing).toEqual([
      "git: winget install --id Git.Git -e --source winget, then a new terminal so that it is on the PATH.",
      "Claude Code: its command claude does not answer where this command looks for programs. Install it (its native installer for Windows, which puts claude.exe on the PATH) and sign it in with the agent's own subscription.",
    ]);
    // The driver asked for is the one a new desk names, found or not.
    expect(none.driver).toBe("claude");

    const linux = machineOf("linux", {
      ran: (command) => (command.startsWith("google-chrome") ? NOT_THERE : undefined),
    });
    const browserless = await lookAtMachine(linux.machine, { browser: true });
    expect(browserless.missing).toHaveLength(1);
    expect(browserless.missing[0]).toContain(
      "Google Chrome: Claude Code's browser tool works in it",
    );
    // An agent that signs in at no page is asked for none.
    expect((await lookAtMachine(linux.machine, { browser: false })).missing).toEqual([]);
    // A product the package has no driver's command for is not looked for.
    const other = await lookAtMachine(linux.machine, { driver: "acp", browser: true });
    expect(other).toMatchObject({ driver: "acp", product: undefined, missing: [] });
  });

  it("asks the system whether the runner holds it awake, where it can be asked, and says what is left to do", async () => {
    const held = machineOf("darwin", {
      ran: () => ({
        code: 0,
        out: 'pid 412(caffeinate): [0x0001] 00:00:02 PreventUserIdleSystemSleep named: "caffeinate command-line tool"\n',
        err: "",
      }),
    });
    expect(await heldAwake(held.machine)).toBe(true);
    expect(await heldAwake(machineOf("darwin").machine)).toBe(false);
    expect(await heldAwake(machineOf("linux").machine)).toBeUndefined();
    expect(awakeWords("darwin", true)).toContain("kept from sleeping while the runner runs");
    expect(awakeWords("darwin", true)).toContain("turn on automatic login");
    expect(awakeWords("darwin", false)).toContain(
      "The machine is not held awake by the runner: set it never to sleep when idle",
    );
    // Where the system cannot be asked, nothing is claimed: what the runner does, and where its
    // own lines say whether that holds.
    const unasked = awakeWords("linux", undefined, "the account's journal");
    expect(unasked).toContain(
      "The runner asks the system to keep the machine from sleeping while it runs, and its own lines (the account's journal) say whether that holds.",
    );
    expect(unasked).not.toContain("is kept from sleeping");
    expect(unasked).not.toContain("automatic login");
    expect(awakeWords("win32", undefined)).toContain("powercfg /change standby-timeout-ac 0");
  });
});
