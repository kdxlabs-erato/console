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
});
