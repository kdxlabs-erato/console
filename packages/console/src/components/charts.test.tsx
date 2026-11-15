import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarList, Chart, FigureTable, Legend, ShareBar, Sparkline, Stat, Stats } from "./charts.js";

// The charts (ADR-0123) as markup: what is drawn, by which measures, and what a reader who
// cannot see the drawing is told. A measure is an attribute of an SVG and never a style.

const WEEKS = ["Jan 19", "Jan 26", "Feb 2", "Feb 9"];

/** How many times a piece of markup stands in a page. */
const count = (html: string, piece: string): number => html.split(piece).length - 1;

describe("a figure", () => {
  it("is a number under its name, in a list a reader is told as names and values", () => {
    const html = renderToStaticMarkup(
      <Stats label="The close in figures">
        <Stat label="Invoices sent" value="473" />
      </Stats>,
    );
    expect(html).toBe(
      '<dl class="sc-stats" aria-label="The close in figures"><div class="sc-stat"><dt class="sc-stat-label">Invoices sent</dt><dd class="sc-stat-value">473</dd></div></dl>',
    );
  });

  it("says how it changed: the amount with its sign, against what, and in the tone the page gives", () => {
    const good = renderToStaticMarkup(
      <Stat
        label="Paid on time"
        value="86%"
        change={{ words: "+4 points", against: "than last month", tone: "good" }}
      />,
    );
    expect(good).toContain(
      '<dd class="sc-stat-change sc-stat-change-good"><span class="sc-stat-delta">+4 points</span> than last month</dd>',
    );
    const bad = renderToStaticMarkup(
      <Stat label="Disputed" value="27" change={{ words: "+9", tone: "bad" }} />,
    );
    expect(bad).toContain(
      '<dd class="sc-stat-change sc-stat-change-bad"><span class="sc-stat-delta">+9</span></dd>',
    );
    // Neither good nor bad where the page does not say: the sign alone says the direction.
    const plain = renderToStaticMarkup(<Stat label="Open" value="6" change={{ words: "0" }} />);
    expect(plain).toContain('<dd class="sc-stat-change"><span class="sc-stat-delta">0</span></dd>');
  });

  it("draws the run it came by as a sparkline, an ornament beside the figure's own words", () => {
    const html = renderToStaticMarkup(<Stat label="Sent" value="83" trend={[42, 51, 83]} />);
    expect(html).toContain('<dd class="sc-stat-trend"><svg class="sc-spark sc-series-1"');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("a sparkline", () => {
  it("is a line from amount to amount, the last amount a dot, every place a share of its box", () => {
    const html = renderToStaticMarkup(
      <Sparkline values={[1, 3, 2]} label="Up, then down a little" />,
    );
    expect(html).toBe(
      '<svg class="sc-spark sc-series-1" role="img" aria-label="Up, then down a little" focusable="false">' +
        '<line class="sc-spark-line" x1="0%" y1="88%" x2="50%" y2="12%"></line>' +
        '<line class="sc-spark-line" x1="50%" y1="12%" x2="100%" y2="50%"></line>' +
        '<circle class="sc-spark-dot" cx="100%" cy="50%"></circle></svg>',
    );
  });

  it("is a dot for one amount and nothing for none, in the colour of the series named", () => {
    const one = renderToStaticMarkup(<Sparkline values={[4]} series={2} />);
    expect(one).toContain('class="sc-spark sc-series-3"');
    expect(count(one, "<line")).toBe(0);
    expect(one).toContain('<circle class="sc-spark-dot" cx="50%" cy="50%">');
    const none = renderToStaticMarkup(<Sparkline values={[]} />);
    expect(none).toBe(
      '<svg class="sc-spark sc-series-1" aria-hidden="true" focusable="false"></svg>',
    );
  });
});

describe("a list of bars", () => {
  const rows = [
    { label: "Northwind Freight", value: 48_200 },
    { label: "Halden Office Supply", value: 24_100 },
    { label: "Quay Street Print", value: 0 },
  ];

  it("gives each row its name, its figure as text and a bar as long as its amount is of the largest", () => {
    const html = renderToStaticMarkup(
      <BarList label="Paid to each supplier" language="en" rows={rows} />,
    );
    expect(html).toContain('<ul class="sc-bars" aria-label="Paid to each supplier">');
    expect(html).toContain(
      '<li class="sc-bars-row"><span class="sc-bars-label">Northwind Freight</span><span class="sc-bars-value">48,200</span>' +
        '<svg class="sc-bars-bar sc-series-1" aria-hidden="true" focusable="false">' +
        '<svg width="100%" height="100%" aria-hidden="true"><rect class="sc-bars-fill" x="-50%" width="150%" height="100%"></rect></svg></svg></li>',
    );
    expect(html).toContain('<svg width="50%" height="100%"');
    // Nothing is no bar: the figure says it.
    expect(html).toContain(
      '<span class="sc-bars-value">0</span><svg class="sc-bars-bar sc-series-1" aria-hidden="true" focusable="false"></svg>',
    );
  });

  it("is numbered for a reader where the order says something", () => {
    const html = renderToStaticMarkup(<BarList label="Best" ranked language="en" rows={rows} />);
    expect(html).toContain('<ol class="sc-bars" aria-label="Best">');
  });

  it("leads where a name leads, says what stands after it, and writes a figure the page's way", () => {
    const html = renderToStaticMarkup(
      <BarList
        label="How far"
        whole={100}
        rows={[
          {
            label: "Close",
            href: "/tasks/12",
            note: <em>late</em>,
            value: 72,
            words: "72%",
            series: 5,
          },
        ]}
      />,
    );
    expect(html).toContain(
      '<span class="sc-bars-label"><a href="/tasks/12">Close</a> <em>late</em></span><span class="sc-bars-value">72%</span>',
    );
    expect(html).toContain('class="sc-bars-bar sc-series-6"');
    expect(html).toContain('<svg width="72%" height="100%"');
  });

  it("keeps a name of any length whole, a small amount in sight, and a row with no amount", () => {
    const long = "Consolidated Paper and Packaging of the Lower Valley, Incorporated".repeat(4);
    const html = renderToStaticMarkup(
      <BarList
        label="Of very different size"
        language="en"
        rows={[
          { label: long, value: 1_204_500 },
          { label: "Small", value: 3 },
          { label: "None", value: undefined },
          { id: "again", label: "Small", value: Number.NaN },
        ]}
      />,
    );
    expect(html).toContain(`<span class="sc-bars-label">${long}</span>`);
    expect(html).toContain('<svg width="1%" height="100%"');
    expect(count(html, "sc-bars-fill")).toBe(2);
    expect(count(html, '<li class="sc-bars-row">')).toBe(4);
  });

  it("is an empty list for no rows", () => {
    expect(renderToStaticMarkup(<BarList label="None" rows={[]} />)).toBe(
      '<ul class="sc-bars" aria-label="None"></ul>',
    );
  });
});

describe("a share", () => {
  it("is one bar with its parts one after the other, a gap between them, and each part's figures as text", () => {
    const html = renderToStaticMarkup(
      <ShareBar
        label="How the invoices stand"
        language="en"
        parts={[
          { name: "Paid", value: 300 },
          { name: "Waiting", value: 75 },
          { name: "Disputed", value: 25 },
        ]}
      />,
    );
    expect(html).toContain(
      '<div class="sc-share" role="group" aria-label="How the invoices stand">',
    );
    expect(html).toContain(
      '<rect class="sc-share-part sc-series-1" x="0%" width="75%" height="100%">',
    );
    expect(html).toContain(
      '<rect class="sc-share-part sc-series-2" x="75%" width="18.75%" height="100%">',
    );
    expect(html).toContain(
      '<rect class="sc-share-part sc-series-3" x="93.75%" width="6.25%" height="100%">',
    );
    // A gap where one part ends and the next begins, in the colour of the surface.
    expect(html).toContain('<line class="sc-share-gap" x1="75%" x2="75%" y1="0" y2="100%">');
    expect(count(html, "sc-share-gap")).toBe(2);
    expect(html).toContain(
      '<span class="sc-legend-name">Paid</span><span class="sc-legend-value">300 · 75%</span>',
    );
    expect(html).toContain('<span class="sc-legend-value">25 · 6%</span>');
  });

  it("draws nothing for a whole of nothing, and still names its parts", () => {
    const html = renderToStaticMarkup(
      <ShareBar label="Nothing yet" language="en" parts={[{ name: "Paid", value: 0 }]} />,
    );
    expect(count(html, "<rect")).toBe(0);
    expect(html).toContain('<span class="sc-legend-value">0 · 0%</span>');
  });

  it("never says a part that is something is none, nor one that is not all is all", () => {
    const html = renderToStaticMarkup(
      <ShareBar
        label="A part far smaller"
        language="en"
        parts={[
          { name: "Paid", value: 99_940, words: "99,940 paid" },
          { name: "Disputed", value: 60 },
        ]}
      />,
    );
    expect(html).toContain('<span class="sc-legend-value">99,940 paid · &gt;99%</span>');
    expect(html).toContain('<span class="sc-legend-value">60 · &lt;1%</span>');
    // The small part is drawn, at the least a mark is drawn at.
    expect(html).toContain(
      '<rect class="sc-share-part sc-series-2" x="99%" width="1%" height="100%">',
    );
  });

  it("wears the neutral past the sixth part", () => {
    const html = renderToStaticMarkup(
      <ShareBar
        label="Seven"
        language="en"
        parts={["a", "b", "c", "d", "e", "f", "g"].map((name) => ({ name, value: 1 }))}
      />,
    );
    expect(html).toContain('class="sc-share-part sc-series-6"');
    expect(html).toContain('class="sc-share-part sc-series-rest"');
    expect(html).toContain('class="sc-legend-key sc-series-rest"');
  });
});

describe("a legend", () => {
  it("is each series' colour as a key beside its name, the name in the colour of text", () => {
    const html = renderToStaticMarkup(
      <Legend label="The series" items={[{ name: "Sent" }, { name: "Paid", series: 4 }]} />,
    );
    expect(html).toBe(
      '<ul class="sc-legend" aria-label="The series">' +
        '<li class="sc-legend-item"><span class="sc-legend-key sc-series-1" aria-hidden="true"></span><span class="sc-legend-name">Sent</span></li>' +
        '<li class="sc-legend-item"><span class="sc-legend-key sc-series-5" aria-hidden="true"></span><span class="sc-legend-name">Paid</span></li></ul>',
    );
  });

  it("keys a line by a stroke", () => {
    const html = renderToStaticMarkup(<Legend mark="line" items={[{ name: "Sent" }]} />);
    expect(html).toContain('class="sc-legend-key sc-legend-key-line sc-series-1"');
  });
});

describe("a table of figures", () => {
  it("is rows by columns, numbers as the language writes them, with what they come to at the foot", () => {
    const html = renderToStaticMarkup(
      <FigureTable
        caption="Invoices by week"
        language="en"
        columns={["Week", "Sent", "Paid"]}
        rows={[
          { label: "Jan 19", values: [1042, 30.456] },
          { label: "Jan 26", values: ["none", undefined] },
        ]}
        foot={{ label: "In all", values: [1042, 30.456] }}
      />,
    );
    expect(html).toContain('<div class="sc-figures-box"><table class="sc-figures">');
    expect(html).toContain('<caption class="sc-visually-hidden">Invoices by week</caption>');
    expect(html).toContain(
      '<thead><tr><th scope="col">Week</th><th scope="col">Sent</th><th scope="col">Paid</th></tr></thead>',
    );
    expect(html).toContain('<tr><th scope="row">Jan 19</th><td>1,042</td><td>30.46</td></tr>');
    // Words stand as they are, and where there is no figure the cell is empty.
    expect(html).toContain('<tr><th scope="row">Jan 26</th><td>none</td><td></td></tr>');
    expect(html).toContain(
      '<tfoot><tr><th scope="row">In all</th><td>1,042</td><td>30.46</td></tr></tfoot>',
    );
  });

  it("shows its caption where the page asks, and has as many cells as columns whatever a row holds", () => {
    const html = renderToStaticMarkup(
      <FigureTable
        caption="Shown"
        captionShown
        columns={["Name", "A"]}
        rows={[{ label: "One", values: [1, 2, 3] }]}
      />,
    );
    expect(html).toContain('<caption class="">Shown</caption>');
    expect(html).toContain('<tr><th scope="row">One</th><td>1</td></tr>');
  });
});

describe("a chart over time", () => {
  it("draws a column a point, from zero to its amount, with the scale beside it and the points' names under it", () => {
    const html = renderToStaticMarkup(
      <Chart
        title="Invoices sent by week"
        language="en"
        points={WEEKS}
        series={[{ name: "Sent", values: [25, 50, 0, 100] }]}
      />,
    );
    expect(html).toContain('<figure class="sc-chart">');
    // One series is named by the heading: no legend.
    expect(html).not.toContain("sc-legend");
    // The scale's round amounts, the largest first, and a line across at each.
    expect(html).toContain(
      '<div class="sc-chart-axis"><span class="sc-chart-tick">100</span><span class="sc-chart-tick">75</span><span class="sc-chart-tick">50</span><span class="sc-chart-tick">25</span><span class="sc-chart-tick">0</span></div>',
    );
    expect(html).toContain('<line class="sc-chart-gridline" x1="0" x2="100%" y1="25%" y2="25%">');
    expect(html).toContain(
      '<line class="sc-chart-gridline sc-chart-gridline-zero" x1="0" x2="100%" y1="100%" y2="100%">',
    );
    // A column's box runs from its amount to zero; the shape in it is cut square on zero.
    expect(html).toContain(
      '<svg class="sc-chart-column sc-series-1" aria-hidden="true" focusable="false"><svg y="75%" width="100%" height="25%" aria-hidden="true"><rect class="sc-chart-bar" y="0" width="100%" height="150%"></rect></svg></svg>',
    );
    expect(html).toContain('<svg y="0%" width="100%" height="100%" aria-hidden="true">');
    // Nothing is no column, and still a place among the others.
    expect(count(html, "sc-chart-slot")).toBe(4);
    expect(count(html, "sc-chart-bar")).toBe(3);
    expect(html).toContain(
      '<div class="sc-chart-slot"><svg class="sc-chart-column sc-series-1" aria-hidden="true" focusable="false"></svg></div>',
    );
    expect(html).toContain(
      '<div class="sc-chart-labels"><span class="sc-chart-label sc-chart-label-start">Jan 19</span><span class="sc-chart-label">Jan 26</span><span class="sc-chart-label">Feb 2</span><span class="sc-chart-label sc-chart-label-end">Feb 9</span></div>',
    );
  });

  it("says its figures to a reader who cannot see it, as a table, and hides the drawing from them", () => {
    const html = renderToStaticMarkup(
      <Chart
        title="Invoices sent and paid by week"
        language="en"
        points={WEEKS.slice(0, 2)}
        series={[
          { name: "Sent", values: [1042, 51] },
          { name: "Paid", values: [30, undefined] },
        ]}
      />,
    );
    expect(html).toContain('<div class="sc-chart-frame" aria-hidden="true">');
    expect(html).toContain(
      '<div class="sc-visually-hidden"><table><caption>Invoices sent and paid by week</caption>' +
        '<thead><tr><td></td><th scope="col">Sent</th><th scope="col">Paid</th></tr></thead>' +
        '<tbody><tr><th scope="row">Jan 19</th><td>1,042</td><td>30</td></tr>' +
        '<tr><th scope="row">Jan 26</th><td>51</td><td></td></tr></tbody></table></div>',
    );
    // Two series: a legend, each a box as its columns are.
    expect(html).toContain(
      '<ul class="sc-legend"><li class="sc-legend-item"><span class="sc-legend-key sc-series-1" aria-hidden="true"></span><span class="sc-legend-name">Sent</span></li>',
    );
    // The columns of a point stand side by side, each in its series' colour.
    expect(html).toContain('class="sc-chart-column sc-series-2"');
    // What a point says to the pointer over it: every series that has an amount there.
    expect(html).toContain("<title>Jan 19: Sent 1,042, Paid 30</title>");
    expect(html).toContain("<title>Jan 26: Sent 51</title>");
    expect(html).toContain('<rect class="sc-chart-hit" x="50%" y="0" width="50%" height="100%">');
  });

  it("draws a line from point to point, a dot where it ends, and leaves a gap where a point has no amount", () => {
    const html = renderToStaticMarkup(
      <Chart
        title="Hours by week"
        kind="line"
        language="en"
        points={["a", "b", "c", "d", "e"]}
        series={[
          { name: "Close", values: [0, 50, undefined, 100, 100] },
          { name: "Audit", values: [undefined, undefined, 25, undefined, undefined] },
        ]}
      />,
    );
    expect(html).toContain('<g class="sc-series-1">');
    expect(html).toContain(
      '<line class="sc-chart-line" x1="10%" y1="100%" x2="30%" y2="50%"></line>',
    );
    expect(html).toContain('<line class="sc-chart-line" x1="70%" y1="0%" x2="90%" y2="0%"></line>');
    // Two stretches: nothing is drawn across the point that has no amount.
    expect(count(html, 'class="sc-chart-line"')).toBe(2);
    // The dot where the first line ends, and the one amount of the second, which has none beside it.
    expect(html).toContain('<circle class="sc-chart-dot" cx="90%" cy="0%"></circle>');
    expect(html).toContain(
      '<g class="sc-series-2"><circle class="sc-chart-dot" cx="50%" cy="75%"></circle></g>',
    );
    expect(count(html, "sc-chart-dot")).toBe(2);
    expect(html).toContain('class="sc-legend-key sc-legend-key-line sc-series-2"');
    expect(html).not.toContain("sc-chart-column");
  });

  it("is a column for one point, and a dot for a line of one point", () => {
    const column = renderToStaticMarkup(
      <Chart
        title="One"
        language="en"
        points={["Mar 9"]}
        series={[{ name: "Sent", values: [8] }]}
      />,
    );
    expect(count(column, "sc-chart-bar")).toBe(1);
    expect(column).toContain('<span class="sc-chart-label">Mar 9</span>');
    const line = renderToStaticMarkup(
      <Chart
        title="One"
        kind="line"
        language="en"
        points={["Mar 9"]}
        series={[{ name: "Sent", values: [8] }]}
      />,
    );
    expect(count(line, 'class="sc-chart-line"')).toBe(0);
    expect(line).toContain('<circle class="sc-chart-dot" cx="50%" cy="0%"></circle>');
  });

  it("says the words the page gives where no point has an amount, and draws nothing", () => {
    const html = renderToStaticMarkup(
      <Chart
        title="Invoices sent by week"
        points={WEEKS}
        series={[{ name: "Sent", values: [undefined, Number.NaN] }]}
        empty="No figures are recorded yet."
      />,
    );
    expect(html).toBe(
      '<figure class="sc-chart"><figcaption class="sc-visually-hidden">Invoices sent by week</figcaption><p class="sc-muted">No figures are recorded yet.</p></figure>',
    );
    expect(renderToStaticMarkup(<Chart title="None" points={[]} series={[]} />)).toBe(
      '<figure class="sc-chart"><figcaption class="sc-visually-hidden">None</figcaption></figure>',
    );
  });

  it("holds amounts of very different size and amounts below zero by one scale", () => {
    const sizes = renderToStaticMarkup(
      <Chart
        title="Sizes"
        language="en"
        points={["a", "b"]}
        series={[{ name: "Posted", values: [3, 1_204_500] }]}
      />,
    );
    // A scale that reaches ten thousand is marked short; the figures stay in full.
    expect(sizes).toContain('<span class="sc-chart-tick">1.5M</span>');
    expect(sizes).toContain('<span class="sc-chart-tick">500K</span>');
    expect(sizes).toContain("<title>b: 1,204,500</title>");
    expect(sizes).toContain("<td>1,204,500</td>");
    // The small amount is drawn at the least a mark is drawn at, and never as nothing.
    expect(sizes).toContain('<svg y="99%" width="100%" height="1%" aria-hidden="true">');
    const below = renderToStaticMarkup(
      <Chart
        title="Net"
        language="en"
        points={["a", "b"]}
        series={[{ name: "Net", values: [10, -5] }]}
      />,
    );
    expect(below).toContain('<span class="sc-chart-tick">-5</span>');
    // A column below zero hangs from zero, and its shape is cut square there.
    expect(below).toContain(
      '<svg y="66.667%" width="100%" height="33.333%" aria-hidden="true"><rect class="sc-chart-bar" y="-50%" width="100%" height="150%"></rect></svg>',
    );
  });

  it("writes as many of the points' names as fit, fewer in a narrow box, the last always", () => {
    const days = Array.from({ length: 30 }, (_, index) => `Day ${index + 1}`);
    const html = renderToStaticMarkup(
      <Chart
        title="By day"
        language="en"
        points={days}
        series={[{ name: "Entries", values: days.map(() => 1) }]}
      />,
    );
    // Six letters and two between: eleven in a wide box, so every third; four in a narrow one,
    // so every ninth, which is every third of those.
    expect(html).toContain('<span class="sc-chart-label sc-chart-label-end">Day 30</span>');
    expect(html).toContain('<span class="sc-chart-label sc-chart-label-wide">Day 27</span>');
    expect(html).toContain('<span class="sc-chart-label">Day 21</span>');
    expect(html).toContain('<span class="sc-chart-label sc-chart-label-wide"></span>');
    expect(html.match(/<span class="sc-chart-label[^"]*">Day /g)).toHaveLength(10);
  });

  it("is shorter where the page asks, writes amounts the page's way, and takes two points of one name", () => {
    const html = renderToStaticMarkup(
      <Chart
        title="Short"
        size="short"
        points={["Mon", "Mon"]}
        series={[
          { name: "Hours", values: [1.5, 3] },
          { name: "Hours", values: [2, 1] },
        ]}
        format={(value) => `${value} h`}
      />,
    );
    expect(html).toContain('<figure class="sc-chart sc-chart-short">');
    expect(html).toContain('<span class="sc-chart-tick">3 h</span>');
    expect(html).toContain("<title>Mon: Hours 1.5 h, Hours 2 h</title>");
    expect(count(html, "sc-chart-slot")).toBe(2);
  });
});

describe("what the charts are given", () => {
  it("is shown as text, whatever it says", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const html = renderToStaticMarkup(
      <>
        <Chart
          title={hostile}
          language="en"
          points={[hostile]}
          series={[{ name: hostile, values: [1] }]}
        />
        <BarList label={hostile} rows={[{ label: hostile, value: 1, words: hostile }]} />
        <ShareBar label={hostile} parts={[{ name: hostile, value: 1, words: hostile }]} />
        <FigureTable
          caption={hostile}
          columns={[hostile, "A"]}
          rows={[{ label: hostile, values: [hostile] }]}
        />
        <Stats>
          <Stat label={hostile} value={hostile} change={{ words: hostile, against: hostile }} />
        </Stats>
        <Legend items={[{ name: hostile, words: hostile }]} />
        <Sparkline values={[1, 2]} label={hostile} />
      </>,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=");
  });

  it("is placed by attributes alone: no chart sets a style on an element", async () => {
    const html = renderToStaticMarkup(
      <>
        <Chart title="t" points={WEEKS} series={[{ name: "a", values: [1, 2, 3, 4] }]} />
        <Chart
          title="t"
          kind="line"
          points={WEEKS}
          series={[{ name: "a", values: [1, 2, 3, 4] }]}
        />
        <BarList label="b" rows={[{ label: "a", value: 1 }]} />
        <ShareBar label="s" parts={[{ name: "a", value: 1 }]} />
        <Sparkline values={[1, 2]} />
      </>,
    );
    expect(html).not.toContain("style=");
    // Nor does the source: a colour and a size are the stylesheet's, and so that the charts go
    // into a plugin's bundle without the console, the source leans on React and the measures.
    const source = await readFile(fileURLToPath(new URL("./charts.tsx", import.meta.url)), "utf8");
    expect(source).not.toMatch(/style=\{/);
    expect([...source.matchAll(/ from "([^"]+)";$/gm)].map((found) => found[1])).toEqual([
      "react",
      "../charts.js",
    ]);
  });
});
