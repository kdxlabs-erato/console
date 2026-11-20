import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatInstant, ProgressBar } from "./ui.js";

// What the pass over the pages decided of a moment (ADR-0135) and of a goal's bar (ADR-0138),
// held where a change would be seen on every page at once: the year is written only where it
// is another than this one's, the hour as the language writes one, and a bar draws no part of
// nothing.

describe("a moment as a page writes one (ADR-0135)", () => {
  // Noon in the middle of a year, so that no time zone moves the instant into another.
  const now = new Date("2026-06-15T12:00:00Z");
  const thisYear = "2026-03-10T12:00:00Z";
  const lastYear = "2025-03-10T12:00:00Z";

  it("leaves the year out of a moment of this year, and says it of another's", () => {
    expect(formatInstant(thisYear, "en", now)).not.toContain("2026");
    expect(formatInstant(lastYear, "en", now)).toContain("2025");
    expect(formatInstant(thisYear, "ko", now)).not.toContain("2026");
    expect(formatInstant(lastYear, "ko", now)).toContain("2025년");
  });

  it("writes the hour as the language does", () => {
    expect(formatInstant(thisYear, "en", now)).toMatch(/\d{1,2}:00\s?[AP]M/);
    expect(formatInstant(thisYear, "ko", now)).toMatch(/오[전후] \d{1,2}:00/);
  });

  it("gives back what is no moment as it was written", () => {
    expect(formatInstant("soon", "en", now)).toBe("soon");
  });
});

describe("the bar of a goal's progress (ADR-0138)", () => {
  const counts = (done: number, working: number, rest: number) => ({
    idea: rest,
    ready: 0,
    in_progress: working,
    in_review: 0,
    done,
    dropped: 0,
  });
  const drawn = (done: number, working: number, rest: number): string =>
    renderToStaticMarkup(<ProgressBar counts={counts(done, working, rest)} />);

  it("draws a part for what is done and one for what is at work, each by its share", () => {
    const both = drawn(1, 1, 2);
    expect(both).toContain('<span class="sc-progress-done" style="width:25%"></span>');
    expect(both).toContain('<span class="sc-progress-working" style="width:25%"></span>');
  });

  it("draws no part of nothing, which would leave its gap at the bar's edge", () => {
    const none = drawn(0, 0, 3);
    expect(none).not.toContain("sc-progress-done");
    expect(none).not.toContain("sc-progress-working");
    expect(drawn(2, 0, 2)).not.toContain("sc-progress-working");
    expect(drawn(0, 2, 2)).not.toContain("sc-progress-done");
    // A goal with no task at all has a bar, and nothing on it.
    expect(drawn(0, 0, 0)).toContain('class="sc-progress-bar"');
  });
});
