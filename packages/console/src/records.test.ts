import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkRecords,
  isLfsPointer,
  isRecordDay,
  isRecordFilePath,
  isRecordLink,
  isRecordPreviewPath,
  MAX_RECORD_COLLECTIONS,
  MAX_RECORD_FILE_BYTES,
  MAX_RECORD_ITEMS,
  MAX_RECORD_KEY_LENGTH,
  MAX_RECORD_LINE_LENGTH,
  MAX_RECORD_METRIC_ROWS,
  MAX_RECORD_TEXT_LENGTH,
  MAX_RECORD_USES,
  RECORD_FIELD_KINDS,
  RECORD_METRIC_UNITS,
  RECORD_PREVIEW_KINDS,
  RECORD_RATIO_FORMS,
  type RecordsFiles,
  readRecords,
  recordsCollectionSchema,
  recordsIndexSchema,
  recordsItemsSchema,
  recordsMetricsSchema,
  recordsUsesSchema,
} from "./records.js";

// The format of a desk's records (ADR-0117): what the schemas read, what they refuse, and what
// the check says of a whole desk. Every fixture is invented.

const INDEX = { collections: [{ key: "ad-creatives", title: "Ad creatives" }] };
const COLLECTION = {
  title: "Ad creatives",
  description: "What was made for the ads, and how each did.",
  statuses: [
    { key: "used", label: "Used" },
    { key: "unused", label: "Not used" },
  ],
  fields: [
    { key: "format", label: "Format", kind: "text" },
    { key: "seconds", label: "Length", kind: "number" },
    { key: "shot", label: "Shot on", kind: "day" },
    { key: "brief", label: "Brief", kind: "link" },
  ],
  metrics: [
    { key: "impressions", label: "Impressions", unit: "count" },
    { key: "clicks", label: "Clicks", unit: "count" },
    { key: "spend", label: "Spend", unit: "currency", currency: "KRW" },
  ],
  ratios: [
    { key: "ctr", label: "Clicks per impression", of: "clicks", per: "impressions", as: "percent" },
  ],
};
const ITEMS = [
  {
    id: "c-001",
    title: "Morning commute, 15 seconds",
    madeOn: "2026-11-03",
    status: "used",
    preview: "files/c-001.png",
    files: [{ label: "The video", path: "files/c-001.mp4" }],
    links: [{ label: "Where it runs", url: "https://ads.acme.example/c-001" }],
    task: { project: "ads", number: 12 },
    fields: {
      format: "9:16",
      seconds: 15,
      shot: "2026-11-01",
      brief: "https://docs.acme.example/brief",
    },
    note: "The first cut.",
  },
  { id: "c-002", title: "Evening commute, 15 seconds", madeOn: "2026-11-05", status: "unused" },
];
const USES = [{ item: "c-001", on: "2026-11-06", where: "The November campaign, feed" }];
const METRICS = [
  { item: "c-001", on: "2026-11-06", values: { impressions: 1200, clicks: 36, spend: 54000 } },
  { item: "c-001", on: "2026-11-07", values: { impressions: 900, clicks: 21 } },
];

/**
 * A desk's records in memory: JSON files as what they hold, any other file as its size in
 * bytes; and the files that are git LFS pointers, by their paths.
 */
function desk(
  files: Readonly<Record<string, unknown>>,
  pointers: readonly string[] = [],
): RecordsFiles {
  const text = (value: unknown): string =>
    typeof value === "string" ? value : JSON.stringify(value);
  return {
    read: async (path) =>
      path in files && typeof files[path] !== "number" ? text(files[path]) : undefined,
    size: async (path) =>
      !(path in files)
        ? undefined
        : typeof files[path] === "number"
          ? (files[path] as number)
          : text(files[path]).length,
    pointer: async (path) => pointers.includes(path),
    folders: async () => [
      ...new Set(
        Object.keys(files)
          .filter((path) => path.includes("/"))
          .map((path) => path.split("/")[0] ?? ""),
      ),
    ],
  };
}

const WHOLE = {
  "index.json": INDEX,
  "ad-creatives/collection.json": COLLECTION,
  "ad-creatives/items.json": ITEMS,
  "ad-creatives/uses.json": USES,
  "ad-creatives/metrics.json": METRICS,
  "ad-creatives/files/c-001.png": 48_000,
  // A desk keeps the file itself, of any size.
  "ad-creatives/files/c-001.mp4": 480_000_000,
};

describe("the format of a desk's records (ADR-0117)", () => {
  it("reads an index, a collection, its items, their uses and their figures", () => {
    expect(readRecords(recordsIndexSchema, JSON.stringify(INDEX))).toEqual({
      ok: true,
      value: INDEX,
    });
    expect(readRecords(recordsCollectionSchema, JSON.stringify(COLLECTION)).ok).toBe(true);
    expect(readRecords(recordsItemsSchema, JSON.stringify(ITEMS))).toEqual({
      ok: true,
      value: ITEMS,
    });
    expect(readRecords(recordsUsesSchema, JSON.stringify(USES)).ok).toBe(true);
    expect(readRecords(recordsMetricsSchema, JSON.stringify(METRICS)).ok).toBe(true);
    // The least a collection and an item say.
    expect(readRecords(recordsCollectionSchema, '{"title":"Documents"}').ok).toBe(true);
    expect(
      readRecords(recordsItemsSchema, '[{"id":"d1","title":"The plan","madeOn":"2026-11-15"}]').ok,
    ).toBe(true);
    // What a newer format adds is read past, not refused: the check says it, the pages go on.
    expect(
      readRecords(
        recordsItemsSchema,
        '[{"id":"d1","title":"The plan","madeOn":"2026-11-15","colour":"red"}]',
      ).ok,
    ).toBe(true);
  });

  it("says in words what is wrong with a file, each problem with where it is", () => {
    expect(readRecords(recordsItemsSchema, "{ not json")).toEqual({
      ok: false,
      problems: ["is not JSON"],
    });
    expect(readRecords(recordsItemsSchema, '{"items":[]}')).toEqual({
      ok: false,
      problems: ["is not a list"],
    });
    const wrong = readRecords(
      recordsItemsSchema,
      JSON.stringify([
        { id: "c 1", title: "", madeOn: "2026-02-30" },
        {
          id: "c-2",
          madeOn: "15/11/2026",
          status: "Used",
          preview: "../../secret.png",
          files: [{ label: "The cut", path: "c-2.mp4" }],
          links: [{ label: "Here", url: "http://media.acme.example/x" }],
          task: { project: "ads", number: 0 },
          fields: { ready: true },
        },
      ]),
    );
    expect(wrong).toEqual({
      ok: false,
      problems: [
        "[0].id is letters, digits and hyphens",
        "[0].title is empty",
        "[0].madeOn is a day, written as 2026-11-15",
        "[1].title is missing",
        "[1].madeOn is a day, written as 2026-11-15",
        "[1].status is lowercase letters, digits and hyphens",
        "[1].preview is a picture under files/, as files/name.png (png, jpg, jpeg, webp, gif, avif, svg)",
        "[1].files[0].path is a file under files/, as files/name.mp4",
        "[1].links[0].url is an address that begins with https://",
        "[1].task.number is under 0",
        "[1].fields.ready is neither text nor a number",
      ],
    });
    expect(
      readRecords(
        recordsCollectionSchema,
        '{"title":"x","fields":[{"key":"a","label":"A","kind":"date"}]}',
      ),
    ).toEqual({ ok: false, problems: ["fields[0].kind is not one of text, number, day, link"] });
    expect(
      readRecords(
        recordsMetricsSchema,
        '[{"item":"c-1","on":"2026-11-06","values":{"clicks":"36"}}]',
      ),
    ).toEqual({ ok: false, problems: ["[0].values.clicks is not a number"] });
  });

  it("holds what is written to its bounds, and what a person reads to text", () => {
    const long = "x".repeat(MAX_RECORD_LINE_LENGTH + 1);
    expect(
      readRecords(recordsIndexSchema, JSON.stringify({ collections: [{ key: "a", title: long }] })),
    ).toEqual({
      ok: false,
      problems: [`collections[0].title is longer than ${MAX_RECORD_LINE_LENGTH} characters`],
    });
    const many = Array.from({ length: MAX_RECORD_COLLECTIONS + 1 }, (_, n) => ({
      key: `c${n}`,
      title: "A collection",
    }));
    expect(readRecords(recordsIndexSchema, JSON.stringify({ collections: many }))).toEqual({
      ok: false,
      problems: [`collections holds more than ${MAX_RECORD_COLLECTIONS}`],
    });
    const items = Array.from({ length: MAX_RECORD_ITEMS + 1 }, (_, n) => ({
      id: `i${n}`,
      title: "An item",
      madeOn: "2026-11-15",
    }));
    expect(readRecords(recordsItemsSchema, JSON.stringify(items))).toEqual({
      ok: false,
      problems: [`holds more than ${MAX_RECORD_ITEMS}`],
    });
    // A title is one line, and no text carries what makes one string look like another.
    const sly = [
      { id: "a", title: "One\nTwo", madeOn: "2026-11-15" },
      { id: "b", title: `Safe${String.fromCodePoint(0x202e)}gnp.exe`, madeOn: "2026-11-15" },
      {
        id: "c",
        title: "Fine",
        madeOn: "2026-11-15",
        note: `A note${String.fromCodePoint(0x1b)}[31m`,
      },
    ];
    expect(readRecords(recordsItemsSchema, JSON.stringify(sly))).toEqual({
      ok: false,
      problems: [
        "[0].title is one line, with no control character",
        "[1].title is one line, with no control character",
        "[2].note holds a control character",
      ],
    });
    // A file of nothing but problems says the first of them, and how many more.
    const bad = Array.from({ length: 30 }, () => ({ id: "a" }));
    const said = readRecords(recordsItemsSchema, JSON.stringify(bad));
    expect(said.ok).toBe(false);
    expect(said.ok ? [] : said.problems).toHaveLength(21);
    expect(said.ok ? "" : said.problems.at(-1)).toBe("and 40 more of the kind");
    // Nesting as deep as a parser takes is no item.
    const deep = `${"[".repeat(2000)}${"]".repeat(2000)}`;
    expect(readRecords(recordsItemsSchema, deep).ok).toBe(false);
  });

  it("takes a day, an address and the path of a file for what they are", () => {
    expect(isRecordDay("2026-11-15")).toBe(true);
    expect(isRecordDay("2026-02-30")).toBe(false);
    expect(isRecordDay("2026-11-15T00:00:00Z")).toBe(false);
    expect(isRecordLink("https://ads.example/c/1?x=1")).toBe(true);
    for (const no of [
      "http://ads.example",
      "javascript:alert(1)",
      "https://",
      "https://a b",
      "//ads.example",
      "data:text/html,x",
    ]) {
      expect(isRecordLink(no), no).toBe(false);
    }
    // A file is anything a desk keeps, under files/, by a name a file system and an address both take.
    for (const yes of [
      "files/c-001.mp4",
      "files/2026/The final cut (v2).mov",
      `files/${String.fromCodePoint(0xad11, 0xace0)}.pdf`,
      "files/notes",
    ]) {
      expect(isRecordFilePath(yes), yes).toBe(true);
    }
    for (const no of [
      "c-001.mp4",
      "files/",
      "files",
      "files/../items.json",
      "files/.hidden.png",
      "files/a/../../b.png",
      "/files/a.png",
      "files\\a.png",
      "files/a\\b.png",
      "files/C:evil.png",
      "files/a.png.",
      "files/a.png ",
      "files/a?.png",
      `files/a${String.fromCodePoint(0)}.png`,
      "https://x.example/a.png",
    ]) {
      expect(isRecordFilePath(no), no).toBe(false);
    }
    // A preview is such a file that is a picture.
    expect(isRecordPreviewPath("files/c-001.png")).toBe(true);
    expect(isRecordPreviewPath("files/2026/c_001.final.JPG")).toBe(true);
    expect(isRecordPreviewPath("files/mark.svg")).toBe(true);
    for (const no of ["files/c-001.mp4", "files/a.png.exe", "files/a", "files/../a.png"]) {
      expect(isRecordPreviewPath(no), no).toBe(false);
    }
    // What git leaves in place of a large file that was not fetched.
    expect(
      isLfsPointer(
        "version https://git-lfs.github.com/spec/v1\noid sha256:4d7a2146\nsize 480000000\n",
      ),
    ).toBe(true);
    expect(isLfsPointer("%PDF-1.7")).toBe(false);
  });
});

describe("the check of a desk's records (ADR-0117)", () => {
  it("finds no record where there is no index, and nothing wrong with records that read", async () => {
    expect(await checkRecords(desk({}))).toEqual({
      found: false,
      problems: [],
      notes: [],
      collections: [],
    });
    expect(await checkRecords(desk({ "README.md": "# The records\n" }))).toMatchObject({
      found: false,
    });
    expect(await checkRecords(desk(WHOLE))).toEqual({
      found: true,
      problems: [],
      notes: [],
      collections: [{ key: "ad-creatives", items: 2, uses: 1, metricRows: 2 }],
    });
    // The uses and the figures are a collection's to leave out.
    const bare = {
      "index.json": { collections: [{ key: "documents", title: "Documents" }] },
      "documents/collection.json": { title: "Documents" },
      "documents/items.json": [{ id: "d1", title: "The plan", madeOn: "2026-11-15" }],
    };
    expect(await checkRecords(desk(bare))).toEqual({
      found: true,
      problems: [],
      notes: [],
      collections: [{ key: "documents", items: 1, uses: 0, metricRows: 0 }],
    });
  });

  it("says each problem with its file: what does not read, and what one file says that another does not hold", async () => {
    const found = await checkRecords(
      desk({
        ...WHOLE,
        "index.json": {
          collections: [
            { key: "ad-creatives", title: "Ad creatives" },
            { key: "decks", title: "Decks" },
            { key: "ad-creatives", title: "Again" },
          ],
        },
        "ad-creatives/collection.json": {
          ...COLLECTION,
          colour: "red",
          statuses: [...COLLECTION.statuses, { key: "used", label: "Used again" }],
          ratios: [
            { key: "cpc", label: "Spend per click", of: "spent", per: "clicks", as: "number" },
          ],
        },
        "ad-creatives/items.json": [
          { ...ITEMS[0], status: "paused", preview: "files/gone.png", madeon: "2026-11-03" },
          {
            ...ITEMS[1],
            id: "c-001",
            fields: { format: 916, seconds: "15", shot: "soon", brief: "docs", owner: "kim" },
          },
          {
            id: "c-003",
            title: "The cut that was never saved",
            madeOn: "2026-11-07",
            files: [{ label: "The cut", path: "files/c-003.mp4" }],
          },
        ],
        "ad-creatives/uses.json": [{ item: "c-009", on: "2026-11-06", where: "Feed" }],
        "ad-creatives/metrics.json": [
          { item: "c-009", on: "2026-11-06", values: { impressions: 10 } },
          { item: "c-001", on: "2026-11-06", values: { views: 10 } },
        ],
        // A folder that holds a collection's own file and is in no index is a collection left
        // out; any other folder is the desk's own shape, and none of this check's.
        "drafts/collection.json": { title: "Drafts" },
        "drafts/items.json": [],
        "reading-list/books.json": [{ title: "A book" }],
      }),
    );
    expect(found.found).toBe(true);
    expect(found.problems.map((one) => `${one.file}: ${one.problem}`)).toEqual([
      "records/index.json: names the collection ad-creatives twice",
      "records/index.json: leaves out the folder drafts, which holds a collection.json, so nothing of it is shown",
      "records/ad-creatives/collection.json: colour is no part of a collection",
      "records/ad-creatives/collection.json: names the status used twice",
      "records/ad-creatives/collection.json: the ratio cpc is worked out from spent, which is no metric of the collection",
      "records/ad-creatives/items.json: gives the id c-001 to more than one item",
      "records/ad-creatives/items.json: [0] (c-001) madeon is no part of an item",
      "records/ad-creatives/items.json: [0] (c-001) status paused is not one of the collection's: used, unused, used",
      "records/ad-creatives/items.json: [0] (c-001) preview files/gone.png is not there",
      "records/ad-creatives/items.json: [1] (c-001) fields.format is not text",
      "records/ad-creatives/items.json: [1] (c-001) fields.seconds is not a number",
      "records/ad-creatives/items.json: [1] (c-001) fields.shot is not a day, written as 2026-11-15",
      "records/ad-creatives/items.json: [1] (c-001) fields.brief is not an address that begins with https://",
      "records/ad-creatives/items.json: [1] (c-001) fields.owner is no field of the collection",
      "records/ad-creatives/items.json: [2] (c-003) file files/c-003.mp4 is not there",
      "records/ad-creatives/uses.json: [0] names the item c-009, which is not there",
      "records/ad-creatives/metrics.json: [0] names the item c-009, which is not there",
      "records/ad-creatives/metrics.json: [1] values.views is no metric of the collection",
      "records/decks/collection.json: is not there",
    ]);
    // What still reads is counted, so that one wrong line does not hide the rest.
    expect(found.collections).toEqual([{ key: "ad-creatives", items: 3, uses: 1, metricRows: 2 }]);
  });

  it("says a file that is no JSON or not in the format, and goes on with the others", async () => {
    const found = await checkRecords(
      desk({
        ...WHOLE,
        "ad-creatives/uses.json": "[ not json",
        "ad-creatives/metrics.json": [{ item: "c-001", on: "yesterday", values: {} }],
      }),
    );
    expect(found.problems).toEqual([
      { file: "records/ad-creatives/uses.json", problem: "is not JSON" },
      {
        file: "records/ad-creatives/metrics.json",
        problem: "[0].on is a day, written as 2026-11-15",
      },
    ]);
    expect(found.collections).toEqual([{ key: "ad-creatives", items: 2, uses: 0, metricRows: 0 }]);
    // An index that does not read ends the check there: nothing else can be found.
    expect(await checkRecords(desk({ ...WHOLE, "index.json": { collections: "none" } }))).toEqual({
      found: true,
      problems: [{ file: "records/index.json", problem: "collections is not a list" }],
      notes: [],
      collections: [],
    });
  });

  it("notes a file that is a git LFS pointer, not fetched here, and finds nothing wrong with it", async () => {
    const found = await checkRecords(
      desk({ ...WHOLE, "ad-creatives/files/c-001.mp4": 133 }, ["ad-creatives/files/c-001.mp4"]),
    );
    expect(found.problems).toEqual([]);
    expect(found.notes).toEqual([
      {
        file: "records/ad-creatives/items.json",
        problem:
          "[0] (c-001) file files/c-001.mp4 is a git LFS pointer, not fetched on this machine: git lfs pull fetches it",
      },
    ]);
    // A file of any size that is there is looked into only where it is small enough to be one.
    let asked = 0;
    const files = desk(WHOLE);
    await checkRecords({
      ...files,
      pointer: async () => {
        asked += 1;
        return false;
      },
    });
    expect(asked).toBe(0);
  });

  it("notes a use or a row of figures dated before its item was made, and finds nothing wrong with the record", async () => {
    // c-001 was made on 2026-11-03: a use the day before is most likely a day written wrong,
    // and may be a thing used before it was recorded. A note, since only the member knows.
    const found = await checkRecords(
      desk({
        ...WHOLE,
        "ad-creatives/uses.json": [
          { item: "c-001", on: "2026-11-02", where: "The teaser" },
          { item: "c-001", on: "2026-11-03", where: "The day it was made" },
        ],
        "ad-creatives/metrics.json": [
          { item: "c-001", on: "2026-10-31", values: { impressions: 10 } },
          { item: "c-001", on: "2026-11-06", values: { impressions: 1200 } },
        ],
      }),
    );
    expect(found.problems).toEqual([]);
    expect(found.notes).toEqual([
      {
        file: "records/ad-creatives/uses.json",
        problem: "[0] is dated 2026-11-02, before its item c-001 was made (2026-11-03)",
      },
      {
        file: "records/ad-creatives/metrics.json",
        problem: "[0] is dated 2026-10-31, before its item c-001 was made (2026-11-03)",
      },
    ]);
    expect(found.collections).toEqual([{ key: "ad-creatives", items: 2, uses: 2, metricRows: 2 }]);
    // A use of an item that is not there is the problem it was, and no note beside it.
    const stray = await checkRecords(
      desk({
        ...WHOLE,
        "ad-creatives/uses.json": [{ item: "c-404", on: "2020-01-01", where: "Nowhere" }],
      }),
    );
    expect(stray.notes).toEqual([]);
    expect(stray.problems).toHaveLength(1);
    // Notes are bounded as problems are: the first of them, and how many more there are.
    const early = Array.from({ length: 300 }, () => ({
      item: "c-001",
      on: "2026-01-01",
      values: { impressions: 1 },
    }));
    const many = await checkRecords(desk({ ...WHOLE, "ad-creatives/metrics.json": early }));
    expect(many.problems).toEqual([]);
    expect(many.notes).toHaveLength(201);
    expect(many.notes.at(-1)).toEqual({ file: "records", problem: "and 100 more notes" });
  });

  it("notes an item with no status where the collection names some, since which it is in is what the member keeps", async () => {
    const found = await checkRecords(
      desk({
        ...WHOLE,
        "ad-creatives/items.json": [
          ITEMS[0],
          { id: "c-002", title: "Evening commute, 15 seconds", madeOn: "2026-11-05" },
        ],
      }),
    );
    expect(found.problems).toEqual([]);
    expect(found.notes).toEqual([
      {
        file: "records/ad-creatives/items.json",
        problem: "[1] (c-002) carries no status, where the collection names some: used, unused",
      },
    ]);
    // A collection that names none asks for none.
    const bare = await checkRecords(
      desk({
        "index.json": { collections: [{ key: "documents", title: "Documents" }] },
        "documents/collection.json": { title: "Documents" },
        "documents/items.json": [{ id: "d1", title: "The plan", madeOn: "2026-11-15" }],
      }),
    );
    expect(bare.notes).toEqual([]);
  });

  it("reads the collections a desk keeps, and leaves what else is under records/ to the desk (ADR-0122)", async () => {
    // A desk keeps what its member asks for, in the shape that fits it: a folder of its own
    // shape is no collection, and nothing is wrong with it.
    const open = {
      "README.md": "# What I keep\n",
      "reading-list/README.md": "# The books I read\n",
      "reading-list/books.json": [{ id: "b-1", title: "A book", readOn: "2026-11-15" }],
      "reading-list/files/cover.png": 48_000,
    };
    expect(await checkRecords(desk(open))).toEqual({
      found: false,
      problems: [],
      notes: [],
      collections: [],
    });
    // Beside collections it is left alone the same way.
    expect(await checkRecords(desk({ ...WHOLE, ...open }))).toEqual({
      found: true,
      problems: [],
      notes: [],
      collections: [{ key: "ad-creatives", items: 2, uses: 1, metricRows: 2 }],
    });
    // A collection's own file with no index to name it is a collection nobody would be shown.
    const lost = await checkRecords(
      desk({
        "ad-creatives/collection.json": COLLECTION,
        "ad-creatives/items.json": ITEMS,
        "reading-list/books.json": [],
      }),
    );
    expect(lost).toEqual({
      found: true,
      problems: [
        {
          file: "records/index.json",
          problem:
            "is not there, and the folder ad-creatives holds a collection.json: nothing of it is shown until the index names it",
        },
      ],
      notes: [],
      collections: [],
    });
  });

  it("reads no JSON file over its bound, and stops saying problems where there are too many to read", async () => {
    let read = 0;
    const files = desk({ ...WHOLE, "ad-creatives/items.json": MAX_RECORD_FILE_BYTES + 1 });
    const counted: RecordsFiles = {
      ...files,
      read: async (path) => {
        read += path === "ad-creatives/items.json" ? 1 : 0;
        return files.read(path);
      },
    };
    const large = await checkRecords(counted);
    expect(large.problems).toEqual([
      {
        file: "records/ad-creatives/items.json",
        problem: `holds ${MAX_RECORD_FILE_BYTES + 1} bytes, over the ${MAX_RECORD_FILE_BYTES} a file of the records may`,
      },
    ]);
    expect(read).toBe(0);
    const strays = Array.from({ length: 300 }, (_, n) => ({
      item: `gone-${n}`,
      on: "2026-11-06",
      where: "Feed",
    }));
    const many = await checkRecords(desk({ ...WHOLE, "ad-creatives/uses.json": strays }));
    expect(many.problems).toHaveLength(201);
    expect(many.problems.at(-1)).toEqual({ file: "records", problem: "and 100 more problems" });
  });
});

describe("the collections' page of the skill keeping-a-desk (ADR-0122)", () => {
  // The form of a desk's collections is said to an agent in one page of the console's own
  // skill, and no longer written into every desk. The page is held to the schemas here: its
  // examples read by them and pass the check, and it says the bounds they hold.
  const PAGE = readFileSync(
    fileURLToPath(new URL("../../../skills/keeping-a-desk/collections.md", import.meta.url)),
    "utf8",
  ).replaceAll("\r\n", "\n");
  /** The JSON the page gives as examples, in the order it gives them. */
  const examples = [...PAGE.matchAll(/```json\n([\s\S]*?)\n```/g)].map((found) => found[1] ?? "");

  it("gives one example of each file, and each reads by the format's own schema", () => {
    expect(examples).toHaveLength(5);
    const [index, collection, items, uses, metrics] = examples;
    expect(readRecords(recordsIndexSchema, index ?? "").ok).toBe(true);
    expect(readRecords(recordsCollectionSchema, collection ?? "").ok).toBe(true);
    expect(readRecords(recordsItemsSchema, items ?? "").ok).toBe(true);
    expect(readRecords(recordsUsesSchema, uses ?? "").ok).toBe(true);
    expect(readRecords(recordsMetricsSchema, metrics ?? "").ok).toBe(true);
  });

  it("gives examples that pass the check together, as a desk that copied them would", async () => {
    const [index, collection, items, uses, metrics] = examples;
    const found = await checkRecords(
      desk({
        "index.json": index ?? "",
        "ad-creatives/collection.json": collection ?? "",
        "ad-creatives/items.json": items ?? "",
        "ad-creatives/uses.json": uses ?? "",
        "ad-creatives/metrics.json": metrics ?? "",
        "ad-creatives/files/c-001.png": 48_000,
        "ad-creatives/files/c-001.mp4": 480_000_000,
      }),
    );
    expect(found).toEqual({
      found: true,
      problems: [],
      notes: [],
      collections: [{ key: "ad-creatives", items: 1, uses: 1, metricRows: 1 }],
    });
  });

  it("says the bounds and the words the schemas hold, the check, where large files go and what never goes in", () => {
    const count = (value: number): string => value.toLocaleString("en-US");
    expect(PAGE).toContain(
      `At most ${count(MAX_RECORD_COLLECTIONS)} collections; in a collection ${count(MAX_RECORD_ITEMS)} items, ${count(MAX_RECORD_USES)} uses and ${count(MAX_RECORD_METRIC_ROWS)} rows of figures; ${MAX_RECORD_KEY_LENGTH} characters in a key or an id, ${MAX_RECORD_LINE_LENGTH} in a title, a label or \`where\`, ${count(MAX_RECORD_TEXT_LENGTH)} in a description, a note or a field that is text; ${MAX_RECORD_FILE_BYTES / (1024 * 1024)} MiB in a JSON file.`,
    );
    const words = (values: readonly string[]): string =>
      values
        .map((value) => `\`${value}\``)
        .join(", ")
        .replace(/, ([^,]*)$/, " or $1");
    expect(PAGE).toContain(`A field's \`kind\` is ${words(RECORD_FIELD_KINDS)}.`);
    expect(PAGE).toContain(`A metric's \`unit\` is ${words(RECORD_METRIC_UNITS)}.`);
    expect(PAGE).toContain(`shown \`as\` ${words(RECORD_RATIO_FORMS)}`);
    expect(PAGE).toContain(
      `\`preview\` is a picture (${RECORD_PREVIEW_KINDS.map((kind) => kind.slice(1)).join(", ")}).`,
    );
    expect(PAGE).toContain("run `console desk check` in the desk");
    expect(PAGE).toContain("A large file goes in with git LFS");
    expect(PAGE).toContain("A secret: a token, a key, a password.");
    // What fresh agents left out with the example before them: a status on every item, a status
    // for every state, and a ratio for a rate.
    expect(PAGE).toContain(
      "`status` is one of the collection's, and where the collection has statuses every item carries one.",
    );
    expect(PAGE).toContain("Each state an item can be in is a status, the one it begins in too.");
    expect(PAGE).toContain("a rate that is no ratio is shown nowhere.");
    // It is one shape a desk may take, and says so before anything of the shape.
    expect(PAGE).toContain("It is not the shape of a desk");
    // A page an agent reads whole before its first collection.
    expect(PAGE.length).toBeLessThan(5200);
  });
});
