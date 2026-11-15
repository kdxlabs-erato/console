import { describe, expect, it } from "vitest";
import {
  bestItems,
  fieldsOf,
  figuresOfRows,
  filePath,
  fileSrc,
  httpsLink,
  itemResults,
  lastMadeOn,
  previewPath,
  previewSrc,
  probeFile,
  type RecordsReader,
  readCollection,
  readRecords,
  recordsAddressOf,
  recordsQuery,
  resultsOf,
  statusCounts,
} from "./desk-records.js";
import {
  MAX_RECORD_COLLECTIONS,
  MAX_RECORD_FILE_BYTES,
  MAX_RECORD_ITEMS,
  type RecordCollection,
  type RecordItem,
  type RecordMetricRow,
} from "./desk-records-format.js";

/** What a file of the records is served as: JSON by default, with its words as they are. */
interface Served {
  readonly body: string;
  readonly status?: number;
  readonly type?: string;
  readonly length?: string;
}

/** A reader over invented files, by their path under the records' folder, that keeps what it was asked. */
function readerOf(files: Readonly<Record<string, Served | unknown>>): {
  readonly reader: RecordsReader;
  readonly asked: { readonly path: string; readonly init: RequestInit | undefined }[];
} {
  const asked: { path: string; init: RequestInit | undefined }[] = [];
  return {
    asked,
    reader: {
      fetch: async (path, init) => {
        asked.push({ path, init });
        const file = files[path.replace(/^\/records\//, "")];
        if (file === undefined) {
          // What a server that serves a build answers for a path it has no file at: its page.
          return new Response("Not found", { status: 404 });
        }
        const served: Served =
          typeof file === "object" && file !== null && "body" in file
            ? (file as Served)
            : { body: JSON.stringify(file) };
        return new Response(served.body, {
          status: served.status ?? 200,
          headers: {
            "content-type": served.type ?? "application/json; charset=utf-8",
            ...(served.length === undefined ? {} : { "content-length": served.length }),
          },
        });
      },
    },
  };
}

const ads: RecordCollection = {
  title: "Ad creatives",
  description: "What was made for the ads, and how each did.",
  statuses: [
    { key: "used", label: "Used" },
    { key: "not-used", label: "Not used" },
  ],
  fields: [
    { key: "format", label: "Format", kind: "text" },
    { key: "length", label: "Seconds", kind: "number" },
    { key: "shot-on", label: "Shot on", kind: "day" },
    { key: "source", label: "Source", kind: "link" },
  ],
  metrics: [
    { key: "impressions", label: "Impressions", unit: "count" },
    { key: "clicks", label: "Clicks", unit: "count" },
    { key: "spend", label: "Spend", unit: "currency" },
    { key: "watched", label: "Watched through", unit: "percent" },
  ],
  ratios: [
    { key: "ctr", label: "Clicks per impression", of: "clicks", per: "impressions", as: "percent" },
    { key: "cpc", label: "Spend per click", of: "spend", per: "clicks", as: "number" },
  ],
};

const item = (overrides: Partial<RecordItem> & Pick<RecordItem, "id">): RecordItem => ({
  title: `The ${overrides.id} cut`,
  madeOn: "2026-11-02",
  ...overrides,
});

const row = (
  itemId: string,
  on: string,
  values: Readonly<Record<string, number>>,
): RecordMetricRow => ({ item: itemId, on, values });

describe("the records of a desk, read", () => {
  it("are none where nothing is served at their address, or the server's own page is", async () => {
    const nothing = readerOf({});
    expect(await readRecords(nothing.reader)).toEqual({ kind: "none" });
    expect(nothing.asked.map((one) => one.path)).toEqual(["/records/index.json"]);
    // Asked of the page's own origin, with what the browser holds for it, and never from a cache.
    expect(nothing.asked[0]?.init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    const page = readerOf({ "index.json": { body: "<!doctype html>", type: "text/html" } });
    expect(await readRecords(page.reader)).toEqual({ kind: "none" });
  });

  it("are the collections the index names, each with its items counted by status", async () => {
    const { reader, asked } = readerOf({
      "index.json": {
        collections: [
          { key: "ad-creatives", title: "Ads" },
          { key: "documents", title: "Documents" },
        ],
      },
      "ad-creatives/collection.json": ads,
      "ad-creatives/items.json": [
        item({ id: "hook-1", status: "used", madeOn: "2026-11-02" }),
        item({ id: "hook-2", status: "not-used", madeOn: "2026-11-09" }),
        item({ id: "hook-3", status: "used", madeOn: "2026-10-20" }),
        item({ id: "hook-4" }),
      ],
      "documents/collection.json": { title: "Documents" },
      "documents/items.json": [],
    });
    const overview = await readRecords(reader);
    expect(overview).toEqual({
      kind: "read",
      problems: [],
      collections: [
        {
          key: "ad-creatives",
          // The collection's own title, where it has one; the index's stands in.
          title: "Ad creatives",
          description: "What was made for the ads, and how each did.",
          items: 4,
          statuses: [
            { key: "used", label: "Used", count: 2 },
            { key: "not-used", label: "Not used", count: 1 },
          ],
          lastMadeOn: "2026-11-09",
        },
        {
          key: "documents",
          title: "Documents",
          description: undefined,
          items: 0,
          statuses: [],
          lastMadeOn: undefined,
        },
      ],
    });
    // The index, then two files a collection: the uses and the metrics wait for their pages.
    expect(asked.map((one) => one.path).sort()).toEqual([
      "/records/ad-creatives/collection.json",
      "/records/ad-creatives/items.json",
      "/records/documents/collection.json",
      "/records/documents/items.json",
      "/records/index.json",
    ]);
  });

  it("name a file that is wrong, with where, and show the rest", async () => {
    const { reader } = readerOf({
      "index.json": {
        collections: [
          { key: "ad-creatives", title: "Ads" },
          { key: "documents", title: "Documents" },
          { key: "notes", title: "Notes" },
        ],
      },
      "ad-creatives/collection.json": { body: "{ not json" },
      "ad-creatives/items.json": [
        item({ id: "hook-1" }),
        { id: "hook-2", title: "No day", madeOn: "yesterday" },
        { id: "bad id", title: "A space in its id", madeOn: "2026-11-01" },
        item({ id: "hook-4" }),
      ],
      "documents/collection.json": { title: "" },
      "documents/items.json": { body: "x", status: 500 },
      "notes/collection.json": { title: "Notes" },
      "notes/items.json": { items: [] },
    });
    const overview = await readRecords(reader);
    expect(overview.kind).toBe("read");
    if (overview.kind !== "read") {
      return;
    }
    expect(overview.collections.map((one) => [one.key, one.title, one.items])).toEqual([
      // The index's title stands in for a collection whose own file is wrong.
      ["ad-creatives", "Ads", 2],
      ["documents", "Documents", 0],
      ["notes", "Notes", 0],
    ]);
    expect(overview.problems).toEqual([
      { file: "ad-creatives/collection.json", kind: "not_json" },
      { file: "ad-creatives/items.json", kind: "not_as_format", at: "[1].madeOn", left: 2 },
      { file: "documents/collection.json", kind: "not_as_format", at: "title" },
      { file: "documents/items.json", kind: "unreadable" },
      { file: "notes/items.json", kind: "not_as_format", at: "" },
    ]);
  });

  it("say so of an index that is wrong, and read no collection by it", async () => {
    const broken = readerOf({ "index.json": { body: "[" } });
    expect(await readRecords(broken.reader)).toEqual({
      kind: "read",
      collections: [],
      problems: [{ file: "index.json", kind: "not_json" }],
    });
    const wrong = readerOf({ "index.json": { collections: [{ key: "Up/../Out", title: "x" }] } });
    expect(await readRecords(wrong.reader)).toEqual({
      kind: "read",
      collections: [],
      problems: [{ file: "index.json", kind: "not_as_format", at: "collections[0].key" }],
    });
    expect(wrong.asked).toHaveLength(1);
    const many = readerOf({
      "index.json": {
        collections: Array.from({ length: MAX_RECORD_COLLECTIONS + 1 }, (_, index) => ({
          key: `c${index}`,
          title: "x",
        })),
      },
    });
    expect((await readRecords(many.reader)).kind).toBe("read");
    expect(many.asked).toHaveLength(1);
  });

  it("read no more of a file than the pages read, by what it says of its length or by what comes", async () => {
    const declared = readerOf({
      "index.json": { body: "{}", length: String(MAX_RECORD_FILE_BYTES + 1) },
    });
    expect(await readRecords(declared.reader)).toEqual({
      kind: "read",
      collections: [],
      problems: [{ file: "index.json", kind: "too_large" }],
    });
    const long = readerOf({
      "index.json": { body: `{"collections":[],"pad":"${"x".repeat(MAX_RECORD_FILE_BYTES)}"}` },
    });
    expect(await readRecords(long.reader)).toEqual({
      kind: "read",
      collections: [],
      problems: [{ file: "index.json", kind: "too_large" }],
    });
  });

  it("call a file unreadable where the request itself fails", async () => {
    const reader: RecordsReader = {
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    };
    expect(await readRecords(reader)).toEqual({
      kind: "read",
      collections: [],
      problems: [{ file: "index.json", kind: "unreadable" }],
    });
  });
});

describe("one collection, read", () => {
  it("is its items the last made first, with the uses and the metrics of the items it holds", async () => {
    const { reader, asked } = readerOf({
      "ad-creatives/collection.json": ads,
      "ad-creatives/items.json": [
        item({ id: "hook-1", madeOn: "2026-10-20" }),
        item({ id: "hook-2", madeOn: "2026-11-09" }),
        // An id stands for one item: the second of two is left out.
        item({ id: "hook-1", title: "The same id again", madeOn: "2026-11-10" }),
      ],
      "ad-creatives/uses.json": [
        { item: "hook-1", on: "2026-10-22", where: "The autumn campaign" },
        { item: "hook-2", on: "2026-11-10", where: "The winter campaign", note: "A/B, arm B" },
        { item: "gone", on: "2026-11-11", where: "An item the collection does not hold" },
      ],
      "ad-creatives/metrics.json": [
        row("hook-1", "2026-10-22", { impressions: 1000, clicks: 30 }),
        row("gone", "2026-10-22", { impressions: 5 }),
      ],
    });
    const records = await readCollection(reader, "ad-creatives");
    expect(records.found).toBe(true);
    expect(records.collection?.title).toBe("Ad creatives");
    expect(records.items.map((one) => [one.id, one.madeOn])).toEqual([
      ["hook-2", "2026-11-09"],
      ["hook-1", "2026-10-20"],
    ]);
    expect(records.uses.map((use) => use.item)).toEqual(["hook-2", "hook-1"]);
    expect(records.metrics.map((one) => one.item)).toEqual(["hook-1"]);
    expect(records.problems).toEqual([]);
    expect(asked.map((one) => one.path).sort()).toEqual([
      "/records/ad-creatives/collection.json",
      "/records/ad-creatives/items.json",
      "/records/ad-creatives/metrics.json",
      "/records/ad-creatives/uses.json",
    ]);
  });

  it("holds nothing of uses or metrics that are not kept, and is not found where nothing of it is", async () => {
    const { reader } = readerOf({
      "documents/collection.json": { title: "Documents" },
      "documents/items.json": [item({ id: "brief" })],
    });
    const documents = await readCollection(reader, "documents");
    expect([documents.found, documents.uses, documents.metrics, documents.problems]).toEqual([
      true,
      [],
      [],
      [],
    ]);
    expect((await readCollection(reader, "nothing-here")).found).toBe(false);
  });

  it("asks nothing for a key that could be none", async () => {
    const { reader, asked } = readerOf({});
    for (const key of ["../secrets", "Ads", "a/b", "", "a b", ".git"]) {
      expect((await readCollection(reader, key)).found).toBe(false);
    }
    expect(asked).toEqual([]);
  });

  it("leaves out what is over the bound of a list, and says how many", async () => {
    const { reader } = readerOf({
      "many/collection.json": { title: "Many" },
      "many/items.json": Array.from({ length: MAX_RECORD_ITEMS + 3 }, (_, index) =>
        item({ id: `i${index}` }),
      ),
    });
    const many = await readCollection(reader, "many", undefined, { items: true });
    expect(many.items).toHaveLength(MAX_RECORD_ITEMS);
    expect(many.problems).toEqual([
      { file: "many/items.json", kind: "not_as_format", at: `[${MAX_RECORD_ITEMS}]`, left: 3 },
    ]);
  });

  it("holds what an agent could send on purpose to what the format says", async () => {
    const { reader } = readerOf({
      "ads/collection.json": {
        title: "Ads",
        // A deep nesting where a label is: not a label.
        statuses: [{ key: "used", label: { toString: "x" } }],
      },
      "ads/items.json": [
        { id: "a", title: "x".repeat(201), madeOn: "2026-11-01" },
        {
          id: "b",
          title: "A field that is neither words nor a number",
          madeOn: "2026-11-01",
          fields: { n: { deep: [[[[[[[[[["down"]]]]]]]]]] } },
        },
        {
          id: "c",
          title: "A task that is no task",
          madeOn: "2026-11-01",
          task: { project: "Web", number: -1 },
        },
        { id: "__proto__", title: "An id that is no id", madeOn: "2026-11-01" },
        {
          id: "ok",
          title: "<img src=x onerror=alert(1)>",
          madeOn: "2026-11-01",
          note: "[x](javascript:alert(1))",
        },
      ],
    });
    const records = await readCollection(reader, "ads", undefined, { items: true });
    expect(records.collection).toBeUndefined();
    // What is text is kept as the text it is: it is the page that shows it as text.
    expect(records.items.map((one) => one.id)).toEqual(["ok"]);
    expect(records.problems).toEqual([
      { file: "ads/collection.json", kind: "not_as_format", at: "statuses[0].label" },
      { file: "ads/items.json", kind: "not_as_format", at: "[0].title", left: 4 },
    ]);
  });

  it("takes no number that is none, as JSON may spell one", async () => {
    const { reader } = readerOf({
      "ads/collection.json": { title: "Ads" },
      "ads/items.json": [{ id: "a", title: "A", madeOn: "2026-11-01" }],
      // A number too large to be one, which a JSON text may still hold.
      "ads/metrics.json": {
        body: '[{"item":"a","on":"2026-11-01","values":{"clicks":1e400}},{"item":"a","on":"2026-11-02","values":{"clicks":3}}]',
      },
    });
    const records = await readCollection(reader, "ads");
    expect(records.metrics.map((one) => one.values)).toEqual([{ clicks: 3 }]);
    expect(records.problems).toEqual([
      { file: "ads/metrics.json", kind: "not_as_format", at: "[0].values.clicks", left: 1 },
    ]);
  });
});

describe("what a record says, as a page may take it", () => {
  it("takes a preview only as a picture under the collection's files", () => {
    expect(previewPath("files/hook-1.png")).toBe("files/hook-1.png");
    expect(previewPath("hook-1.png")).toBe("files/hook-1.png");
    expect(previewPath("files/2026/hook 1.JPG")).toBe("files/2026/hook 1.JPG");
    for (const not of [
      undefined,
      "",
      "files/",
      "../index.json",
      "files/../../secret.png",
      "/etc/passwd.png",
      "files/.hidden.png",
      "files/hook-1.svg",
      "files/hook-1.png?x=1",
      "files/hook-1.png#x",
      "files/%2e%2e/x.png",
      "files\\hook-1.png",
      "https://elsewhere.example/a.png",
      "//elsewhere.example/a.png",
      "files/hook-1",
      "files/hook-1.png/",
    ]) {
      expect(previewPath(not), String(not)).toBeUndefined();
    }
    expect(previewSrc("ad-creatives", "files/2026/hook 1.png")).toBe(
      "/records/ad-creatives/files/2026/hook%201.png",
    );
    expect(previewSrc("ad-creatives", "hook-1.png", "/kept")).toBe(
      "/kept/ad-creatives/files/hook-1.png",
    );
    expect(previewSrc("../x", "hook-1.png")).toBeUndefined();
    expect(previewSrc("ad-creatives", "../x.png")).toBeUndefined();
  });

  it("takes a file of any kind, and only under the collection's files", () => {
    expect(filePath("files/cut-1.mp4")).toBe("files/cut-1.mp4");
    expect(filePath("brief.pdf")).toBe("files/brief.pdf");
    expect(filePath("files/raw/project.zip")).toBe("files/raw/project.zip");
    for (const not of [
      undefined,
      "",
      "files",
      "../x.mp4",
      "files/../x.mp4",
      "files/.env",
      "a\\b",
    ]) {
      expect(filePath(not), String(not)).toBeUndefined();
    }
    expect(fileSrc("ad-creatives", "files/cut 1.mp4")).toBe(
      "/records/ad-creatives/files/cut%201.mp4",
    );
    expect(fileSrc("Ad Creatives", "files/cut-1.mp4")).toBeUndefined();
  });

  it("asks the server what a file is by its first bytes, and shows it by the kind it says", async () => {
    const answered = (
      files: Readonly<Record<string, Served>>,
    ): Promise<readonly [string, unknown][]> => {
      const { reader } = readerOf(files);
      return Promise.all(
        Object.keys(files).map(
          async (path) =>
            [path, await probeFile(reader, "ads", path.replace(/^ads\//, ""))] as const,
        ),
      ).then((all) => all.map(([path, state]) => [path, state] as [string, unknown]));
    };
    expect(
      await answered({
        "ads/files/a.png": { body: "PNG", type: "image/png" },
        "ads/files/a.svg": { body: "<svg/>", type: "image/svg+xml" },
        "ads/files/a.mp4": { body: "ftyp", type: "video/mp4" },
        "ads/files/a.mp3": { body: "ID3", type: "audio/mpeg" },
        "ads/files/a.pdf": { body: "%PDF-1.7", type: "application/pdf" },
        "ads/files/a.zip": { body: "PK", type: "application/zip" },
        "ads/files/a.html": { body: "<script>alert(1)</script>", type: "text/html" },
      }),
    ).toEqual([
      ["ads/files/a.png", { kind: "picture" }],
      ["ads/files/a.svg", { kind: "picture" }],
      ["ads/files/a.mp4", { kind: "video" }],
      ["ads/files/a.mp3", { kind: "sound" }],
      ["ads/files/a.pdf", { kind: "pdf", framed: true }],
      ["ads/files/a.zip", { kind: "other" }],
      // A page of an agent's own writing is never shown: it is handed over as a file.
      ["ads/files/a.html", { kind: "other" }],
    ]);
  });

  it("frames a PDF only where its own answer lets a page of the same origin frame it", async () => {
    const framed = async (headers: Readonly<Record<string, string>>) => {
      const reader: RecordsReader = {
        fetch: async () =>
          new Response("%PDF-1.7", {
            headers: { "content-type": "application/pdf", ...headers },
          }),
      };
      return probeFile(reader, "ads", "files/a.pdf");
    };
    expect(await framed({})).toEqual({ kind: "pdf", framed: true });
    expect(
      await framed({ "content-security-policy": "default-src 'self'; frame-ancestors 'self'" }),
    ).toEqual({ kind: "pdf", framed: true });
    expect(
      await framed({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }),
    ).toEqual({ kind: "pdf", framed: false });
    expect(await framed({ "x-frame-options": "DENY" })).toEqual({ kind: "pdf", framed: false });
  });

  it("says of a file git LFS has not fetched that it is not here, and keeps a refusal's own words", async () => {
    const { reader, asked } = readerOf({
      "ads/files/pointer.mp4": {
        body: "version https://git-lfs.github.com/spec/v1\noid sha256:4d7a\nsize 734003200\n",
        type: "video/mp4",
      },
      "ads/files/told.mp4": {
        body: "This file is kept with git LFS and was not fetched on this machine: git lfs pull",
        status: 409,
        type: "text/plain; charset=utf-8",
      },
      "ads/files/refused.bin": {
        body: `Not served: ${"x".repeat(1000)}`,
        status: 403,
        type: "text/plain",
      },
      "ads/files/broken.bin": { body: "<html>", status: 500, type: "text/html" },
    });
    expect(await probeFile(reader, "ads", "files/pointer.mp4")).toEqual({
      kind: "not_fetched",
      words: undefined,
    });
    expect(await probeFile(reader, "ads", "files/told.mp4")).toEqual({
      kind: "not_fetched",
      words: "This file is kept with git LFS and was not fetched on this machine: git lfs pull",
    });
    const refused = await probeFile(reader, "ads", "files/refused.bin");
    expect(refused.kind).toBe("refused");
    // The server's words as far as a line holds, and no more of what it sent.
    expect(refused.kind === "refused" ? refused.words?.length : 0).toBe(256);
    // What is no words is not shown as words.
    expect(await probeFile(reader, "ads", "files/broken.bin")).toEqual({
      kind: "refused",
      words: undefined,
    });
    expect(await probeFile(reader, "ads", "files/gone.bin")).toEqual({
      kind: "refused",
      words: "Not found",
    });
    expect(await probeFile(reader, "ads", "../../etc/passwd")).toEqual({ kind: "unreadable" });
    // The first bytes alone are asked for, of the page's own origin.
    expect(asked[0]?.path).toBe("/records/ads/files/pointer.mp4");
    expect(asked[0]?.init).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      headers: { range: "bytes=0-255" },
    });
    expect(asked.some((one) => one.path.includes("passwd"))).toBe(false);
  });

  it("takes a link only as https", () => {
    expect(httpsLink("https://ads.example/creative/1?x=1")).toBe(
      "https://ads.example/creative/1?x=1",
    );
    for (const not of [
      undefined,
      "",
      "http://ads.example/creative/1",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "/pages/desk",
      "ads.example/creative/1",
      "https://user:secret@ads.example/",
      " https//x",
    ]) {
      expect(httpsLink(not), String(not)).toBeUndefined();
    }
  });

  it("reads an item's fields in the collection's order, each as its kind, and as text what is not of it", () => {
    const fields = fieldsOf(ads, {
      fields: {
        source: "https://drive.example/hook-1",
        length: 15,
        format: "Vertical, 9:16",
        "shot-on": "2026-10-30",
        // Not a field of the collection: not shown.
        extra: "nothing reads this",
      },
    });
    expect(fields).toEqual([
      { key: "format", label: "Format", value: { kind: "text", text: "Vertical, 9:16" } },
      { key: "length", label: "Seconds", value: { kind: "number", value: 15 } },
      { key: "shot-on", label: "Shot on", value: { kind: "day", day: "2026-10-30" } },
      {
        key: "source",
        label: "Source",
        value: { kind: "link", href: "https://drive.example/hook-1" },
      },
    ]);
    expect(
      fieldsOf(ads, {
        fields: { source: "javascript:alert(1)", length: "fifteen", "shot-on": "soon", format: "" },
      }).map((field) => field.value),
    ).toEqual([
      { kind: "text", text: "fifteen" },
      { kind: "text", text: "soon" },
      { kind: "text", text: "javascript:alert(1)" },
    ]);
    expect(fieldsOf(undefined, { fields: { format: "x" } })).toEqual([]);
    expect(fieldsOf(ads, {})).toEqual([]);
  });

  it("counts the items by the statuses the collection names, and finds the last made", () => {
    const items = [
      item({ id: "a", status: "used", madeOn: "2026-10-01" }),
      item({ id: "b", status: "elsewhere", madeOn: "2026-11-03" }),
      item({ id: "c", madeOn: "2026-10-12" }),
    ];
    expect(statusCounts(ads, items)).toEqual([
      { key: "used", label: "Used", count: 1 },
      { key: "not-used", label: "Not used", count: 0 },
    ]);
    expect(statusCounts(undefined, items)).toEqual([]);
    expect(lastMadeOn(items)).toBe("2026-11-03");
    expect(lastMadeOn([])).toBeUndefined();
  });
});

describe("how a collection did", () => {
  const rows = [
    row("a", "2026-11-10", { impressions: 1000, clicks: 30, spend: 12, watched: 40 }),
    row("a", "2026-11-11", { impressions: 3000, clicks: 50, spend: 20, watched: 20 }),
    row("b", "2026-11-03", { impressions: 500, clicks: 0, spend: 4 }),
    row("c", "2026-09-01", { impressions: 100 }),
  ];

  it("sums a metric over its rows, takes the mean of a percentage, and works a ratio out from the sums", () => {
    const figures = figuresOfRows(ads, rows);
    expect(figures.metrics.map((metric) => [metric.key, metric.total])).toEqual([
      ["impressions", 4600],
      ["clicks", 80],
      ["spend", 36],
      ["watched", 30],
    ]);
    expect(figures.ratios).toEqual([
      { key: "ctr", label: "Clicks per impression", as: "percent", value: 80 / 4600 },
      { key: "cpc", label: "Spend per click", as: "number", value: 36 / 80 },
    ]);
    // Nothing of a metric no row has, and no ratio where there is none of what it is for each of.
    const none = figuresOfRows(ads, [row("b", "2026-11-03", { impressions: 500, spend: 4 })]);
    expect(none.metrics.map((metric) => metric.total)).toEqual([500, undefined, 4, undefined]);
    expect(none.ratios.map((ratio) => ratio.value)).toEqual([0, undefined]);
    expect(figuresOfRows(undefined, rows)).toEqual({ metrics: [], ratios: [] });
  });

  it("counts by week, the last being this one, as the week begins", () => {
    // 2026-11-11 is a Wednesday: its week begins on Monday the 9th.
    const results = resultsOf({ collection: ads, rows, today: "2026-11-11", weeks: 2 });
    expect(results.weeks.map((week) => [week.start, week.end])).toEqual([
      ["2026-11-02", "2026-11-08"],
      ["2026-11-09", "2026-11-15"],
    ]);
    expect(results.weeks.map((week) => week.metrics[0]?.total)).toEqual([500, 4000]);
    expect(results.metrics[0]?.total).toBe(4600);
    expect(resultsOf({ collection: ads, rows, today: "2026-11-11" }).weeks).toHaveLength(8);
    expect(
      resultsOf({ collection: ads, rows, today: "2026-11-11", weeks: 1, firstDay: 7 }).weeks[0]
        ?.start,
    ).toBe("2026-11-08");
  });

  it("names the items that did best by a metric, the most first", () => {
    const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" }), item({ id: "d" })];
    const byClicks = bestItems({ collection: ads, items, rows, by: "clicks" });
    expect(byClicks.metric?.key).toBe("clicks");
    // An item with no row of the metric is not among them.
    expect(byClicks.items.map((one) => [one.item.id, one.total])).toEqual([
      ["a", 80],
      ["b", 0],
    ]);
    // A metric the collection does not name is its first.
    expect(bestItems({ collection: ads, items, rows, by: "nonsense" }).metric?.key).toBe(
      "impressions",
    );
    expect(
      bestItems({ collection: ads, items, rows, by: "impressions", limit: 1 }).items,
    ).toHaveLength(1);
    expect(bestItems({ collection: undefined, items, rows, by: undefined })).toEqual({
      metric: undefined,
      items: [],
    });
  });

  it("gives one item its rows by day, the last first, and its own figures", () => {
    const results = itemResults(ads, rows, "a");
    expect(results.days.map((day) => day.on)).toEqual(["2026-11-11", "2026-11-10"]);
    expect(results.metrics[0]?.total).toBe(4000);
    expect(results.ratios[0]?.value).toBe(80 / 4000);
    expect(itemResults(ads, rows, "nobody").days).toEqual([]);
  });
});

describe("the address of the records' view", () => {
  it("says a collection, an item of it, its results, or how its items are narrowed", () => {
    expect(recordsAddressOf("")).toEqual({});
    expect(recordsAddressOf("?collection=ad-creatives")).toEqual({
      collection: "ad-creatives",
      status: undefined,
    });
    expect(recordsAddressOf("?collection=ad-creatives&status=used")).toEqual({
      collection: "ad-creatives",
      status: "used",
    });
    expect(recordsAddressOf("?collection=ad-creatives&item=Hook-1")).toEqual({
      collection: "ad-creatives",
      item: "Hook-1",
    });
    expect(recordsAddressOf("?collection=ad-creatives&show=results&by=clicks")).toEqual({
      collection: "ad-creatives",
      results: true,
      by: "clicks",
    });
    // What could be no key names nothing.
    expect(recordsAddressOf("?collection=../x&item=a")).toEqual({});
    expect(recordsAddressOf("?collection=ads&item=a/b")).toEqual({
      collection: "ads",
      status: undefined,
    });
    expect(recordsAddressOf("?item=a")).toEqual({});
  });

  it("is written back as the query it was read from", () => {
    for (const query of [
      "",
      "collection=ad-creatives",
      "collection=ad-creatives&status=used",
      "collection=ad-creatives&item=Hook-1",
      "collection=ad-creatives&show=results",
      "collection=ad-creatives&show=results&by=clicks",
    ]) {
      expect(recordsQuery(recordsAddressOf(`?${query}`))).toBe(query);
    }
  });
});
