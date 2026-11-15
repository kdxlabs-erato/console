import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  barLengths,
  CHART_MIN_MARK,
  CHART_SERIES,
  chartLayout,
  chartMeasure,
  chartScale,
  columnOf,
  labelledPoints,
  labelStep,
  seriesClass,
  shareParts,
  sparkPoints,
} from "./charts.js";

describe("the colour a series is drawn in", () => {
  it("is one of six by its place, and the neutral past them", () => {
    expect(CHART_SERIES).toBe(6);
    expect(seriesClass(0)).toBe("sc-series-1");
    expect(seriesClass(5)).toBe("sc-series-6");
    // A seventh series is never a seventh hue: it wears what the rest folded into one wears.
    expect(seriesClass(6)).toBe("sc-series-rest");
    expect(seriesClass(-1)).toBe("sc-series-rest");
    expect(seriesClass(Number.NaN)).toBe("sc-series-rest");
    expect(seriesClass(1.5)).toBe("sc-series-rest");
  });
});

describe("a measure as an attribute says it", () => {
  it("is a share of a hundred, to three places at most", () => {
    expect(chartMeasure(50)).toBe("50%");
    expect(chartMeasure(100 / 3)).toBe("33.333%");
    expect(chartMeasure(0)).toBe("0%");
    // Never a number an attribute cannot hold.
    expect(chartMeasure(Number.NaN)).toBe("0%");
    expect(chartMeasure(Number.POSITIVE_INFINITY)).toBe("0%");
  });
});

describe("the bars of a list", () => {
  it("are as long as their amounts are of the largest", () => {
    expect(barLengths([10, 5, 0])).toEqual([100, 50, 0]);
    expect(barLengths([])).toEqual([]);
    expect(barLengths([0, 0])).toEqual([0, 0]);
  });

  it("draw nothing for what is no amount", () => {
    expect(barLengths([4, -2, Number.NaN, undefined, Number.POSITIVE_INFINITY])).toEqual([
      100, 0, 0, 0, 0,
    ]);
  });

  it("keep a small amount beside a very large one in sight", () => {
    const [large, small] = barLengths([1_000_000, 3]);
    expect(large).toBe(100);
    expect(small).toBe(CHART_MIN_MARK);
  });

  it("are measured against a whole where one is given, and never run past it", () => {
    expect(barLengths([50], 200)).toEqual([25]);
    expect(barLengths([300], 200)).toEqual([100]);
    // A whole that is none is not one: the largest stands in.
    expect(barLengths([50, 25], 0)).toEqual([100, 50]);
    expect(barLengths([50, 25], Number.NaN)).toEqual([100, 50]);
  });
});

describe("the parts of a whole", () => {
  it("stand one after the other, each as wide as its share", () => {
    expect(shareParts([1, 1, 2])).toEqual([
      { start: 0, width: 25, share: 0.25 },
      { start: 25, width: 25, share: 0.25 },
      { start: 50, width: 50, share: 0.5 },
    ]);
  });

  it("are nothing where the whole is nothing, and count no amount that is none", () => {
    expect(shareParts([0, 0])).toEqual([
      { start: 0, width: 0, share: 0 },
      { start: 0, width: 0, share: 0 },
    ]);
    expect(shareParts([3, -1, Number.NaN, undefined, 1])).toEqual([
      { start: 0, width: 75, share: 0.75 },
      { start: 75, width: 0, share: 0 },
      { start: 75, width: 0, share: 0 },
      { start: 75, width: 0, share: 0 },
      { start: 75, width: 25, share: 0.25 },
    ]);
    expect(shareParts([])).toEqual([]);
  });

  it("keep a part that is something in sight, at the largest part's cost", () => {
    const [large, small] = shareParts([99_940, 60]);
    expect(small).toEqual({ start: 100 - CHART_MIN_MARK, width: CHART_MIN_MARK, share: 0.0006 });
    expect(large?.width).toBe(100 - CHART_MIN_MARK);
    // What it is of the whole is still said as it is.
    expect(large?.share).toBe(0.9994);
  });
});

describe("the scale of a chart", () => {
  it("runs from zero to a round number past the largest, in round steps", () => {
    expect(chartScale([120, 1204, 800])).toEqual({
      min: 0,
      max: 1500,
      ticks: [0, 500, 1000, 1500],
    });
    expect(chartScale([3, 1, 2])).toEqual({ min: 0, max: 3, ticks: [0, 1, 2, 3] });
    expect(chartScale([87])).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
  });

  it("counts whole things in whole steps", () => {
    expect(chartScale([1])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(chartScale([2, 1])).toEqual({ min: 0, max: 2, ticks: [0, 1, 2] });
  });

  it("steps by parts where the amounts are parts, without the noise of the arithmetic", () => {
    expect(chartScale([0.2, 0.7])).toEqual({ min: 0, max: 0.8, ticks: [0, 0.2, 0.4, 0.6, 0.8] });
  });

  it("goes below zero where an amount does", () => {
    expect(chartScale([-5, 10])).toEqual({ min: -5, max: 10, ticks: [-5, 0, 5, 10] });
    expect(chartScale([-3])).toEqual({ min: -3, max: 0, ticks: [-3, -2, -1, 0] });
  });

  it("is a scale all the same where there is nothing to measure", () => {
    expect(chartScale([])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(chartScale([0, 0])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(chartScale([undefined, Number.NaN, Number.NEGATIVE_INFINITY])).toEqual({
      min: 0,
      max: 1,
      ticks: [0, 1],
    });
  });

  it("holds amounts of very different size, and very large ones", () => {
    expect(chartScale([3, 12_000])).toEqual({
      min: 0,
      max: 15_000,
      ticks: [0, 5000, 10_000, 15_000],
    });
    const large = chartScale([9e15]);
    expect(large.max).toBeGreaterThanOrEqual(9e15);
    expect(large.ticks.length).toBeLessThanOrEqual(7);
    expect(large.ticks.every((tick) => Number.isFinite(tick))).toBe(true);
  });
});

describe("the places of a chart", () => {
  it("puts each point in the middle of its share of the width", () => {
    expect(chartLayout(4, []).across).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(chartLayout(1, []).across).toEqual([50]);
    expect(chartLayout(0, []).across).toEqual([]);
  });

  it("puts each amount as far from the top as it is from the largest tick", () => {
    const layout = chartLayout(3, [[0, 750, 1500]]);
    expect(layout.scale.max).toBe(1500);
    expect(layout.zero).toBe(100);
    expect(layout.series).toEqual([[100, 50, 0]]);
    expect(layout.ticks).toEqual([
      { value: 1500, at: 0 },
      { value: 1000, at: 100 / 3 },
      { value: 500, at: 200 / 3 },
      { value: 0, at: 100 },
    ]);
  });

  it("leaves a point with no amount out, and reads no more points than there are", () => {
    const layout = chartLayout(3, [[10, undefined, Number.NaN, 99]]);
    expect(layout.series).toEqual([[0, undefined, undefined]]);
    // What is past the points is not measured either.
    expect(layout.scale.max).toBe(10);
  });

  it("measures every series by the one scale", () => {
    const layout = chartLayout(2, [
      [100, 200],
      [1, 2],
    ]);
    expect(layout.scale).toEqual({ min: 0, max: 200, ticks: [0, 50, 100, 150, 200] });
    expect(layout.series[1]).toEqual([99.5, 99]);
  });

  it("stands zero where it is, with amounts below it", () => {
    const layout = chartLayout(2, [[-5, 10]]);
    expect(layout.zero).toBeCloseTo(66.667, 2);
    expect(layout.series[0]?.[0]).toBe(100);
    expect(layout.series[0]?.[1]).toBe(0);
  });

  it("is a plot of one point, and of none", () => {
    expect(chartLayout(1, [[7]]).series).toEqual([[12.5]]);
    const empty = chartLayout(0, []);
    expect(empty.series).toEqual([]);
    expect(empty.scale).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });
});

describe("a column", () => {
  it("stands from zero up to its amount", () => {
    expect(columnOf(25, 100)).toEqual({ top: 25, height: 75, down: false });
    expect(columnOf(0, 100)).toEqual({ top: 0, height: 100, down: false });
  });

  it("hangs from zero down to an amount below it", () => {
    expect(columnOf(100, 60)).toEqual({ top: 60, height: 40, down: true });
  });

  it("is nothing at zero and where there is no amount", () => {
    expect(columnOf(100, 100)).toBeUndefined();
    expect(columnOf(undefined, 100)).toBeUndefined();
  });

  it("keeps a small amount in sight", () => {
    expect(columnOf(99.98, 100)).toEqual({
      top: 100 - CHART_MIN_MARK,
      height: CHART_MIN_MARK,
      down: false,
    });
    expect(columnOf(60.01, 60)).toEqual({ top: 60, height: CHART_MIN_MARK, down: true });
  });
});

describe("a sparkline", () => {
  it("runs from the first amount to the last, the largest near the top", () => {
    expect(sparkPoints([1, 3, 2])).toEqual([
      { x: 0, y: 88 },
      { x: 50, y: 12 },
      { x: 100, y: 50 },
    ]);
  });

  it("is a point in the middle for one amount, and a level line for amounts that are one", () => {
    expect(sparkPoints([4])).toEqual([{ x: 50, y: 50 }]);
    expect(sparkPoints([4, 4])).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]);
  });

  it("is nothing for nothing, and passes over what is no amount", () => {
    expect(sparkPoints([])).toEqual([]);
    expect(sparkPoints([undefined, Number.NaN])).toEqual([]);
    expect(sparkPoints([1, undefined, 2])).toEqual([
      { x: 0, y: 88 },
      { x: 100, y: 12 },
    ]);
  });
});

describe("the labels under a chart", () => {
  const sorted = (points: ReadonlySet<number>) => [...points].sort((a, b) => a - b);

  it("stand as near as they fit in the room there is", () => {
    const weeks = ["Sep 15", "Sep 22", "Sep 29", "Oct 6", "Oct 13", "Oct 20", "Oct 27", "Nov 3"];
    // Six letters and the room between two labels: four of them in thirty-six letters' room.
    expect(labelStep(weeks, 36)).toBe(2);
    expect(labelStep(weeks, 90)).toBe(1);
    expect(labelStep(["Today"], 36)).toBe(1);
    expect(labelStep([], 36)).toBe(1);
    // A label longer than the room there is still stands, alone.
    expect(labelStep(["a", "b", "x".repeat(200)], 36)).toBe(3);
    expect(labelStep(["a", "b"], Number.NaN)).toBe(2);
  });

  it("count a wide letter as two", () => {
    const weeks = ["9월 15일", "9월 22일", "9월 29일", "10월 6일"];
    // Each takes eight letters' room and two between: three fit in thirty-six, so every other one.
    expect(labelStep(weeks, 36)).toBe(2);
  });

  it("are counted back from the last point, which always has its label", () => {
    expect(sorted(labelledPoints(8, 2))).toEqual([1, 3, 5, 7]);
    expect(sorted(labelledPoints(8, 1))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(sorted(labelledPoints(30, 9))).toEqual([2, 11, 20, 29]);
    expect(sorted(labelledPoints(3, 3))).toEqual([2]);
    expect(sorted(labelledPoints(1, 1))).toEqual([0]);
    expect(sorted(labelledPoints(0, 1))).toEqual([]);
    // A step that is none is every point, never a loop without an end.
    expect(sorted(labelledPoints(2, 0))).toEqual([0, 1]);
    expect(sorted(labelledPoints(2, Number.NaN))).toEqual([0, 1]);
  });
});

describe("the measures, to a plugin's bundle", () => {
  it("are an entry of the package of their own, and lean on nothing", async () => {
    const manifest = JSON.parse(
      await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { readonly exports: Readonly<Record<string, unknown>> };
    expect(manifest.exports["./charts"]).toEqual({
      types: "./dist/charts.d.ts",
      default: "./dist/charts.js",
    });
    // A plain bundle takes them without React and without the console: the source imports nothing.
    const source = await readFile(fileURLToPath(new URL("./charts.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/ from "/);
  });
});
