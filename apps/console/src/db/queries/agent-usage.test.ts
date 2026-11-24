import { describe, expect, it } from "vitest";
import { type UsageKept, usageAfter } from "./agent-runners.js";

// What is kept of an agent account's allowance after a heartbeat (ADR-0156), apart from the
// database: a window the runner names replaces the one kept under its name, one it does not
// name stands while its reset is to come, and a heartbeat that says nothing changes nothing.

const NOW = new Date("2026-11-24T03:00:00.000Z");
const at = "2026-11-24T02:59:00.000Z";
const window = (name: string, resetsAt: string | null, used: number | null = 0.5): UsageKept => ({
  name,
  used,
  resetsAt,
  at,
});
const SOON = "2026-11-24T05:00:00.000Z";
const PAST = "2026-11-24T02:00:00.000Z";

describe("what a heartbeat leaves of an account's allowance", () => {
  it("changes nothing where the runner says nothing of it", () => {
    expect(usageAfter(null, undefined, NOW)).toBeNull();
    const kept = [window("5-hour", SOON)];
    expect(usageAfter(kept, undefined, NOW)).toEqual(kept);
    // Even a window that is over: nothing was said, so nothing is judged.
    expect(usageAfter([window("5-hour", PAST)], undefined, NOW)).toEqual([window("5-hour", PAST)]);
  });

  it("puts a window named in the place of the one kept under its name, and keeps the others still to reset", () => {
    expect(
      usageAfter(
        [window("5-hour", SOON, 0.2), window("weekly", SOON, 0.1)],
        [window("5-hour", SOON, 0.9)],
        NOW,
      ),
    ).toEqual([window("5-hour", SOON, 0.9), window("weekly", SOON, 0.1)]);
  });

  it("lets go a window whose reset has passed, or that named none, once the runner names it no more", () => {
    expect(
      usageAfter(
        [window("5-hour", PAST), window("primary", null), window("weekly", SOON)],
        [],
        NOW,
      ),
    ).toEqual([window("weekly", SOON)]);
    // At the moment of the reset itself the window is over.
    expect(usageAfter([window("5-hour", NOW.toISOString())], [], NOW)).toBeNull();
    // A moment that does not read is of no window that still stands.
    expect(usageAfter([window("5-hour", "soon")], [], NOW)).toBeNull();
    expect(usageAfter(null, [], NOW)).toBeNull();
  });

  it("keeps what the runner names as it said it, a window that is over among it, and no more than a heartbeat carries", () => {
    // What the runner says now is the runner's to say: the pages leave out what is over.
    expect(usageAfter(null, [window("5-hour", PAST)], NOW)).toEqual([window("5-hour", PAST)]);
    const many = Array.from({ length: 8 }, (_, index) => window(`w${index}`, SOON));
    expect(usageAfter([window("weekly", SOON)], many, NOW)).toEqual(many);
  });
});
