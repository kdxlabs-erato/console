// The measures of the charts (ADR-0123): how long a bar is, where a part of a whole stands, how
// high a column rises and where a line runs, each as a share of a hundred. An SVG's attributes
// take a share as they take a number, so a chart is sized by the box a stylesheet gives it and
// nothing here is a style: the parts' classes draw, these place. Pure, and with no dependency:
// the components (`components/charts.tsx`) draw with them on a console's pages, and a plugin's
// plain bundle draws the same classes with them (`@skillcdn/console/charts`).

/** How many series a chart tells apart by colour; what is past them wears the neutral. */
export const CHART_SERIES = 6;

/**
 * The least a mark that stands for an amount is drawn at, of a hundred: an amount beside one a
 * thousand times its size is still something, and is drawn as something.
 */
export const CHART_MIN_MARK = 1;

/** The room, in letters, the labels under a chart are thinned for: a phone's width, and a pane's. */
export const CHART_LABEL_ROOM = { narrow: 36, wide: 90 } as const;

/**
 * The class a series is drawn in, by its place from nought: one of the six colours, or the
 * neutral for what is past them, since a seventh series is never a seventh hue but the rest
 * folded into one.
 */
export function seriesClass(index: number): string {
  return Number.isInteger(index) && index >= 0 && index < CHART_SERIES
    ? `sc-series-${index + 1}`
    : "sc-series-rest";
}

/** An amount a chart can place: a finite number. Anything else is nothing. */
function amountOf(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A share of a hundred as an attribute says it, to three places at most. */
export function chartMeasure(share: number): string {
  const amount = amountOf(share) ?? 0;
  return `${Math.round(amount * 1000) / 1000}%`;
}

/**
 * How long each bar of a list is, of a hundred: its amount of the largest, or of `whole` where
 * one is given. What is no amount, or below nothing, draws no bar; a small amount keeps the
 * least a mark is drawn at.
 */
export function barLengths(
  values: readonly (number | undefined)[],
  whole?: number | undefined,
): readonly number[] {
  const amounts = values.map((value) => Math.max(0, amountOf(value) ?? 0));
  const given = amountOf(whole);
  const full = given !== undefined && given > 0 ? given : Math.max(0, ...amounts);
  return amounts.map((amount) =>
    amount === 0 || full === 0 ? 0 : Math.min(100, Math.max(CHART_MIN_MARK, (amount * 100) / full)),
  );
}

/** A part of a whole in a bar: where it starts and how wide it is, of a hundred, and its share of one. */
export interface SharePart {
  readonly start: number;
  readonly width: number;
  readonly share: number;
}

/**
 * The parts of a whole, one after the other, each as wide as its share; nothing where the whole
 * is nothing. A part that is something keeps the least a mark is drawn at, which the largest
 * part gives up: its `share` stays what it is.
 */
export function shareParts(values: readonly (number | undefined)[]): readonly SharePart[] {
  const amounts = values.map((value) => Math.max(0, amountOf(value) ?? 0));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const widths = amounts.map((amount) =>
    amount === 0 || total === 0 ? 0 : Math.max(CHART_MIN_MARK, (amount * 100) / total),
  );
  const over = widths.reduce((sum, width) => sum + width, 0) - 100;
  const largest = widths.indexOf(Math.max(...widths));
  let start = 0;
  return amounts.map((amount, index) => {
    const width =
      index === largest && over > 0 ? (widths[index] ?? 0) - over : (widths[index] ?? 0);
    const part = { start, width, share: total === 0 ? 0 : amount / total };
    start += width;
    return part;
  });
}

/** The scale of a chart: from where to where it measures, and the round amounts it marks. */
export interface ChartScale {
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
}

/** A step and its multiples without the noise of the arithmetic: 0.6, never 0.6000000000000001. */
function round(value: number): number {
  return Number(value.toPrecision(12)) + 0;
}

/**
 * The scale that holds some amounts: from zero, or from below it where an amount is, to a round
 * number past the largest, marked in about `steps` round steps (1, 2, 2.5 or 5 of a power of
 * ten; whole steps where every amount is whole). Zero to one where there is nothing to measure.
 */
export function chartScale(values: readonly (number | undefined)[], steps = 4): ChartScale {
  const amounts = values.flatMap((value) => {
    const amount = amountOf(value);
    return amount === undefined ? [] : [amount];
  });
  const low = Math.min(0, ...amounts);
  const high = Math.max(0, ...amounts);
  const span = high - low;
  if (span === 0) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }
  const rough = span / Math.max(1, steps);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const whole = amounts.every((amount) => Number.isInteger(amount));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((nice) => round(nice * magnitude))
      .find((nice) => nice >= rough && (!whole || Number.isInteger(nice))) ??
    Math.max(1, round(10 * magnitude));
  const min = round(Math.floor(round(low / step)) * step);
  const max = round(Math.ceil(round(high / step)) * step);
  const count = Math.round((max - min) / step);
  return {
    min,
    max,
    ticks: Array.from({ length: count + 1 }, (_, index) => round(min + index * step)),
  };
}

/** Where a chart puts what it draws, each place a share of a hundred of the plot. */
export interface ChartLayout {
  readonly scale: ChartScale;
  /** The scale's marks from the top down, each with how far from the top its line stands. */
  readonly ticks: readonly { readonly value: number; readonly at: number }[];
  /** How far from the top zero stands: where a column starts. */
  readonly zero: number;
  /** How far across each point stands: the middle of its share of the width. */
  readonly across: readonly number[];
  /** For each series, how far from the top each point's amount stands, or nothing where it has none. */
  readonly series: readonly (readonly (number | undefined)[])[];
}

/**
 * The places of a chart of `points` points: one scale for every series, each amount as far from
 * the top as it is from the scale's largest mark. A series is read for as many points as there
 * are and no further.
 */
export function chartLayout(
  points: number,
  series: readonly (readonly (number | undefined)[])[],
  steps?: number | undefined,
): ChartLayout {
  const count = Math.max(0, Math.floor(amountOf(points) ?? 0));
  const read = series.map((values) =>
    Array.from({ length: count }, (_, index) => amountOf(values[index])),
  );
  const scale = chartScale(read.flat(), steps);
  const span = scale.max - scale.min;
  const at = (value: number) => ((scale.max - value) * 100) / span;
  return {
    scale,
    ticks: [...scale.ticks].reverse().map((value) => ({ value, at: at(value) })),
    zero: at(0),
    across: Array.from({ length: count }, (_, index) => ((index + 0.5) * 100) / count),
    series: read.map((values) =>
      values.map((value) => (value === undefined ? undefined : at(value))),
    ),
  };
}

/** A column: how far from the top it starts, how tall it is, and whether it hangs below zero. */
export interface ChartColumn {
  readonly top: number;
  readonly height: number;
  readonly down: boolean;
}

/**
 * The column of an amount that stands `at` from the top, where zero stands at `zero`: from zero
 * up to it, or down to it where it is below. Nothing at zero, and nothing where there is no
 * amount; a small amount keeps the least a mark is drawn at.
 */
export function columnOf(at: number | undefined, zero: number): ChartColumn | undefined {
  if (at === undefined || at === zero) {
    return undefined;
  }
  const down = at > zero;
  const height = Math.max(CHART_MIN_MARK, Math.abs(zero - at));
  return { top: down ? zero : zero - height, height, down };
}

/**
 * The points of a sparkline, of a hundred each way: from the first amount to the last, the
 * largest near the top and the smallest near the bottom, with room left for the line's own
 * width. One amount is a point in the middle; amounts that are all one are a level line.
 */
export function sparkPoints(
  values: readonly (number | undefined)[],
): readonly { readonly x: number; readonly y: number }[] {
  const amounts = values.flatMap((value) => {
    const amount = amountOf(value);
    return amount === undefined ? [] : [amount];
  });
  const low = Math.min(...amounts);
  const span = Math.max(...amounts) - low;
  return amounts.map((amount, index) => ({
    x: amounts.length === 1 ? 50 : (index * 100) / (amounts.length - 1),
    y: span === 0 ? 50 : 88 - ((amount - low) * 76) / span,
  }));
}

/** How much room a label takes, in letters: a wide letter, a Hangul syllable say, counts as two. */
function lettersOf(label: string): number {
  let letters = 0;
  for (const letter of label) {
    letters += (letter.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1;
  }
  return letters;
}

/**
 * How many points apart the labels under a chart stand where there is room for `room` letters:
 * as near as they fit with two letters between them. One where every label fits.
 */
export function labelStep(labels: readonly string[], room: number): number {
  if (labels.length === 0) {
    return 1;
  }
  const longest = Math.max(...labels.map(lettersOf));
  const fit = Math.max(1, Math.floor((amountOf(room) ?? 0) / (longest + 2)));
  return Math.ceil(labels.length / fit);
}

/**
 * The points labelled, of `count`, where every `step`th is: counted back from the last, which
 * always is, since the latest is what a reader looks for.
 */
export function labelledPoints(count: number, step: number): ReadonlySet<number> {
  const shown = new Set<number>();
  const every = Math.max(1, Math.floor(amountOf(step) ?? 1));
  for (let index = Math.floor(amountOf(count) ?? 0) - 1; index >= 0; index -= every) {
    shown.add(index);
  }
  return shown;
}
