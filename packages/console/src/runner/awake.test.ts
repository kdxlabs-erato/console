import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { awakePlanOf, holdAwake } from "./awake.js";

// Keeping the machine awake while a runner runs (ADR-0140): what the system's own helper is
// asked, by platform, and that a helper that is not there holds nothing and says so.

describe("what holds a machine awake while the runner runs", () => {
  it("asks the system's own helper, for as long as the runner's process is there", () => {
    expect(awakePlanOf("darwin", 412)).toEqual({
      command: "/usr/bin/caffeinate",
      args: ["-i", "-s", "-w", "412"],
      by: "caffeinate",
    });
    const linux = awakePlanOf("linux", 412);
    expect(linux?.command).toBe("systemd-inhibit");
    expect(linux?.args).toContain("--what=idle:sleep");
    expect(linux?.args.slice(-4)).toEqual(["tail", "--pid=412", "-f", "/dev/null"]);
    // On Windows the request is held by a script handed over encoded, so that nothing of it is
    // read by a shell on the way: it names the process to wait for, and nothing else of ours.
    const windows = awakePlanOf("win32", 412);
    expect(windows?.command).toBe("powershell.exe");
    expect(windows?.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-EncodedCommand"]);
    const script = Buffer.from(windows?.args[3] ?? "", "base64").toString("utf16le");
    expect(script).toContain("SetThreadExecutionState([uint32]2147483649)");
    expect(script).toContain("Wait-Process -Id 412");
  });

  it("holds nothing where the system has no such helper, or the process is none", async () => {
    expect(awakePlanOf("aix", 412)).toBeUndefined();
    expect(awakePlanOf("darwin", 0)).toBeUndefined();
    expect(awakePlanOf("darwin", Number.NaN)).toBeUndefined();
    expect(await holdAwake("aix", 412, {})).toEqual({
      problem: "nothing holds a machine of the kind aix awake",
    });
  });

  it("says that it holds once the helper is seen to stay, and why not where it is not there or ends at once", async () => {
    /** A helper that touches no machine: what it says of itself is said by the test. */
    const helperOf = () => {
      const said = new EventEmitter();
      let waited = true;
      return {
        said,
        waitedFor: () => waited,
        helper: {
          once: (event: string, listener: (code: number | null) => void) =>
            said.once(event, listener),
          unref: () => {
            waited = false;
          },
        },
      };
    };
    // It stays: held, by what the plan calls it, and the runner does not wait for it to end.
    const staying = helperOf();
    const started: string[] = [];
    expect(
      await holdAwake("darwin", 412, { PATH: "/usr/bin" }, 20, (plan, env) => {
        started.push(`${plan.command} ${plan.args.join(" ")} ${env.PATH}`);
        return staying.helper;
      }),
    ).toEqual({ by: "caffeinate" });
    expect(started).toEqual(["/usr/bin/caffeinate -i -s -w 412 /usr/bin"]);
    expect(staying.waitedFor()).toBe(false);
    // It ends at once, as one the system refuses does: nothing is held, and why is said.
    const refused = helperOf();
    const ended = holdAwake("linux", 412, {}, 200, () => refused.helper);
    refused.said.emit("exit", 1);
    expect(await ended).toEqual({ problem: "systemd-inhibit ended at once with code 1" });
    // It is not there to start.
    const absent = helperOf();
    const missing = holdAwake("linux", 412, {}, 200, () => absent.helper);
    absent.said.emit("error", new Error("spawn systemd-inhibit ENOENT"));
    expect(await missing).toEqual({ problem: "systemd-inhibit could not be started" });
    expect(
      await holdAwake("linux", 412, {}, 200, () => {
        throw new Error("EACCES");
      }),
    ).toEqual({ problem: "systemd-inhibit could not be started" });
  });
});
