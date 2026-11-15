import type { ReactNode } from "react";
import {
  barLengths,
  CHART_LABEL_ROOM,
  chartLayout,
  chartMeasure,
  columnOf,
  labelledPoints,
  labelStep,
  seriesClass,
  shareParts,
  sparkPoints,
} from "../charts.js";

// The charts (ADR-0123): a figure, a list of bars, a chart over time, a sparkline, a share, the
// legend they share and a table of figures, each a part of the console's look with its class in
// the stylesheet and its row in the catalogue. A component here places and the stylesheet
// draws: every measure is an attribute of an SVG, a share of the box the stylesheet gives it,
// and no colour and no size is written here. Each takes its figures as props and nothing from
// the network, says what it shows to a reader who cannot see it (its figures stand beside the
// drawing as text, or under it as a table), and renders what it is given as text. They lean on
// React and the measures alone, so that a page of a desk and a plugin's bundle take them
// without taking the console.

/** A number as a language writes it; the browser's language where none is named. */
function amountWords(value: number, language: string | undefined): string {
  return value.toLocaleString(language, { maximumFractionDigits: 2 });
}

/**
 * A share of one as a language writes it: 46%. A part that is something is never said to be
 * none, nor a part that is not the whole to be all of it: under 1% and over 99% say so.
 */
function shareWords(share: number, language: string | undefined): string {
  const words = (amount: number) =>
    amount.toLocaleString(language, { style: "percent", maximumFractionDigits: 0 });
  return share > 0 && share < 0.005
    ? `<${words(0.01)}`
    : share < 1 && share >= 0.995
      ? `>${words(0.99)}`
      : words(share);
}

/**
 * An amount of a scale as a language writes it short: 1.5M, 20K. A scale that reaches ten
 * thousand is marked so, since its marks are read at a glance and the figures themselves stand
 * in full beside it.
 */
function shortWords(value: number, language: string | undefined): string {
  return value.toLocaleString(language, { notation: "compact", maximumFractionDigits: 1 });
}

/** The classes of an element: those that are there. */
function classes(...names: readonly (string | false | undefined)[]): string {
  return names.filter((name) => typeof name === "string" && name.length > 0).join(" ");
}

export interface LegendItem {
  readonly name: string;
  /** The figure beside the name, where the chart is a whole in parts. */
  readonly words?: string | undefined;
  /** Which of the six colours, from nought; its place in the list where left out. */
  readonly series?: number | undefined;
}

export interface LegendProps {
  readonly items: readonly LegendItem[];
  /** What the key mirrors: a box for what is filled, a stroke for a line. */
  readonly mark?: "box" | "line" | undefined;
  /** What the legend is of, for a reader who cannot see it. */
  readonly label?: string | undefined;
}

/** The key of a chart: each series' colour beside its name. A name is text, never the series' colour. */
export function Legend(props: LegendProps) {
  return (
    <ul className="sc-legend" aria-label={props.label}>
      {props.items.map((item, index) => (
        <li key={item.name} className="sc-legend-item">
          <span
            className={classes(
              "sc-legend-key",
              props.mark === "line" && "sc-legend-key-line",
              seriesClass(item.series ?? index),
            )}
            aria-hidden="true"
          />
          <span className="sc-legend-name">{item.name}</span>
          {item.words !== undefined && <span className="sc-legend-value">{item.words}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface SparklineProps {
  /** The amounts in order, the latest last; what is no amount is passed over. */
  readonly values: readonly (number | undefined)[];
  /** What it shows, for a reader who cannot see it; left out, it is an ornament beside words that say it. */
  readonly label?: string | undefined;
  /** Which of the six colours its last point is drawn in, from nought. */
  readonly series?: number | undefined;
}

/** A sparkline: the run of a figure with no axis, its last amount the dot. */
export function Sparkline(props: SparklineProps) {
  const points = sparkPoints(props.values);
  const last = points.at(-1);
  return (
    <svg
      className={classes("sc-spark", seriesClass(props.series ?? 0))}
      role={props.label === undefined ? undefined : "img"}
      aria-label={props.label}
      aria-hidden={props.label === undefined ? true : undefined}
      focusable="false"
    >
      {points.slice(1).map((point, index) => {
        const from = points[index] ?? point;
        return (
          <line
            key={`${from.x} ${point.x}`}
            className="sc-spark-line"
            x1={chartMeasure(from.x)}
            y1={chartMeasure(from.y)}
            x2={chartMeasure(point.x)}
            y2={chartMeasure(point.y)}
          />
        );
      })}
      {last !== undefined && (
        <circle className="sc-spark-dot" cx={chartMeasure(last.x)} cy={chartMeasure(last.y)} />
      )}
    </svg>
  );
}

/** How a figure changed: the amount with its sign, against what, and whether that is good. */
export interface StatChange {
  /** The change as words, its sign first: "+12%", "-3". */
  readonly words: string;
  /** What it is measured against: "than last week". */
  readonly against?: string | undefined;
  /** Whether the change is good or bad, where the page knows; neither where left out. */
  readonly tone?: "good" | "bad" | undefined;
}

export interface StatProps {
  readonly label: ReactNode;
  /** The figure, as the page writes it: "12,480", "3.2%", "4 h". */
  readonly value: ReactNode;
  readonly change?: StatChange | undefined;
  /** The run the figure came by, the latest last, drawn as a sparkline. */
  readonly trend?: readonly (number | undefined)[] | undefined;
}

/** A figure: a number under its name and, where given, how it changed and the run it came by. One of a `Stats`. */
export function Stat(props: StatProps) {
  const { change, trend } = props;
  return (
    <div className="sc-stat">
      <dt className="sc-stat-label">{props.label}</dt>
      <dd className="sc-stat-value">{props.value}</dd>
      {change !== undefined && (
        <dd
          className={classes(
            "sc-stat-change",
            change.tone !== undefined && `sc-stat-change-${change.tone}`,
          )}
        >
          <span className="sc-stat-delta">{change.words}</span>
          {change.against !== undefined && <> {change.against}</>}
        </dd>
      )}
      {trend !== undefined && (
        <dd className="sc-stat-trend">
          <Sparkline values={trend} />
        </dd>
      )}
    </div>
  );
}

/** Figures side by side, as many across as there is room for. */
export function Stats(props: {
  readonly children: ReactNode;
  /** What the figures are of, for a reader who cannot see the heading over them. */
  readonly label?: string | undefined;
}) {
  return (
    <dl className="sc-stats" aria-label={props.label}>
      {props.children}
    </dl>
  );
}

export interface BarRow {
  /** What tells the row apart, where two rows may have one label. */
  readonly id?: string | undefined;
  readonly label: string;
  /** Where the label leads; text alone where left out. */
  readonly href?: string | undefined;
  /** What stands after the label on its line: a badge, say. */
  readonly note?: ReactNode | undefined;
  /** The amount the bar is as long as. What is no amount, or below nothing, has no bar. */
  readonly value: number | undefined;
  /** The amount as words, where the page writes it its own way: "3.2%", "4 h". */
  readonly words?: string | undefined;
  /** Which of the six colours, from nought; the first where left out, as bars of one kind are one colour. */
  readonly series?: number | undefined;
}

export interface BarListProps {
  /** What the list is of, for a reader who cannot see the heading over it. */
  readonly label: string;
  readonly rows: readonly BarRow[];
  /** What a full bar stands for; the largest amount where left out. */
  readonly whole?: number | undefined;
  /** Whether the order says something: a ranking is numbered for a reader who cannot see it. */
  readonly ranked?: boolean | undefined;
  /** The language the amounts are written in; the browser's where left out. */
  readonly language?: string | undefined;
}

/** A list of bars: a ranking or a comparison, each row a name, its figure and its bar. */
export function BarList(props: BarListProps) {
  const lengths = barLengths(
    props.rows.map((row) => row.value),
    props.whole,
  );
  const List = props.ranked === true ? "ol" : "ul";
  return (
    <List className="sc-bars" aria-label={props.label}>
      {props.rows.map((row, index) => {
        const length = lengths[index] ?? 0;
        return (
          <li key={row.id ?? row.label} className="sc-bars-row">
            <span className="sc-bars-label">
              {row.href === undefined ? row.label : <a href={row.href}>{row.label}</a>}
              {row.note !== undefined && <> {row.note}</>}
            </span>
            <span className="sc-bars-value">
              {row.words ?? (row.value === undefined ? "" : amountWords(row.value, props.language))}
            </span>
            <svg
              className={classes("sc-bars-bar", seriesClass(row.series ?? 0))}
              aria-hidden="true"
              focusable="false"
            >
              {length > 0 && (
                // The bar's own box is as long as the amount and cuts what is drawn in it: the
                // shape starts before the box and ends with it, so that the bar is square where
                // it starts and round where it ends.
                <svg width={chartMeasure(length)} height="100%" aria-hidden="true">
                  <rect className="sc-bars-fill" x="-50%" width="150%" height="100%" />
                </svg>
              )}
            </svg>
          </li>
        );
      })}
    </List>
  );
}

export interface SharePartItem {
  readonly name: string;
  /** The part's amount. What is no amount, or below nothing, has no share. */
  readonly value: number | undefined;
  /** The amount as words, where the page writes it its own way. */
  readonly words?: string | undefined;
}

export interface ShareBarProps {
  /** What the whole is, for a reader who cannot see the heading over it. */
  readonly label: string;
  /** The parts in the order they stand; six at most are told apart, so fold the rest into one. */
  readonly parts: readonly SharePartItem[];
  /** The language the amounts and the shares are written in; the browser's where left out. */
  readonly language?: string | undefined;
}

/** A share: one whole in its parts, as one bar, with each part's name, amount and share under it. */
export function ShareBar(props: ShareBarProps) {
  const places = shareParts(props.parts.map((part) => part.value));
  const drawn = places.flatMap((place, index) => (place.width > 0 ? [{ place, index }] : []));
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group with a name, which a fieldset is only of a form's controls
    <div className="sc-share" role="group" aria-label={props.label}>
      <svg className="sc-share-bar" aria-hidden="true" focusable="false">
        {drawn.map(({ place, index }) => (
          <rect
            key={props.parts[index]?.name}
            className={classes("sc-share-part", seriesClass(index))}
            x={chartMeasure(place.start)}
            width={chartMeasure(place.width)}
            height="100%"
          />
        ))}
        {drawn.slice(1).map(({ place, index }) => (
          <line
            key={props.parts[index]?.name}
            className="sc-share-gap"
            x1={chartMeasure(place.start)}
            x2={chartMeasure(place.start)}
            y1="0"
            y2="100%"
          />
        ))}
      </svg>
      <Legend
        items={props.parts.map((part, index) => {
          const amount =
            part.words ??
            (part.value === undefined ? undefined : amountWords(part.value, props.language));
          const share = shareWords(places[index]?.share ?? 0, props.language);
          return {
            name: part.name,
            series: index,
            words: amount === undefined ? share : `${amount} · ${share}`,
          };
        })}
      />
    </div>
  );
}

export interface FigureRow {
  /** What tells the row apart, where two rows may have one label. */
  readonly id?: string | undefined;
  readonly label: string;
  /** The row's figures, one a column after the first: a number is written as the language writes it, words as they are, nothing where there is none. */
  readonly values: readonly (number | string | undefined)[];
}

export interface FigureTableProps {
  /** What the table is of: its caption. */
  readonly caption: string;
  /** Whether the caption is shown, or only said to a reader who cannot see the heading over the table. */
  readonly captionShown?: boolean | undefined;
  /** The columns' heads, the first the head of the rows' names. */
  readonly columns: readonly string[];
  readonly rows: readonly FigureRow[];
  /** What the rows come to, under them. */
  readonly foot?: FigureRow | undefined;
  /** The language the numbers are written in; the browser's where left out. */
  readonly language?: string | undefined;
}

/** A row's cells after its name: as many as there are columns for. */
function figureCells(
  row: FigureRow,
  columns: readonly string[],
  language: string | undefined,
): ReactNode {
  return columns.slice(1).map((column, index) => {
    const value = row.values[index];
    return <td key={column}>{typeof value === "number" ? amountWords(value, language) : value}</td>;
  });
}

/** A table of figures: rows by columns, the names at the start and the numbers lined up at the end. */
export function FigureTable(props: FigureTableProps) {
  const { columns, foot } = props;
  return (
    <div className="sc-figures-box">
      <table className="sc-figures">
        <caption className={classes(props.captionShown !== true && "sc-visually-hidden")}>
          {props.caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.id ?? row.label}>
              <th scope="row">{row.label}</th>
              {figureCells(row, columns, props.language)}
            </tr>
          ))}
        </tbody>
        {foot !== undefined && (
          <tfoot>
            <tr>
              <th scope="row">{foot.label}</th>
              {figureCells(foot, columns, props.language)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export interface ChartSeries {
  readonly name: string;
  /** The series' amounts, one a point in order; nothing where a point has none. */
  readonly values: readonly (number | undefined)[];
}

export interface ChartProps {
  /** What the chart shows, said to a reader who cannot see it; the page's heading says it to the others. */
  readonly title: string;
  /** The points' names in order, the latest last: days, weeks. */
  readonly points: readonly string[];
  /** One to a few series, measured by one scale; six at most are told apart. */
  readonly series: readonly ChartSeries[];
  /** Columns, for amounts counted in each point; lines, for an amount followed from point to point. */
  readonly kind?: "columns" | "line" | undefined;
  /** How tall: `short` where it stands among other things, in a tile say. */
  readonly size?: "short" | undefined;
  /** An amount as words, where the page writes it its own way; the language's own way where left out. */
  readonly format?: ((value: number) => string) | undefined;
  /** The language the amounts are written in; the browser's where left out. */
  readonly language?: string | undefined;
  /** What stands in the chart's place where no point has an amount. */
  readonly empty?: ReactNode | undefined;
}

/**
 * A chart over time: columns or lines of one to a few series against one scale, with a legend
 * where there are two series or more, the scale's round amounts at the side and the points'
 * names under it, as many as there is room for. Its figures stand under it as a table, for a
 * reader who cannot see it, and a point says its figures to the pointer over it.
 */
export function Chart(props: ChartProps) {
  const kind = props.kind ?? "columns";
  const words = props.format ?? ((value: number) => amountWords(value, props.language));
  const layout = chartLayout(
    props.points.length,
    props.series.map((one) => one.values),
  );
  // A point is its place in the order and a series its place among the series: two may have
  // one name, and neither is ever moved.
  const points = props.points.map((name, at) => ({ name, at, across: layout.across[at] ?? 0 }));
  const series = props.series.map((one, index) => ({
    name: one.name,
    index,
    places: layout.series[index] ?? [],
    amounts: points.map((point) => {
      const value = one.values[point.at];
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    }),
  }));
  if (!series.some((one) => one.places.some((place) => place !== undefined))) {
    return (
      <figure className="sc-chart">
        <figcaption className="sc-visually-hidden">{props.title}</figcaption>
        {props.empty !== undefined && <p className="sc-muted">{props.empty}</p>}
      </figure>
    );
  }
  // The scale's marks are written short where the scale reaches ten thousand, unless the page
  // writes amounts its own way.
  const long = Math.max(Math.abs(layout.scale.min), Math.abs(layout.scale.max)) >= 10_000;
  const marked =
    props.format ?? ((value: number) => (long ? shortWords : amountWords)(value, props.language));
  const names = points.map((point) => point.name);
  // The labels a wide chart has room for, and of those the ones a narrow chart has: the narrow
  // step is so many of the wide one, so that no label stands in the narrow chart alone.
  const step = labelStep(names, CHART_LABEL_ROOM.wide);
  const wide = labelledPoints(points.length, step);
  const narrow = labelledPoints(
    points.length,
    step * Math.ceil(labelStep(names, CHART_LABEL_ROOM.narrow) / step),
  );
  const saidAt = (at: number, name: string): string => {
    const said = series.flatMap((one) => {
      const value = one.amounts[at];
      return value === undefined
        ? []
        : [series.length === 1 ? words(value) : `${one.name} ${words(value)}`];
    });
    return said.length === 0 ? name : `${name}: ${said.join(", ")}`;
  };
  return (
    <figure className={classes("sc-chart", props.size === "short" && "sc-chart-short")}>
      {series.length > 1 && (
        <Legend
          mark={kind === "line" ? "line" : "box"}
          items={series.map((one) => ({ name: one.name, series: one.index }))}
        />
      )}
      <div className="sc-chart-frame" aria-hidden="true">
        <div className="sc-chart-axis">
          {layout.ticks.map((tick) => (
            <span key={tick.value} className="sc-chart-tick">
              {marked(tick.value)}
            </span>
          ))}
        </div>
        <div className="sc-chart-plot">
          <svg className="sc-chart-grid" aria-hidden="true" focusable="false">
            {layout.ticks.map((tick) => (
              <line
                key={tick.value}
                className={classes(
                  "sc-chart-gridline",
                  tick.value === 0 && "sc-chart-gridline-zero",
                )}
                x1="0"
                x2="100%"
                y1={chartMeasure(tick.at)}
                y2={chartMeasure(tick.at)}
              />
            ))}
          </svg>
          {kind === "columns" ? (
            <div className="sc-chart-columns">
              {points.map((point) => (
                <div key={point.at} className="sc-chart-slot">
                  {series.map((one) => {
                    const column = columnOf(one.places[point.at], layout.zero);
                    return (
                      <svg
                        key={one.index}
                        className={classes("sc-chart-column", seriesClass(one.index))}
                        aria-hidden="true"
                        focusable="false"
                      >
                        {column !== undefined && (
                          // The column's own box runs from zero to the amount and cuts what is
                          // drawn in it: the shape ends with the box at the amount and runs on
                          // past zero, so that it is round where it ends and square on zero.
                          <svg
                            y={chartMeasure(column.top)}
                            width="100%"
                            height={chartMeasure(column.height)}
                            aria-hidden="true"
                          >
                            <rect
                              className="sc-chart-bar"
                              y={column.down ? "-50%" : "0"}
                              width="100%"
                              height="150%"
                            />
                          </svg>
                        )}
                      </svg>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <svg className="sc-chart-lines" aria-hidden="true" focusable="false">
              {series.map((one) => {
                const last = one.places.findLastIndex((place) => place !== undefined);
                return (
                  <g key={one.index} className={seriesClass(one.index)}>
                    {points.slice(1).map((point) => {
                      const before = points[point.at - 1];
                      const from = one.places[point.at - 1];
                      const to = one.places[point.at];
                      return before === undefined ||
                        from === undefined ||
                        to === undefined ? null : (
                        <line
                          key={point.at}
                          className="sc-chart-line"
                          x1={chartMeasure(before.across)}
                          y1={chartMeasure(from)}
                          x2={chartMeasure(point.across)}
                          y2={chartMeasure(to)}
                        />
                      );
                    })}
                    {points.map((point) => {
                      const place = one.places[point.at];
                      // A dot where the line ends, and where an amount has none beside it to
                      // be joined to: a line of one point is a dot.
                      const alone =
                        one.places[point.at - 1] === undefined &&
                        one.places[point.at + 1] === undefined;
                      return place === undefined || !(point.at === last || alone) ? null : (
                        <circle
                          key={point.at}
                          className="sc-chart-dot"
                          cx={chartMeasure(point.across)}
                          cy={chartMeasure(place)}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          )}
          {/* Over the marks, a point's share of the plot each: what answers the pointer. */}
          <svg aria-hidden="true" focusable="false">
            {points.map((point) => (
              <rect
                key={point.at}
                className="sc-chart-hit"
                x={chartMeasure((point.at * 100) / points.length)}
                y="0"
                width={chartMeasure(100 / points.length)}
                height="100%"
              >
                <title>{saidAt(point.at, point.name)}</title>
              </rect>
            ))}
          </svg>
        </div>
        <div className="sc-chart-labels">
          {points.map((point) => (
            <span
              key={point.at}
              className={classes(
                "sc-chart-label",
                !narrow.has(point.at) && "sc-chart-label-wide",
                // In a narrow chart a name at an end stands inside the chart, where there are
                // points enough for it to be wider than its own.
                points.length > 2 && point.at === 0 && "sc-chart-label-start",
                points.length > 2 && point.at === points.length - 1 && "sc-chart-label-end",
              )}
            >
              {wide.has(point.at) ? point.name : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="sc-visually-hidden">
        <table>
          <caption>{props.title}</caption>
          <thead>
            <tr>
              <td />
              {series.map((one) => (
                <th key={one.index} scope="col">
                  {one.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.at}>
                <th scope="row">{point.name}</th>
                {series.map((one) => {
                  const value = one.amounts[point.at];
                  return <td key={one.index}>{value === undefined ? "" : words(value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
