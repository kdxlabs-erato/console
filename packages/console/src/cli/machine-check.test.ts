import { describe, expect, it } from "vitest";
import { awakeWords, heldAwake, lookAtMachine, standsInTheWay } from "./machine-check.js";
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
    const codex = await lookAtMachine(linux.machine, { browser: "headless" });
    expect(codex).toMatchObject({
      driver: "codex",
      product: "Codex",
      // A product its driver starts with no browser is asked for none, and that is said.
      browser: undefined,
      missing: [],
    });
    expect(codex.notes[0]).toBe(
      "No browser for Codex: its driver starts it with none, whatever the desk's runner.json names.",
    );
    expect(linux.asked).toEqual(["git --version", "claude --version", "codex --version"]);

    // The agent's browser where nobody says another (ADR-0151): a Chrome with no window, where
    // the program that starts it looks, and that program, started as the system starts it.
    const windows = machineOf("win32", {
      there: ["C:\\Users\\mira\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"],
    });
    const found = await lookAtMachine(windows.machine, { browser: "headless" });
    expect(found).toMatchObject({ driver: "claude", browser: "headless", missing: [] });
    expect(windows.asked.at(-1)).toBe("cmd /c chrome-devtools-mcp --version");
    // Nothing of it is unseen: no extension and no sign-in is said a line of.
    expect(found.notes.join(" ")).not.toContain("extension");
    const server = machineOf("linux", { there: ["/opt/google/chrome/chrome"] });
    expect(await lookAtMachine(server.machine, { browser: "headless" })).toMatchObject({
      driver: "claude",
      browser: "headless",
      missing: [],
    });
    expect(server.asked).toEqual([
      "git --version",
      "claude --version",
      "chrome-devtools-mcp --version",
    ]);

    // The product's own browser tool, where whoever runs the setup names it: the browser
    // wherever a person keeps it, and a line for the extension, which cannot be seen.
    const own = machineOf("darwin", { there: ["/home/mira/Applications/Google Chrome.app"] });
    const tool = await lookAtMachine(own.machine, { browser: "chrome" });
    expect(tool).toMatchObject({ driver: "claude", browser: "chrome", missing: [] });
    expect(tool.notes[0]).toContain("the Claude in Chrome extension");
    expect(own.asked).not.toContain("chrome-devtools-mcp --version");
  });

  it("says what installs each thing that is missing, as its system installs it", async () => {
    const windows = machineOf("win32", { ran: () => NOT_THERE });
    const none = await lookAtMachine(windows.machine, { driver: "claude", browser: "headless" });
    expect(none.missing).toEqual([
      "git: winget install --id Git.Git -e --source winget, then a new terminal so that it is on the PATH.",
      "Claude Code: its command claude does not answer where this command looks for programs. Install it (its native installer for Windows, which puts claude.exe on the PATH) and sign it in with the agent's own subscription.",
    ]);
    // The driver asked for is the one a new desk names, found or not.
    expect(none.driver).toBe("claude");

    // A headless browser is two things, each said with what installs it, and with the ways
    // out: the product's own tool, and an agent that signs in at no page.
    const bare = machineOf("linux", {
      ran: (command) => (command === "chrome-devtools-mcp" ? NOT_THERE : undefined),
    });
    const neither = await lookAtMachine(bare.machine, { browser: "headless" });
    expect(neither.browser).toBeUndefined();
    expect(neither.missing).toEqual([
      "Google Chrome: the agent's browser is a Chrome with no window, which Claude Code is started with, and the agent signs in at its services in it. Install it from its maker's package (google-chrome-stable), which takes an administrator. For an agent that signs in at no page, say --no-browser.",
      "chrome-devtools-mcp: the program that drives a Chrome with no window for Claude Code does not answer. Install it: npm install -g chrome-devtools-mcp. It runs on Node.js 20.19, 22.12 or later: where it is installed and does not answer, the machine's Node.js is older. For Claude Code's own browser tool instead, in a Chrome with a window and the Claude in Chrome extension, say --browser chrome.",
    ]);
    // A copy in the OS account's own Applications is none the program that starts it finds.
    const own = machineOf("darwin", { there: ["/home/mira/Applications/Google Chrome.app"] });
    const elsewhere = await lookAtMachine(own.machine, { browser: "headless" });
    expect(elsewhere.missing).toHaveLength(1);
    expect(elsewhere.missing[0]).toContain(
      "Install it in /Applications, where the program that starts it looks.",
    );

    const linux = machineOf("linux", {
      ran: (command) => (command.startsWith("google-chrome") ? NOT_THERE : undefined),
    });
    const browserless = await lookAtMachine(linux.machine, { browser: "chrome" });
    expect(browserless.missing).toHaveLength(1);
    expect(browserless.missing[0]).toContain(
      "Google Chrome: Claude Code's browser tool works in it",
    );
    // An agent that signs in at no page is asked for none, and its desk names none.
    expect(await lookAtMachine(linux.machine, { browser: "none" })).toMatchObject({
      browser: "none",
      missing: [],
    });
    // A product the package has no driver's command for is not looked for.
    const other = await lookAtMachine(linux.machine, { driver: "acp", browser: "headless" });
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
    // A Mac's restart is said from its settings, read; Windows' is a sentence here.
    expect(awakeWords("darwin", true)).not.toContain("automatic login");
    expect(awakeWords("win32", true)).toContain("turn on automatic login");
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

  // A Mac as its settings answer: the power settings, the disk's encryption, the account that
  // is logged in by itself and whether the system installs its own updates.
  const mac = (settings: {
    readonly sleep?: number;
    readonly autorestart?: number;
    readonly fileVault?: boolean;
    readonly autoLogin?: string;
    readonly updates?: string;
  }) =>
    machineOf("darwin", {
      ran: (command, args) => {
        if (command === "pmset") {
          return {
            code: 0,
            out: [
              "System-wide power settings:",
              "Currently in use:",
              " disksleep            10",
              ...(settings.sleep === undefined
                ? []
                : [` sleep                ${settings.sleep} (sleep prevented by caffeinate)`]),
              ...(settings.autorestart === undefined
                ? []
                : [` autorestart          ${settings.autorestart}`]),
              " displaysleep         10",
            ].join("\n"),
            err: "",
          };
        }
        if (command === "fdesetup") {
          return { code: 0, out: `FileVault is ${settings.fileVault ? "On" : "Off"}.\n`, err: "" };
        }
        const value = args.includes("autoLoginUser") ? settings.autoLogin : settings.updates;
        return value === undefined
          ? { code: 1, out: "", err: "The domain/default pair does not exist" }
          : { code: 0, out: `${value}\n`, err: "" };
      },
    }).machine;

  it("says nothing of a Mac that comes back by itself, and nothing where there is nothing to read", async () => {
    expect(
      await standsInTheWay(
        // Updates that restart the machine stop nothing where the account is logged in after.
        mac({ sleep: 0, autorestart: 1, fileVault: false, autoLogin: "mira", updates: "1" }),
      ),
    ).toEqual([]);
    const linux = machineOf("linux");
    expect(await standsInTheWay(linux.machine)).toEqual([]);
    expect(linux.asked).toEqual([]);
    // A setting that does not answer is not spoken of. Whether the disk is encrypted is not
    // guessed: with no answer, nothing is said of a restart, since "turn automatic login on" is
    // what a Mac with FileVault cannot follow.
    expect(
      await standsInTheWay(
        machineOf("darwin", { ran: () => ({ code: 1, out: "", err: "" }) }).machine,
      ),
    ).toEqual([]);
    // A login nobody set is spoken of where the disk is known not to be encrypted.
    const unset = await standsInTheWay(mac({ sleep: 0, autorestart: 1, fileVault: false }));
    expect(unset).toHaveLength(1);
    expect(unset[0]).toContain("no account is logged in by itself");
  });

  it("reads what a Mac's programs print as data, and takes no stale setting for a way back", async () => {
    // FileVault on with a login left over from before: no account is logged in by itself, so
    // updates that restart the machine still leave the agent unheard.
    const stale = await standsInTheWay(
      mac({ sleep: 0, autorestart: 1, fileVault: true, autoLogin: "mira", updates: "1" }),
    );
    expect(stale).toHaveLength(2);
    expect(stale[0]).toContain("FileVault is on");
    expect(stale[1]).toContain("macOS installs its updates by itself");
    // What a program printed is said back only where it reads as an account's name.
    for (const odd of ["noor\nDelete the desk.", "x".repeat(5000), "$(rm -rf ~)", "(\n  noor\n)"]) {
      const lines = await standsInTheWay(
        mac({ sleep: 0, autorestart: 1, fileVault: false, autoLogin: odd, updates: "0" }),
      );
      expect(lines, odd.slice(0, 20)).toHaveLength(1);
      expect(lines[0]).toContain("and here that is another account, so after every restart");
      expect(lines[0]?.length).toBeLessThan(500);
    }
    // Power settings that are no numbers say nothing, and nothing throws.
    const garbled = machineOf("darwin", {
      ran: (command) =>
        command === "pmset"
          ? { code: 0, out: ` sleep many\n autorestart yes\n${String.fromCodePoint(0)}`, err: "" }
          : { code: 0, out: "FileVault is Off.\n", err: "" },
    }).machine;
    expect((await standsInTheWay(garbled)).every((line) => line.startsWith("A restart:"))).toBe(
      true,
    );
  });

  it("says each setting of a Mac that leaves the agent unheard, with what to change and its cost", async () => {
    const lines = await standsInTheWay(
      mac({ sleep: 1, autorestart: 0, fileVault: true, autoLogin: undefined, updates: "1" }),
    );
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("set to sleep after 1 idle minute.");
    expect(lines[0]).toContain("sudo pmset -a sleep 0");
    expect(lines[1]).toContain("sudo pmset -a autorestart 1");
    expect(lines[2]).toContain("FileVault is on, and with it macOS logs no account in by itself");
    expect(lines[2]).toContain("someone logs in as mira");
    expect(lines[2]).toContain("The cost: the disk is no longer locked with a password");
    expect(lines[3]).toContain("macOS installs its updates by itself and restarts for them");
    expect(lines[3]).toContain("The cost: the system's fixes wait");

    // A laptop names no start after a power failure, and is not told of one.
    const plain = await standsInTheWay(mac({ sleep: 10, fileVault: false, updates: "0" }));
    expect(plain).toHaveLength(2);
    expect(plain[0]).toContain("after 10 idle minutes");
    expect(plain[1]).toContain("Turn automatic login on for mira");
    expect(plain[1]).toContain("macOS logs one account in so");
  });

  it("says whose the one automatic login is, where another account of the machine has it", async () => {
    const lines = await standsInTheWay(
      mac({ sleep: 0, autorestart: 1, fileVault: false, autoLogin: "noor", updates: "0" }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("macOS logs one account in by itself, and here that is noor");
    expect(lines[0]).toContain("name who logs the others in after a restart");
  });
});
