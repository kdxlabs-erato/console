import { spawn } from "node:child_process";

// Keeping the machine awake while a runner runs (ADR-0140): an agent account's machine that goes
// to sleep when nobody touches it is an agent not heard from. The runner holds the system's own
// request not to sleep for as long as its process is there, through a helper the system ships,
// which needs no administrator and changes no setting of the machine: what it holds ends with
// the runner. A sleep someone asks for, a lid that is closed and a machine that is switched off
// are not held off; those are for whoever keeps the machine.

/** What holds a machine awake for as long as one process runs: the program, its words, and what it is called. */
export interface AwakePlan {
  readonly command: string;
  readonly args: readonly string[];
  /** What the helper is, for a line of the runner's own. */
  readonly by: string;
}

/**
 * The words of the helper on Windows: the system's own request that it stay awake, held by the
 * thread that asked for it until that thread ends, which is when the process watched is gone.
 * `2147483649` is the request that goes on (`0x80000000`) for the system to be needed
 * (`0x00000001`).
 */
const windowsScript = (pid: number): string =>
  [
    "$t = Add-Type -PassThru -Name Awake -Namespace ConsoleRunner -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);'",
    "[void]$t::SetThreadExecutionState([uint32]2147483649)",
    `try { Wait-Process -Id ${pid} -ErrorAction Stop } catch {}`,
  ].join("; ");

/**
 * What holds this kind of machine awake while the process `pid` runs, or nothing where the
 * package knows no way that needs no administrator.
 */
export function awakePlanOf(platform: string, pid: number): AwakePlan | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return undefined;
  }
  switch (platform) {
    case "darwin":
      // Idle sleep held off, and any sleep while on mains power, until the process is gone.
      return {
        command: "/usr/bin/caffeinate",
        args: ["-i", "-s", "-w", String(pid)],
        by: "caffeinate",
      };
    case "win32":
      return {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(windowsScript(pid), "utf16le").toString("base64"),
        ],
        by: "a request to the system held by powershell",
      };
    case "linux":
      return {
        command: "systemd-inhibit",
        args: [
          "--what=idle:sleep",
          "--who=console runner",
          "--why=an agent account is at work",
          "--mode=block",
          "tail",
          `--pid=${pid}`,
          "-f",
          "/dev/null",
        ],
        by: "systemd-inhibit",
      };
    default:
      return undefined;
  }
}

/** How holding the machine awake went: what holds it, or why nothing does. */
export type Awake = { readonly by: string } | { readonly problem: string };

/**
 * Starts what holds the machine awake while this process runs, and answers how it went once the
 * helper is seen to stay: one that ends at once, or is not there to start, holds nothing, and
 * the runner says so. The helper ends by itself when the process it watches is gone.
 */
export function holdAwake(
  platform: string,
  pid: number,
  env: Readonly<Record<string, string | undefined>>,
  settleMs = 4000,
): Promise<Awake> {
  const plan = awakePlanOf(platform, pid);
  if (plan === undefined) {
    return Promise.resolve({ problem: `nothing holds a machine of the kind ${platform} awake` });
  }
  return new Promise<Awake>((done) => {
    let settled = false;
    const settle = (how: Awake): void => {
      if (!settled) {
        settled = true;
        done(how);
      }
    };
    try {
      const helper = spawn(plan.command, [...plan.args], {
        env: { ...env },
        stdio: "ignore",
        windowsHide: true,
      });
      helper.once("error", () => settle({ problem: `${plan.command} could not be started` }));
      helper.once("exit", (code) =>
        settle({
          problem: `${plan.command} ended at once${code === null ? "" : ` with code ${code}`}`,
        }),
      );
      // The runner does not wait for it to end, and ends without it.
      helper.unref();
      setTimeout(() => settle({ by: plan.by }), settleMs).unref();
    } catch {
      settle({ problem: `${plan.command} could not be started` });
    }
  });
}
