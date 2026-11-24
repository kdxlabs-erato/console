import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatInstant, Meter, ProgressBar, Time } from "./ui.js";

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

describe("a meter, the bar of a share used (ADR-0156)", () => {
  const drawn = (share: number | undefined, tone?: "warning" | "danger"): string =>
    renderToStaticMarkup(<Meter label="Week" share={share} figure="x" tone={tone} />);
  const used = (width: string) =>
    `<rect class="sc-progress-used" width="${width}" height="100%"></rect>`;

  it("draws the share on its track, and never more than the whole or less than nothing", () => {
    expect(drawn(0.42)).toContain(used("42%"));
    expect(drawn(1)).toContain(used("100%"));
    expect(drawn(7)).toContain(used("100%"));
    // A share of nothing has its track and nothing on it; a sliver is drawn where it is seen.
    expect(drawn(0)).toContain('class="sc-progress-track"');
    expect(drawn(0)).not.toContain("sc-progress-used");
    expect(drawn(-3)).not.toContain("sc-progress-used");
    expect(drawn(0.001)).toContain(used("3%"));
  });

  it("is the row without its bar where nobody said the share", () => {
    for (const unknown of [undefined, Number.NaN]) {
      const seen = drawn(unknown);
      expect(seen).not.toContain("sc-progress-track");
      expect(seen).toContain('<span class="sc-progress-label">Week</span>');
    }
  });

  it("says by its tone what the share means, and tells the bar to nobody a second time", () => {
    expect(drawn(0.5)).toContain('<div class="sc-progress">');
    expect(drawn(0.9, "warning")).toContain('<div class="sc-progress sc-progress-near">');
    expect(drawn(1, "danger")).toContain('<div class="sc-progress sc-progress-full">');
    expect(drawn(0.5)).toContain('<svg class="sc-progress-track" aria-hidden="true"');
  });
});

describe("a moment read for how soon it is", () => {
  // Noon, so that no time zone moves a moment hours away from it into another day.
  const against = "2026-06-15T12:00:00Z";
  const shown = (iso: string, precision: "clock" | "week"): string =>
    renderToStaticMarkup(<Time iso={iso} precision={precision} against={against} />)
      .replace(/^<time[^>]*>/, "")
      .replace("</time>", "");

  it("is the hour alone today, the day of the week within six days, and the day beyond", () => {
    expect(shown("2026-06-15T12:30:00Z", "week")).toMatch(/^\d{1,2}:\d{2}\s?[AP]M$/);
    expect(shown("2026-06-18T12:30:00Z", "week")).toMatch(/^Thu,? \d{1,2}:\d{2}\s?[AP]M$/);
    expect(shown("2026-06-12T12:30:00Z", "week")).toMatch(/^Fri,? \d{1,2}:\d{2}\s?[AP]M$/);
    // A week away, the day of the week would be today's: the day is written out.
    expect(shown("2026-06-22T12:30:00Z", "week")).toMatch(/^Jun 22, \d{1,2}:\d{2}\s?[AP]M$/);
    // Where moments follow one another down a log, another day is always written out.
    expect(shown("2026-06-18T12:30:00Z", "clock")).toMatch(/^Jun 18, \d{1,2}:\d{2}\s?[AP]M$/);
  });
});
