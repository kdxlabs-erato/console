import { describe, expect, it } from "vitest";
import { USAGE_NEAR, usageNear, usageStanding, usedHundredths } from "./agent-usage.js";

// How the pages and the command read what an agent account's product said of its allowance
// (ADR-0156): which windows still stand, and how a share is said.

const NOW = Date.parse("2026-11-24T03:00:00.000Z");

describe("the windows of an allowance that still stand", () => {
  it("leaves out a window whose reset has passed, and keeps one that names none", () => {
    const usage = [
      { name: "5-hour", resetsAt: "2026-11-24T02:59:59.000Z" },
      { name: "weekly", resetsAt: "2026-11-27T05:00:00.000Z" },
      { name: "primary", resetsAt: null },
      { name: "now", resetsAt: "2026-11-24T03:00:00.000Z" },
    ];
    expect(usageStanding(usage, NOW).map((window) => window.name)).toEqual(["weekly", "primary"]);
    expect(usageStanding(undefined, NOW)).toEqual([]);
    expect(usageStanding(null, NOW)).toEqual([]);
    expect(usageStanding([], NOW)).toEqual([]);
  });

  it("keeps a window whose moment does not read: what a console answers is shown as it came", () => {
    expect(usageStanding([{ name: "weekly", resetsAt: "later" }], NOW)).toHaveLength(1);
  });
});

describe("a share of a window", () => {
  it("is said in whole hundredths, never more than was said", () => {
    expect(usedHundredths(0)).toBe(0);
    expect(usedHundredths(0.42)).toBe(42);
    expect(usedHundredths(0.899)).toBe(89);
    expect(usedHundredths(0.29)).toBe(29);
    expect(usedHundredths(1)).toBe(100);
    // What a console answers is read as a number and held to the range all the same.
    expect(usedHundredths(1.7)).toBe(100);
    expect(usedHundredths(-0.2)).toBe(0);
  });

  it("is near its limit from the first mark on, or where the product itself says so", () => {
    expect(USAGE_NEAR).toBe(0.8);
    expect(usageNear({ used: 0.79 })).toBe(false);
    expect(usageNear({ used: 0.8 })).toBe(true);
    expect(usageNear({ used: null })).toBe(false);
    expect(usageNear({ used: null, near: true })).toBe(true);
    expect(usageNear({ used: 0.1, near: true })).toBe(true);
  });
});
