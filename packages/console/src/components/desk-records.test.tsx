import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bestItems, itemResults, resultsOf } from "../desk-records.js";
import { ENGLISH, KOREAN, LanguageContext } from "../i18n/index.js";
import type { RecordsCollection, RecordsItem, RecordsMetricRow, RecordsUse } from "../records.js";
import {
  DeskCollectionResults,
  DeskCollections,
  DeskCollectionView,
  type DeskFile,
  DeskItemView,
  DeskNoRecords,
  DeskRecordCrumbs,
  DeskRecordProblems,
  metricWords,
  ratioWords,
} from "./desk-records.js";

const ads: RecordsCollection = {
  title: "Ad creatives",
  description: "What was made for the ads, and how each did.",
  statuses: [
    { key: "used", label: "Used" },
    { key: "not-used", label: "Not used" },
  ],
  fields: [
    { key: "format", label: "Format", kind: "text" },
    { key: "length", label: "Seconds", kind: "number" },
    { key: "source", label: "Source", kind: "link" },
  ],
  metrics: [
    { key: "impressions", label: "Impressions", unit: "count" },
    { key: "clicks", label: "Clicks", unit: "count" },
    { key: "watched", label: "Watched through", unit: "percent" },
    { key: "view-time", label: "View time", unit: "seconds" },
  ],
  ratios: [
    { key: "ctr", label: "Clicks per impression", of: "clicks", per: "impressions", as: "percent" },
  ],
};

const documents: RecordsCollection = { title: "Documents" };

const hook1: RecordsItem = {
  id: "hook-1",
  title: "The <b>first</b> hook",
  madeOn: "2026-11-02",
  status: "used",
  preview: "files/hook-1.png",
  links: [
    { label: "In the ad account", url: "https://ads.example/creative/1" },
    { label: "A link that is none", url: "javascript:alert(1)" },
  ],
  files: [{ label: "The cut", path: "files/hook-1.webm" }],
  task: { project: "website", number: 12 },
  fields: { format: "Vertical, 9:16", length: 15, source: "https://drive.example/hook-1" },
  note: "Opens on the product.\nNo voice-over: <script>alert(1)</script>",
};
const hook2: RecordsItem = {
  id: "hook-2",
  title: "The second hook",
  madeOn: "2026-11-09",
  status: "not-used",
  fields: { format: "Square", source: "http://not-https.example/x" },
};

const rows: readonly RecordsMetricRow[] = [
  { item: "hook-1", on: "2026-11-10", values: { impressions: 1000, clicks: 30, watched: 40 } },
  {
    item: "hook-1",
    on: "2026-11-11",
    values: { impressions: 3000, clicks: 50, "view-time": 7.25 },
  },
];

const uses: readonly RecordsUse[] = [
  { item: "hook-1", on: "2026-11-10", where: "The winter campaign <i>A</i>", note: "Arm B" },
];

const itemHref = (id: string) => `/pages/desk?collection=ad-creatives&item=${id}`;
const taskHref = (project: string, number: number) => `/projects/${project}/tasks/${number}`;

describe("where no records are, and where a file is wrong", () => {
  it("says what a record is and where the first comes from", () => {
    const html = renderToStaticMarkup(<DeskNoRecords />);
    expect(html).toContain("No records here yet");
    expect(html).toContain("records/ in your desk");
    // Nothing of the board is asked of a record, and nothing forbidden.
    expect(html).not.toMatch(/board|task/i);
  });

  it("names each file that is wrong with why, in a line, and how to learn the rest", () => {
    const html = renderToStaticMarkup(
      <DeskRecordProblems
        problems={[
          { file: "index.json", kind: "not_json" },
          { file: "ads/items.json", kind: "not_as_format", at: "[1].madeOn", left: 2 },
          { file: "ads/collection.json", kind: "not_as_format", at: "" },
          { file: "ads/uses.json", kind: "unreadable" },
          { file: "ads/metrics.json", kind: "too_large" },
        ]}
      />,
    );
    expect(html).toContain("sc-callout-warning");
    expect(html).toContain("<p>records/index.json is not JSON.</p>");
    expect(html).toContain(
      "<p>records/ads/items.json is not as the format says, at [1].madeOn. 2 entries are left out.</p>",
    );
    expect(html).toContain("<p>records/ads/collection.json is not as the format says.</p>");
    expect(html).toContain("<p>records/ads/uses.json could not be read.</p>");
    expect(html).toContain("<p>records/ads/metrics.json is larger than the pages read.</p>");
    expect(html).toContain("console desk check");
    expect(renderToStaticMarkup(<DeskRecordProblems problems={[]} />)).toBe("");
  });
});

describe("the collections of a desk", () => {
  it("are a row each: the items by status, how many there are, and when the last was made", () => {
    const html = renderToStaticMarkup(
      <DeskCollections
        collections={[
          {
            key: "ad-creatives",
            title: "Ad <creatives>",
            description: "What was made for the ads.",
            items: 3,
            statuses: [
              { key: "used", label: "Used", count: 2 },
              { key: "not-used", label: "Not used", count: 0 },
            ],
            lastMadeOn: "2026-11-09",
          },
          {
            key: "documents",
            title: "Documents",
            description: undefined,
            items: 1,
            statuses: [],
            lastMadeOn: undefined,
          },
        ]}
        collectionHref={(key) => `/pages/desk?collection=${key}`}
      />,
    );
    expect(html).toContain(
      '<a class="sc-task-row-title" href="/pages/desk?collection=ad-creatives">Ad &lt;creatives&gt;</a>',
    );
    expect(html).toContain("What was made for the ads.");
    expect(html).toContain(">Used 2<");
    // A status no item has is not counted aloud.
    expect(html).not.toContain("Not used");
    expect(html).toContain("3 items");
    expect(html).toContain("1 item<");
    expect(html).toContain('dateTime="2026-11-09"');
    expect(
      renderToStaticMarkup(<DeskCollections collections={[]} collectionHref={() => "/"} />),
    ).toContain("The records name no collection yet.");
  });

  it("say the way down to where the view is", () => {
    const html = renderToStaticMarkup(
      <DeskRecordCrumbs
        steps={[
          { label: "Records", href: "/pages/desk" },
          { label: "Ad creatives", href: "/pages/desk?collection=ad-creatives" },
          { label: "The <b>first</b> hook" },
        ]}
      />,
    );
    expect(html).toContain('<a href="/pages/desk">Records</a>');
    expect(html).toContain("The &lt;b&gt;first&lt;/b&gt; hook");
    expect(html.match(/sc-crumb-separator/g)).toHaveLength(2);
  });
});

describe("one collection", () => {
  it("shows its items as cards where any has a preview, each with its status, its day and its fields", () => {
    const html = renderToStaticMarkup(
      <DeskCollectionView
        collectionKey="ad-creatives"
        collection={ads}
        items={[hook2, hook1]}
        onStatus={() => undefined}
        itemHref={itemHref}
      />,
    );
    expect(html).toContain('<ul class="sc-desk-cards"');
    expect(html.match(/class="sc-panel sc-desk-card"/g)).toHaveLength(2);
    // A preview is a file under the collection's files, read from the page's own origin.
    expect(html).toContain(
      '<img class="sc-desk-card-picture" src="/records/ad-creatives/files/hook-1.png" alt=""',
    );
    expect(html.match(/<img /g)).toHaveLength(1);
    // What was written is text.
    expect(html).toContain("The &lt;b&gt;first&lt;/b&gt; hook");
    expect(html).toContain(">Used<");
    expect(html).toContain(">Not used<");
    expect(html).toContain("<dt>Seconds</dt><dd>15</dd>");
    // A link is one where it is https, and opens apart; where it is not, it is words.
    expect(html).toContain(
      '<a href="https://drive.example/hook-1" target="_blank" rel="noopener noreferrer">https://drive.example/hook-1</a>',
    );
    expect(html).toContain("<dd>http://not-https.example/x</dd>");
    expect(html).not.toContain('href="http://not-https.example/x"');
    // The way to narrow by status, with how many are shown.
    expect(html).toContain('<option value="" selected="">Every status</option>');
    expect(html).toContain('<option value="used">Used (1)</option>');
    expect(html).toContain("2 of 2");
  });

  it("narrows its items to a status, and says so where none has it", () => {
    const used = renderToStaticMarkup(
      <DeskCollectionView
        collectionKey="ad-creatives"
        collection={ads}
        items={[hook2, hook1]}
        status="used"
        onStatus={() => undefined}
        itemHref={itemHref}
      />,
    );
    expect(used).toContain("1 of 2");
    expect(used).not.toContain("The second hook");
    const none = renderToStaticMarkup(
      <DeskCollectionView
        collectionKey="ad-creatives"
        collection={{ ...ads, statuses: [...(ads.statuses ?? []), { key: "kept", label: "Kept" }] }}
        items={[hook2]}
        status="kept"
        onStatus={() => undefined}
        itemHref={itemHref}
      />,
    );
    expect(none).toContain("No item has this status.");
  });

  it("shows its items as rows where none has a preview, and takes no preview that is no file of it", () => {
    const html = renderToStaticMarkup(
      <DeskCollectionView
        collectionKey="documents"
        collection={{ title: "Documents" }}
        items={[
          { id: "brief", title: "The brief", madeOn: "2026-10-01", preview: "../../secret.png" },
          {
            id: "plan",
            title: "The plan",
            madeOn: "2026-10-08",
            preview: "https://x.example/a.png",
          },
        ]}
        onStatus={() => undefined}
        itemHref={(id) => `/pages/desk?collection=documents&item=${id}`}
      />,
    );
    expect(html).toContain('<ul class="sc-task-rows"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("sc-desk-cards");
    // A collection that names no status has nothing to narrow by.
    expect(html).not.toContain("<select");
    expect(
      renderToStaticMarkup(
        <DeskCollectionView
          collectionKey="documents"
          collection={{ title: "Documents" }}
          items={[]}
          onStatus={() => undefined}
          itemHref={itemHref}
        />,
      ),
    ).toContain("Nothing is recorded here yet.");
  });
});

describe("one item", () => {
  const view = (files: readonly DeskFile[], item: RecordsItem = hook1) =>
    renderToStaticMarkup(
      <DeskItemView
        collectionKey="ad-creatives"
        collection={ads}
        item={item}
        uses={uses}
        results={itemResults(ads, rows, item.id)}
        files={files}
        taskHref={taskHref}
      />,
    );

  it("shows what it says of itself as text, its links only as https, and the task it names as a link", () => {
    const html = view([]);
    expect(html).toContain('<h2 class="sc-task-title">The &lt;b&gt;first&lt;/b&gt; hook</h2>');
    expect(html).toContain(
      '<img class="sc-desk-item-picture" src="/records/ad-creatives/files/hook-1.png"',
    );
    // The note keeps its lines and is never markup.
    expect(html).toContain(
      '<p class="sc-desk-words">Opens on the product.\nNo voice-over: &lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(html).toContain(
      '<a href="https://ads.example/creative/1" target="_blank" rel="noopener noreferrer">In the ad account</a>',
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("A link that is none");
    expect(html).toContain('<a href="/projects/website/tasks/12">#12 in website</a>');
    expect(html).toContain("The winter campaign &lt;i&gt;A&lt;/i&gt;");
    expect(html).toContain("Arm B");
  });

  it("says nothing of a task where it names none, and of uses and figures what there is", () => {
    const html = renderToStaticMarkup(
      <DeskItemView
        collectionKey="documents"
        collection={{ title: "Documents" }}
        item={{ id: "brief", title: "The brief", madeOn: "2026-10-01" }}
        uses={[]}
        results={itemResults(documents, [], "brief")}
        files={[]}
        taskHref={taskHref}
      />,
    );
    expect(html).not.toMatch(/Task|board/);
    expect(html).toContain("No use is recorded.");
    // A collection that keeps no figures has no place for them.
    expect(html).not.toContain("Results");
    expect(html).not.toContain("<img");
  });

  it("shows how it did: its figures over every day, and each day's", () => {
    const html = view([]);
    const stat = (label: string, value: string) =>
      `<div class="sc-stat"><dt class="sc-stat-label">${label}</dt><dd class="sc-stat-value">${value}</dd></div>`;
    expect(html).toContain('<dl class="sc-stats" aria-label="Results">');
    expect(html).toContain(stat("Impressions", "4,000"));
    expect(html).toContain(stat("Clicks", "80"));
    expect(html).toContain(stat("Watched through", "40%"));
    expect(html).toContain(stat("View time", "7.3 s"));
    expect(html).toContain(stat("Clicks per impression", "2%"));
    // Each day's figures are a row of a table, a column a metric: nothing where a day has none.
    expect(html).toContain(
      '<thead><tr><th scope="col">Day</th><th scope="col">Impressions</th><th scope="col">Clicks</th><th scope="col">Watched through</th><th scope="col">View time</th></tr></thead>',
    );
    expect(html).toMatch(
      /<tr><th scope="row"><time class="sc-time" dateTime="2026-11-11">[^<]+<\/time><\/th><td>3,000<\/td><td>50<\/td><td><\/td><td>7\.3 s<\/td><\/tr>/,
    );
    expect(html).toMatch(
      /<tr><th scope="row"><time class="sc-time" dateTime="2026-11-10">[^<]+<\/time><\/th><td>1,000<\/td><td>30<\/td><td>40%<\/td><td><\/td><\/tr>/,
    );
  });

  it("shows a file in place by the kind the server says it is, and hands the rest over", () => {
    const src = (name: string) => `/records/ad-creatives/files/${name}`;
    const html = view([
      { label: "The still", src: src("still.png"), state: { kind: "picture" } },
      { label: "The cut", src: src("cut.webm"), state: { kind: "video" } },
      { label: "The voice", src: src("voice.mp3"), state: { kind: "sound" } },
      { label: "The brief", src: src("brief.pdf"), state: { kind: "pdf", framed: true } },
      { label: "The contract", src: src("contract.pdf"), state: { kind: "pdf", framed: false } },
      { label: "The project", src: src("project.zip"), state: { kind: "other" } },
    ]);
    expect(html).toContain(
      `<img class="sc-desk-file-media" src="${src("still.png")}" alt="The still"`,
    );
    // A film and a sound with the browser's own controls, and nothing of them read until asked.
    expect(html).toContain(
      `<video class="sc-desk-file-media" src="${src("cut.webm")}" controls="" preload="metadata"></video>`,
    );
    expect(html).toContain(
      `<audio class="sc-desk-file-media" src="${src("voice.mp3")}" controls="" preload="none"></audio>`,
    );
    // A PDF in a frame where its answer lets it be framed, and opened apart either way.
    expect(html.match(/<iframe /g)).toHaveLength(1);
    expect(html).toContain(
      `<iframe class="sc-plugin-frame" src="${src("brief.pdf")}" title="The brief" loading="lazy"></iframe>`,
    );
    expect(html).toContain(
      `<a href="${src("contract.pdf")}" target="_blank" rel="noopener noreferrer">Open</a>`,
    );
    // Every file is handed over as a download; anything else is that alone.
    expect(html.match(/ download="">Download<\/a>/g)).toHaveLength(6);
    expect(html).not.toContain(`<a href="${src("project.zip")}" target`);
  });

  it("says of a file that is not here that it is not, with the server's words as text", () => {
    const html = view([
      { label: "Asked", src: "/records/ad-creatives/files/a.mp4", state: { kind: "reading" } },
      {
        label: "The master",
        src: "/records/ad-creatives/files/master.mov",
        state: { kind: "not_fetched", words: "Not fetched: <b>git lfs pull</b>" },
      },
      {
        label: "Refused",
        src: "/records/ad-creatives/files/x.bin",
        state: { kind: "refused", words: undefined },
      },
      { label: "No file of it", src: undefined, state: { kind: "other" } },
      { label: "Gone", src: "/records/ad-creatives/files/gone.bin", state: { kind: "unreadable" } },
    ]);
    expect(html).toContain("Asking for the file");
    expect(html).toContain("Kept with git LFS and not fetched on this machine.");
    expect(html).toContain("Not fetched: &lt;b&gt;git lfs pull&lt;/b&gt;");
    expect(html).toContain("The server would not give this file.");
    expect(html).toContain("This file could not be read.");
    // Nothing that is not there is shown or linked.
    expect(html).not.toContain("<video");
    expect(html).not.toContain("Download");
  });
});

describe("a collection's results", () => {
  const items = [hook1, hook2];
  const results = resultsOf({ collection: ads, rows, today: "2026-11-11", weeks: 2 });
  const best = bestItems({ collection: ads, items, rows, by: "clicks" });

  it("are each metric in all as a figure, by week as a chart with the weeks' figures under them, and what did best as bars", () => {
    const html = renderToStaticMarkup(
      <DeskCollectionResults
        collection={ads}
        results={results}
        best={best}
        onBy={() => undefined}
        itemHref={itemHref}
      />,
    );
    for (const section of ["In all", "By week", "What did best"]) {
      expect(html).toContain(`aria-label="${section}"`);
    }
    // In all: a figure a metric and a ratio, a metric's with the run it came by.
    expect(html).toContain('<dl class="sc-stats" aria-label="In all">');
    expect(html).toContain(
      '<dt class="sc-stat-label">Impressions</dt><dd class="sc-stat-value">4,000</dd><dd class="sc-stat-trend">',
    );
    expect(html).toContain(
      '<div class="sc-stat"><dt class="sc-stat-label">Clicks per impression</dt><dd class="sc-stat-value">2%</dd></div>',
    );
    // By week: a chart a metric, since each has a scale of its own, each week named by its
    // first day; a share and a time carry their unit on the scale.
    expect(html.match(/<figure class="sc-chart sc-chart-short">/g)).toHaveLength(4);
    expect(html).toContain(
      '<h4 class="sc-eyebrow">Impressions</h4><figure class="sc-chart sc-chart-short"><figcaption class="sc-visually-hidden">Impressions · By week</figcaption>',
    );
    expect(html).toContain('<span class="sc-chart-label">Nov 2</span>');
    expect(html).toContain("<title>Nov 9: 4,000</title>");
    expect(html).toContain('<span class="sc-chart-tick">40%</span>');
    expect(html).toContain("<title>Nov 9: 7.3 s</title>");
    // The weeks' figures stand under the charts as one table: nothing where a week has no row.
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain(
      '<thead><tr><th scope="col">Week</th><th scope="col">Impressions</th><th scope="col">Clicks</th><th scope="col">Watched through</th><th scope="col">View time</th></tr></thead>',
    );
    expect(html).toMatch(
      /<tr><th scope="row">Nov 2\s.\s8<\/th><td><\/td><td><\/td><td><\/td><td><\/td><\/tr>/,
    );
    expect(html).toMatch(
      /<tr><th scope="row">Nov 9\s.\s15<\/th><td>4,000<\/td><td>80<\/td><td>40%<\/td><td>7\.3 s<\/td><\/tr>/,
    );
    // What did best: a ranking, each item a link with its status after it and its figure.
    expect(html).toContain('<option value="clicks" selected="">By Clicks</option>');
    expect(html).toContain('<ol class="sc-bars" aria-label="What did best">');
    expect(html).toContain(
      '<span class="sc-bars-label"><a href="/pages/desk?collection=ad-creatives&amp;item=hook-1">The &lt;b&gt;first&lt;/b&gt; hook</a> <span class="sc-badge',
    );
    expect(html).toContain('<span class="sc-bars-value">80</span>');
    // An item with no row of the metric is not among those that did best.
    expect(html).not.toContain("The second hook");
    // No look of its own.
    expect(html).not.toContain("style=");
  });

  it("say so of a collection that keeps no figures", () => {
    const html = renderToStaticMarkup(
      <DeskCollectionResults
        collection={{ title: "Documents" }}
        results={resultsOf({ collection: documents, rows: [], today: "2026-11-11" })}
        best={bestItems({ collection: documents, items: [], rows: [], by: undefined })}
        onBy={() => undefined}
        itemHref={itemHref}
      />,
    );
    expect(html).toBe('<p class="sc-muted">This collection keeps no figures.</p>');
  });

  it("writes a figure in its unit, as each language writes a number", () => {
    const en = ENGLISH.messages.desk.records;
    const ko = KOREAN.messages.desk.records;
    expect(metricWords({ unit: "count", total: 12345.678 }, "en", en)).toBe("12,345.68");
    expect(metricWords({ unit: "currency", total: 1200 }, "en", en)).toBe("1,200");
    expect(metricWords({ unit: "percent", total: 41.26 }, "en", en)).toBe("41.3%");
    expect(metricWords({ unit: "seconds", total: 95 }, "ko", ko)).toBe("95초");
    expect(metricWords({ unit: "count", total: undefined }, "ko", ko)).toBe("없음");
    expect(ratioWords({ as: "percent", value: 0.01739 }, "en", en)).toBe("1.74%");
    expect(ratioWords({ as: "number", value: 0.45 }, "en", en)).toBe("0.45");
    expect(ratioWords({ as: "number", value: undefined }, "en", en)).toBe("none");
  });

  it("speaks Korean from the pack, with a name of its own beside the board's figures", () => {
    const html = renderToStaticMarkup(
      <LanguageContext.Provider value={KOREAN}>
        <DeskCollectionResults
          collection={ads}
          results={results}
          best={best}
          onBy={() => undefined}
          itemHref={itemHref}
        />
      </LanguageContext.Provider>,
    );
    expect(html).toContain('aria-label="전체"');
    expect(html).toContain('aria-label="가장 잘된 것"');
    // The board's figures are "보드 통계"; a collection's are its results, "성과".
    expect(KOREAN.messages.desk.views.figures).toBe("보드 통계");
    expect(KOREAN.messages.desk.records.showResults).toBe("성과");
    expect(ENGLISH.messages.desk.views.figures).toBe("Board figures");
    expect(ENGLISH.messages.desk.records.showResults).toBe("Results");
  });
});
