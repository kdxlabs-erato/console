// The browser of an agent that is no tool of its product's own (ADR-0151): a Google Chrome
// driven by a program that the product starts beside itself, as a server of the Model Context
// Protocol. With no window it needs no screen, no extension and no sign-in of its own, and it
// keeps a profile of its own in the OS account's home, so that what the agent signed in at
// stays signed in from one session to the next, with a window or without. The program is
// looked for by the setup (`cli/machine-check.ts`) and named to the product by its driver; the
// package neither carries it nor fetches it.

/** The program that drives the browser: Chrome DevTools for agents, as npm installs it. */
export const HEADLESS_TOOL = {
  /** What a product calls the server, and so its tools: `mcp__chrome-devtools__<tool>` in Claude Code. */
  server: "chrome-devtools",
  command: "chrome-devtools-mcp",
  install: "npm install -g chrome-devtools-mcp",
  /** What the program runs on: under an older Node.js it ends before it reads a word. */
  needs: "Node.js 20.19, 22.12 or later",
} as const;

/**
 * The words the program is started with for a session, whatever its browser shows: nothing
 * said of the agent's work to the program's maker, who is sent how its tools are used and the
 * addresses a measurement of a page's speed read unless it is started with these; and the
 * headers a sign-in is carried in left out of what its tools answer of a request, since what a
 * tool answers is in the session's record. A profile is named by no word: the program keeps its
 * own, the same one every time.
 */
const TOOL_WORDS = [
  "--no-usage-statistics",
  "--no-performance-crux",
  "--redact-network-headers",
] as const;

/** The words for a browser with no window, which is what a desk has where it names none. */
export const HEADLESS_WORDS = ["--headless", ...TOOL_WORDS] as const;

/** The words for the same browser with its window, on the desktop the OS account is logged in at. */
export const WINDOW_WORDS = [...TOOL_WORDS] as const;

/**
 * How the program is started with some words, as the system the runner is on starts it. npm
 * installs a program as a script, which on Windows is a `.cmd` file that only the system's own
 * interpreter starts: there the program is started through it, with words that are the
 * package's own and never anyone else's.
 */
export function headlessToolCommand(
  platform: string | undefined,
  words: readonly string[],
): { readonly command: string; readonly args: readonly string[] } {
  return platform === "win32"
    ? { command: "cmd", args: ["/c", HEADLESS_TOOL.command, ...words] }
    : { command: HEADLESS_TOOL.command, args: [...words] };
}

/**
 * What the program is started with beside its words: no look at a registry for a newer version
 * of itself, so that a session asks nothing of one; and on Windows, the system's interpreter
 * told to look for the program where programs are installed and never in the directory it is
 * started in first, which is the agent's desk, where a file of the program's name would
 * otherwise be what starts.
 */
function toolEnvironment(platform: string | undefined): Readonly<Record<string, string>> {
  return {
    CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
    ...(platform === "win32" ? { NoDefaultCurrentDirectoryInExePath: "1" } : {}),
  };
}

/**
 * The server a product is started with for the browser, in the shape a product reads its
 * servers in: with no window, or with one where `window` says so.
 */
export function headlessServers(
  platform: string | undefined,
  window = false,
): {
  readonly mcpServers: Readonly<
    Record<
      string,
      {
        readonly command: string;
        readonly args: readonly string[];
        readonly env: Readonly<Record<string, string>>;
      }
    >
  >;
} {
  return {
    mcpServers: {
      [HEADLESS_TOOL.server]: {
        ...headlessToolCommand(platform, window ? WINDOW_WORDS : HEADLESS_WORDS),
        env: toolEnvironment(platform),
      },
    },
  };
}
