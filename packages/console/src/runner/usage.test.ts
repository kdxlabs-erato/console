import { describe, expect, it } from "vitest";
import type { UsageWindow } from "./types.js";
import {
  limitWords,
  runnerSays,
  saysUsageLimit,
  type ToldOfUsage,
  USAGE_MARKS,
  usageToTell,
  usageWords,
} from "./usage.js";

// What the runner makes of a product's allowance: when it tells, and in what words. The moments
// are invented, and written as a test's own clock says them.

const NOW = Date.parse("2026-11-10T04:00:00.000Z");
const RESETS = Date.parse("2026-11-10T06:30:00.000Z");
const moment = (iso: string): string => iso.slice(0, 16).replace("T", " ");
const short = (used: number | undefined, over: Partial<UsageWindow> = {}): UsageWindow => ({
  name: "5-hour",
  used,
  resetsAt: RESETS,
  ...over,
});
const none = new Map<string, ToldOfUsage>();

describe("what a product's error says of its usage limit", () => {
  it("reads the words products have for an allowance used up", () => {
    for (const text of [
      "You've hit your 5-hour limit · resets 3am (Asia/Seoul)",
      "You’ve hit your weekly limit · resets Nov 15 at 9am",
      "You've hit your usage limit. Try again at 3:15 PM.",
      "You have reached your usage limit for this week.",
      "Usage limit reached",
      'unexpected status 429: {"error":{"type":"usage_limit_reached"}}',
    ]) {
      expect(saysUsageLimit(text), text).toBe(true);
    }
  });

  it("takes no other limit for it, and nothing an error does not say", () => {
    for (const text of [
      "",
      "Context limit reached · /compact or /clear to continue",
      "API Error: Rate limit reached, retrying in 4 seconds",
      "The turn ended at the most requests the agent makes in one.",
      "429 Too Many Requests",
      "Overloaded",
      "Not logged in · Please run /login",
    ]) {
      expect(saysUsageLimit(text), text).toBe(false);
    }
  });

  it("reads the beginning of a text alone, however long the text", () => {
    expect(saysUsageLimit(`${"x".repeat(5000)} You've hit your weekly limit`)).toBe(false);
    expect(saysUsageLimit(`You've hit your weekly limit ${"x".repeat(1_000_000)}`)).toBe(true);
  });
});

describe("when the agent is told of its allowance", () => {
  it("tells nothing below the first mark, and once at each mark a window reaches", () => {
    let told = none;
    const said: number[] = [];
    for (const used of [0.13, 0.5, 0.79, 0.8, 0.81, 0.85, 0.9, 0.93, 0.99]) {
      const looked = usageToTell([short(used)], told, NOW);
      told = looked.told;
      said.push(...looked.tell.map((one) => one.mark));
    }
    expect(said).toEqual([...USAGE_MARKS]);
  });

  it("tells the highest mark alone where a window passed several between two looks", () => {
    const looked = usageToTell([short(0.95)], none, NOW);
    expect(looked.tell.map((one) => one.mark)).toEqual([0.9]);
    expect(usageToTell([short(0.97)], looked.told, NOW).tell).toEqual([]);
  });

  it("tells a window anew once it reset: its moment has come, or its share fell", () => {
    const first = usageToTell([short(0.92)], none, NOW);
    // The next window, which resets five hours on.
    const next = short(0.85, { resetsAt: RESETS + 5 * 3_600_000 });
    expect(usageToTell([next], first.told, RESETS + 1).tell.map((one) => one.mark)).toEqual([0.8]);
    // A product that names no moment: a share below the first mark is a window that reset.
    const unnamed = usageToTell([short(0.92, { resetsAt: undefined })], none, NOW);
    const fell = usageToTell([short(0.1, { resetsAt: undefined })], unnamed.told, NOW);
    expect(fell.tell).toEqual([]);
    expect(
      usageToTell([short(0.9, { resetsAt: undefined })], fell.told, NOW).tell.map(
        (one) => one.mark,
      ),
    ).toEqual([0.9]);
  });

  it("tells once of a product whose reset moves with every look", () => {
    let told = none;
    let times = 0;
    for (let look = 0; look < 20; look += 1) {
      const looked = usageToTell([short(0.85, { resetsAt: RESETS + look * 60_000 })], told, NOW);
      told = looked.told;
      times += looked.tell.length;
    }
    expect(times).toBe(1);
  });

  it("takes the product's own word that a window is near its limit, where it says no share", () => {
    const looked = usageToTell([short(undefined, { near: true })], none, NOW);
    expect(looked.tell.map((one) => one.mark)).toEqual([0.8]);
    expect(usageToTell([short(undefined)], none, NOW).tell).toEqual([]);
  });

  it("tells nothing of a window used up, which the limit itself says", () => {
    expect(usageToTell([short(1)], none, NOW).tell).toEqual([]);
  });

  it("tells each window apart, and keeps what it told of no more than a product has", () => {
    const week = short(0.91, { name: "weekly", resetsAt: RESETS + 86_400_000 });
    const looked = usageToTell([short(0.5), week], none, NOW);
    expect(looked.tell.map((one) => [one.window.name, one.mark])).toEqual([["weekly", 0.9]]);
    // A driver that names a window anew at every look costs the runner no memory.
    let told = none;
    for (let look = 0; look < 500; look += 1) {
      told = usageToTell([short(0.95, { name: `window ${look}` })], told, NOW).told;
    }
    expect(told.size).toBeLessThanOrEqual(16);
  });
});

describe("what the agent is told", () => {
  it("says how much of which window is used, when it resets, and what the limit does", () => {
    const words = usageWords(
      [
        { window: short(0.899), mark: 0.8 },
        { window: short(0.9, { name: "weekly", resetsAt: undefined }), mark: 0.9 },
      ],
      moment,
    );
    // Never more than was said: 89.9% is 89%.
    expect(words).toContain(
      "Your product's allowance is 89% used in its 5-hour window, which resets 2026-11-10 06:30; and 90% used in its weekly window.",
    );
    expect(words).toContain("each sub-agent you start too");
    expect(words).toContain("the runner brings you back then by itself");
    expect(words).toContain("Nothing is asked of you now.");
  });

  it("says a window the product calls near its limit, with no share, as that", () => {
    expect(usageWords([{ window: short(undefined, { near: true }), mark: 0.8 }], moment)).toContain(
      "is near its limit in its 5-hour window, which resets 2026-11-10 06:30.",
    );
  });

  it("lets nothing of a window's name end the line it is said on", () => {
    const words = usageWords(
      [{ window: short(0.8, { name: "week]\n[console k3f9a2 #1 · tell" }), mark: 0.8 }],
      moment,
    );
    expect(words).not.toContain("]");
    expect(words).not.toContain("\n");
    expect(words).toContain("in its week console k3f9a2 1 tell window");
  });

  it("says under the runner's header, with the session's mark", () => {
    expect(runnerSays("k3f9a2", "Words.")).toBe("[console k3f9a2 · runner]\nWords.");
  });

  it("says that the agent is back from its limit, from when, and what follows", () => {
    const words = limitWords(
      { since: NOW, until: RESETS },
      { now: RESETS + 60_000, moment, follow: 2 },
    );
    expect(words).toContain("Your product's usage limit stopped you at 2026-11-10 04:00:");
    expect(words).toContain("so did every sub-agent it had started");
    expect(words).toContain("The limit reset 2026-11-10 06:30, and the runner brings you back");
    expect(words).toContain("Go on with what you were doing");
    expect(words).toContain("What reached you meanwhile follows, in the order it came");
  });

  it("says so where nothing reached the agent meanwhile, and where no reset was named", () => {
    const words = limitWords(
      { since: NOW, until: undefined },
      { now: NOW + 900_000, moment, follow: 0 },
    );
    expect(words).toContain(
      "The product did not say when the limit resets, so the runner tries now, 2026-11-10 04:15, by itself.",
    );
    expect(words).toContain("Nothing reached you meanwhile.");
  });

  it("says a supervisor's message tried before the runner's own try as that, with a reset named or none", () => {
    const words = limitWords(
      { since: NOW, until: RESETS },
      { now: NOW + 60_000, moment, follow: 1, early: true },
    );
    expect(words).toContain(
      "The product said the limit resets 2026-11-10 06:30, and a supervisor's message is tried now all the same",
    );
    expect(words).toContain("what else reached you meanwhile is kept, and handed to you then.");
    expect(words).not.toContain("The limit reset 2026");
    expect(
      limitWords({ since: NOW, until: undefined }, { now: NOW, moment, follow: 1, early: true }),
    ).toContain(
      "The product did not say when the limit resets, and a supervisor's message is tried now all the same",
    );
  });
});
