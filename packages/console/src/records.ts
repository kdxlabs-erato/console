import * as z from "zod/mini";
import { hasForbiddenCodePoint } from "./text.js";

// A desk's records (ADR-0117, docs/specs/records.md): what its member made and what became of
// it, as plain JSON files under `records/` that an agent writes with its file tools. The format
// is here, as schemas, for whatever reads the files: the dashboard's pages, which parse with
// them, and `console desk check`, which says every problem of a desk's records in words. Nothing
// here reads a file itself or knows the command line: a browser's page imports this module as it
// is, and whoever checks hands it the files.

/** The folder of a desk its records are kept in. */
export const RECORDS_DIR = "records";
/** The file that lists the collections, in `records/`. */
export const RECORDS_INDEX_FILE = "index.json";
/** The files of a collection, in `records/<key>/`. */
export const RECORDS_COLLECTION_FILE = "collection.json";
export const RECORDS_ITEMS_FILE = "items.json";
export const RECORDS_USES_FILE = "uses.json";
export const RECORDS_METRICS_FILE = "metrics.json";
/** The folder of a collection its previews are kept in. */
export const RECORDS_FILES_DIR = "files";

/** How many collections a desk keeps. */
export const MAX_RECORD_COLLECTIONS = 100;
/** How many items, uses and rows of figures a collection keeps. */
export const MAX_RECORD_ITEMS = 5000;
export const MAX_RECORD_USES = 20_000;
export const MAX_RECORD_METRIC_ROWS = 50_000;
/** How long a key or an item's id is. */
export const MAX_RECORD_KEY_LENGTH = 64;
/** How long a line is: a title, a label, where an item was used. */
export const MAX_RECORD_LINE_LENGTH = 200;
/** How long a text is: a description, a note, a field that is text. */
export const MAX_RECORD_TEXT_LENGTH = 2000;
/** How long an address or a preview's path is. */
export const MAX_RECORD_URL_LENGTH = 2048;
export const MAX_RECORD_PATH_LENGTH = 300;
/** How many statuses, fields, metrics and ratios a collection names, and links an item carries. */
export const MAX_RECORD_STATUSES = 20;
export const MAX_RECORD_FIELDS = 30;
export const MAX_RECORD_METRICS = 30;
export const MAX_RECORD_RATIOS = 30;
export const MAX_RECORD_LINKS = 20;
export const MAX_RECORD_ITEM_FILES = 50;
/**
 * How large a JSON file of the records is, in bytes: what the pages read whole. A file under
 * `files/` has no bound: a desk keeps what was made, of any size.
 */
export const MAX_RECORD_FILE_BYTES = 8 * 1024 * 1024;

/** The kinds of picture a preview is, by its extension. */
export const RECORD_PREVIEW_KINDS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".svg",
] as const;
/** What a field of an item holds. */
export const RECORD_FIELD_KINDS = ["text", "number", "day", "link"] as const;
/** What a metric counts in. */
export const RECORD_METRIC_UNITS = ["count", "currency", "percent", "seconds"] as const;
/** How a ratio of two metrics is shown. */
export const RECORD_RATIO_FORMS = ["percent", "number"] as const;

/** Whether a text is a day of the calendar, written as `2026-11-15`. */
export function isRecordDay(value: string): boolean {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (found === null) {
    return false;
  }
  const [year, month, day] = [Number(found[1]), Number(found[2]), Number(found[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Whether a text is an address that begins with `https://`, and nothing a page could not open as one. */
export function isRecordLink(value: string): boolean {
  return (
    value.startsWith("https://") &&
    !/\s/.test(value) &&
    !hasForbiddenCodePoint(value) &&
    URL.canParse(value)
  );
}

/** What no part of a file's path holds: what a file system or an address reads as more than a name. */
const NOT_IN_A_NAME = /[\\/:*?"<>|]/;

/**
 * Whether a text is the path of a file of a collection: under `files/`, each part a name that
 * begins with no full stop, so that none is `..` or a hidden file, ends with neither a full
 * stop nor a space, and holds nothing a file system or an address reads as more than a name.
 */
export function isRecordFilePath(value: string): boolean {
  const parts = value.split("/");
  return (
    parts[0] === RECORDS_FILES_DIR &&
    parts.length >= 2 &&
    parts.every(
      (part) =>
        part.length > 0 &&
        !part.startsWith(".") &&
        !part.endsWith(".") &&
        part.trim() === part &&
        !NOT_IN_A_NAME.test(part) &&
        !hasForbiddenCodePoint(part),
    )
  );
}

/** Whether a text is the path of a preview: a file of the collection that is a picture, by its extension. */
export function isRecordPreviewPath(value: string): boolean {
  const dot = value.lastIndexOf(".");
  return (
    isRecordFilePath(value) &&
    dot > 0 &&
    (RECORD_PREVIEW_KINDS as readonly string[]).includes(value.slice(dot).toLowerCase())
  );
}

/**
 * Whether what a file begins with is a git LFS pointer: the few lines git leaves in place of a
 * large file that was not fetched on this machine.
 */
export function isLfsPointer(head: string): boolean {
  return head.startsWith("version https://git-lfs.github.com/spec/v1\n");
}
/** How large a git LFS pointer is at the most, in bytes: a file over it is no pointer, and need not be looked into. */
export const MAX_LFS_POINTER_BYTES = 1024;

/** A key, of a collection, a status, a field or a metric: lowercase letters, digits and hyphens. */
export const RECORD_KEY = /^[a-z0-9][a-z0-9-]*$/;
/** An item's id: letters, digits and hyphens. */
export const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

const key = z
  .string()
  .check(
    z.minLength(1),
    z.maxLength(MAX_RECORD_KEY_LENGTH),
    z.regex(RECORD_KEY, "is lowercase letters, digits and hyphens"),
  );
const itemId = z
  .string()
  .check(
    z.minLength(1),
    z.maxLength(MAX_RECORD_KEY_LENGTH),
    z.regex(RECORD_ID, "is letters, digits and hyphens"),
  );
const line = z.string().check(
  z.minLength(1),
  z.maxLength(MAX_RECORD_LINE_LENGTH),
  z.refine((value) => !hasForbiddenCodePoint(value), "is one line, with no control character"),
);
const text = z.string().check(
  z.maxLength(MAX_RECORD_TEXT_LENGTH),
  z.refine((value) => !hasForbiddenCodePoint(value, true), "holds a control character"),
);
const day = z.string().check(z.refine(isRecordDay, "is a day, written as 2026-11-15"));
const link = z
  .string()
  .check(
    z.maxLength(MAX_RECORD_URL_LENGTH),
    z.refine(isRecordLink, "is an address that begins with https://"),
  );
const preview = z
  .string()
  .check(
    z.maxLength(MAX_RECORD_PATH_LENGTH),
    z.refine(
      isRecordPreviewPath,
      `is a picture under files/, as files/name.png (${RECORD_PREVIEW_KINDS.map((kind) => kind.slice(1)).join(", ")})`,
    ),
  );
const filePath = z
  .string()
  .check(
    z.maxLength(MAX_RECORD_PATH_LENGTH),
    z.refine(isRecordFilePath, "is a file under files/, as files/name.mp4"),
  );

/** `records/index.json`: the collections of a desk, each with the key its folder is called by. */
export const recordsIndexSchema = z.object({
  collections: z.array(z.object({ key, title: line })).check(z.maxLength(MAX_RECORD_COLLECTIONS)),
});
export type RecordsIndex = z.infer<typeof recordsIndexSchema>;

/** A word an item's `status` may be, with what people read for it. */
export const recordsStatusSchema = z.object({ key, label: line });
/** Something every item of a collection says beside its title. */
export const recordsFieldSchema = z.object({ key, label: line, kind: z.enum(RECORD_FIELD_KINDS) });
/** A figure the items of a collection are measured in, by day; a currency by its three letters, where it is one. */
export const recordsMetricSchema = z.object({
  key,
  label: line,
  unit: z.enum(RECORD_METRIC_UNITS),
  currency: z.optional(z.string().check(z.regex(/^[A-Z]{3}$/, "is three capital letters, as KRW"))),
});
/** A figure worked out from the totals of two metrics: `of` for each `per`. */
export const recordsRatioSchema = z.object({
  key,
  label: line,
  of: key,
  per: key,
  as: z.enum(RECORD_RATIO_FORMS),
});

/** `records/<key>/collection.json`: what a collection is, and how its items are read. */
export const recordsCollectionSchema = z.object({
  title: line,
  description: z.optional(text),
  statuses: z.optional(z.array(recordsStatusSchema).check(z.maxLength(MAX_RECORD_STATUSES))),
  fields: z.optional(z.array(recordsFieldSchema).check(z.maxLength(MAX_RECORD_FIELDS))),
  metrics: z.optional(z.array(recordsMetricSchema).check(z.maxLength(MAX_RECORD_METRICS))),
  ratios: z.optional(z.array(recordsRatioSchema).check(z.maxLength(MAX_RECORD_RATIOS))),
});
export type RecordsCollection = z.infer<typeof recordsCollectionSchema>;

/** Something that was made: one entry of `records/<key>/items.json`. */
export const recordsItemSchema = z.object({
  /** What the item is called by in the uses and the figures; never changed. */
  id: itemId,
  title: line,
  /** The day it was made. */
  madeOn: day,
  /** One of the collection's statuses, where it names any. */
  status: z.optional(key),
  /** A picture of it, under the collection's `files/`. */
  preview: z.optional(preview),
  /** The files themselves, under the collection's `files/`: what was made, of any kind and size. */
  files: z.optional(
    z.array(z.object({ label: line, path: filePath })).check(z.maxLength(MAX_RECORD_ITEM_FILES)),
  ),
  /** Where the thing itself is. */
  links: z.optional(
    z.array(z.object({ label: line, url: link })).check(z.maxLength(MAX_RECORD_LINKS)),
  ),
  /** The task of the board it came from. */
  task: z.optional(z.object({ project: key, number: z.int().check(z.positive()) })),
  /** What it says for each field of the collection: text, a number, a day or an address. */
  fields: z.optional(
    z.record(
      z.string(),
      z.union([z.string().check(z.maxLength(MAX_RECORD_TEXT_LENGTH)), z.number()]),
    ),
  ),
  note: z.optional(text),
});
export type RecordsItem = z.infer<typeof recordsItemSchema>;
export const recordsItemsSchema = z.array(recordsItemSchema).check(z.maxLength(MAX_RECORD_ITEMS));

/** Where an item was used: one entry of `records/<key>/uses.json`. */
export const recordsUseSchema = z.object({
  item: itemId,
  on: day,
  /** The campaign, the channel, the page. */
  where: line,
  note: z.optional(text),
});
export type RecordsUse = z.infer<typeof recordsUseSchema>;
export const recordsUsesSchema = z.array(recordsUseSchema).check(z.maxLength(MAX_RECORD_USES));

/** How an item did on one day: one entry of `records/<key>/metrics.json`. */
export const recordsMetricRowSchema = z.object({
  item: itemId,
  on: day,
  /** A number for each metric of the collection the day has a figure for. */
  values: z.record(z.string(), z.number()),
});
export type RecordsMetricRow = z.infer<typeof recordsMetricRowSchema>;
export const recordsMetricsSchema = z
  .array(recordsMetricRowSchema)
  .check(z.maxLength(MAX_RECORD_METRIC_ROWS));

/** An issue in words: the mini build of zod says "Invalid input" for its own checks, so the kind is spelled out here. */
function wordsOf(issue: z.core.$ZodIssue, given: unknown): string {
  switch (issue.code) {
    case "invalid_type":
      return given === undefined
        ? "is missing"
        : `is not ${issue.expected === "array" ? "a list" : issue.expected === "object" ? "an object" : `a ${issue.expected}`}`;
    case "too_big":
      return issue.origin === "array"
        ? `holds more than ${issue.maximum}`
        : `is longer than ${issue.maximum} characters`;
    case "too_small":
      return issue.origin === "string" ? "is empty" : `is under ${issue.minimum}`;
    case "invalid_value":
      return `is not one of ${issue.values.map(String).join(", ")}`;
    case "invalid_union":
      return "is neither text nor a number";
    default:
      return issue.message === "Invalid input" ? "is not what it should be" : issue.message;
  }
}

/** What a file holds where an issue is: nothing where the file says nothing there. */
function givenAt(json: unknown, path: readonly PropertyKey[]): unknown {
  let value = json;
  for (const part of path) {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    value = (value as Record<PropertyKey, unknown>)[part];
  }
  return value;
}

/** Where in a file an issue is, as a person would write it: `[3].madeOn`. */
function placeOf(path: readonly PropertyKey[]): string {
  return path
    .map((part, index) =>
      typeof part === "number" ? `[${part}]` : `${index === 0 ? "" : "."}${String(part)}`,
    )
    .join("");
}

export type RecordsRead<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly string[] };

/** How many problems of one file are said: the first ones tell what is wrong with it. */
const MAX_PROBLEMS_PER_FILE = 20;
/** How many problems of a desk's records are said in all. */
const MAX_PROBLEMS = 200;

/**
 * A file of the records as one of the format's schemas reads it, from its text: the value, or
 * every problem with it in words, each with where in the file it is.
 */
export function readRecords<T>(schema: z.ZodMiniType<T>, content: string): RecordsRead<T> {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false, problems: ["is not JSON"] };
  }
  const result = schema.safeParse(json);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const problems = result.error.issues.map((issue) => {
    const place = placeOf(issue.path);
    const words = wordsOf(issue, givenAt(json, issue.path));
    return place.length === 0 ? words : `${place} ${words}`;
  });
  return {
    ok: false,
    problems:
      problems.length > MAX_PROBLEMS_PER_FILE
        ? [
            ...problems.slice(0, MAX_PROBLEMS_PER_FILE),
            `and ${problems.length - MAX_PROBLEMS_PER_FILE} more of the kind`,
          ]
        : problems,
  };
}

/** The files of a desk's `records/`, as whoever checks them hands them over: paths with forward slashes, under `records/`. */
export interface RecordsFiles {
  /** A file as text; nothing where there is none. */
  read(path: string): Promise<string | undefined>;
  /** How many bytes a file holds; nothing where it is no file. */
  size(path: string): Promise<number | undefined>;
  /** Whether a file is a git LFS pointer, not fetched here; left out, none is taken for one. */
  pointer?(path: string): Promise<boolean>;
  /** The names of the folders in a folder; nothing where it is no folder, or they cannot be listed. */
  folders?(path: string): Promise<readonly string[] | undefined>;
}

/** Something wrong with a desk's records: the file, and what is wrong with it. */
export interface RecordsProblem {
  /** The file, from the desk: `records/ad-creatives/items.json`. */
  readonly file: string;
  readonly problem: string;
}

/** What a check of a desk's records found. */
export interface RecordsCheck {
  /** Whether the desk keeps any record: `records/index.json` is there. */
  readonly found: boolean;
  readonly problems: readonly RecordsProblem[];
  /** What is worth knowing and wrong with nothing: a file that is a git LFS pointer, not fetched here. */
  readonly notes: readonly RecordsProblem[];
  /** The collections that read, each with how much it holds. */
  readonly collections: readonly {
    readonly key: string;
    readonly items: number;
    readonly uses: number;
    readonly metricRows: number;
  }[];
}

const ITEM_KEYS = [
  "id",
  "title",
  "madeOn",
  "status",
  "preview",
  "files",
  "links",
  "task",
  "fields",
  "note",
];
const COLLECTION_KEYS = ["title", "description", "statuses", "fields", "metrics", "ratios"];

/** The keys of an object the format does not name: a field spelled wrong is otherwise read as left out. */
function strangers(value: unknown, known: readonly string[]): string[] {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.keys(value).filter((name) => !known.includes(name))
    : [];
}

/** The keys given twice in a list of things that are each called by one. */
function twice(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const again = new Set<string>();
  for (const one of keys) {
    if (seen.has(one)) {
      again.add(one);
    }
    seen.add(one);
  }
  return [...again];
}

/**
 * Reads a desk's records whole and says everything that is wrong with them (ADR-0117): a file
 * that is no JSON or not in the format, a key or an id given twice, a status, a field or a
 * metric the collection does not name, a use or a figure of an item that is not there, a
 * preview or a file that is not there, a JSON file over its bound, a collection the index
 * leaves out. What else a desk keeps under `records/`, in a shape of its own, is not read. A file that is a git LFS pointer is a note, since nothing is wrong with the record, and
 * so is a use or a row of figures dated before its item was made. What
 * reads right is counted, so that the command can say how much a desk keeps.
 */
export async function checkRecords(files: RecordsFiles): Promise<RecordsCheck> {
  const problems: RecordsProblem[] = [];
  const notes: RecordsProblem[] = [];
  let unsaid = 0;
  const say = (file: string, problem: string): void => {
    if (problems.length < MAX_PROBLEMS) {
      problems.push({ file: `${RECORDS_DIR}/${file}`, problem });
    } else {
      unsaid += 1;
    }
  };
  /** The problems as they are answered: the first of them, and how many more there are. */
  const said = (): RecordsProblem[] =>
    unsaid === 0
      ? problems
      : [...problems, { file: RECORDS_DIR, problem: `and ${unsaid} more problems` }];
  let unnoted = 0;
  /** What is worth knowing and wrong with nothing, bounded as the problems are. */
  const note = (file: string, words: string): void => {
    if (notes.length < MAX_PROBLEMS) {
      notes.push({ file: `${RECORDS_DIR}/${file}`, problem: words });
    } else {
      unnoted += 1;
    }
  };
  const noted = (): RecordsProblem[] =>
    unnoted === 0 ? notes : [...notes, { file: RECORDS_DIR, problem: `and ${unnoted} more notes` }];
  /** A JSON file within its bound, read by a schema; its problems said, and nothing where it does not read. */
  const read = async <T>(
    file: string,
    schema: z.ZodMiniType<T>,
    optional = false,
  ): Promise<{ readonly value: T; readonly json: unknown } | undefined> => {
    // The size first: a file over its bound is not read at all.
    const size = await files.size(file);
    if (size !== undefined && size > MAX_RECORD_FILE_BYTES) {
      say(file, `holds ${size} bytes, over the ${MAX_RECORD_FILE_BYTES} a file of the records may`);
      return undefined;
    }
    const content = size === undefined ? undefined : await files.read(file);
    if (content === undefined) {
      if (!optional) {
        say(file, "is not there");
      }
      return undefined;
    }
    const result = readRecords(schema, content);
    if (!result.ok) {
      for (const problem of result.problems) {
        say(file, problem);
      }
      return undefined;
    }
    return { value: result.value, json: JSON.parse(content) as unknown };
  };

  /**
   * The folders of `records/` that hold a collection's own file and are not among the keys
   * given: collections nobody would be shown. Any other folder is the desk's own shape
   * (ADR-0122), which this check neither reads nor finds anything wrong with.
   */
  const unlisted = async (keys: readonly string[]): Promise<string[]> => {
    const found: string[] = [];
    for (const folder of (await files.folders?.("")) ?? []) {
      if (
        !keys.includes(folder) &&
        !folder.startsWith(".") &&
        (await files.size(`${folder}/${RECORDS_COLLECTION_FILE}`)) !== undefined
      ) {
        found.push(folder);
      }
    }
    return found;
  };
  if ((await files.size(RECORDS_INDEX_FILE)) === undefined) {
    const lost = await unlisted([]);
    for (const folder of lost) {
      say(
        RECORDS_INDEX_FILE,
        `is not there, and the folder ${folder} holds a ${RECORDS_COLLECTION_FILE}: nothing of it is shown until the index names it`,
      );
    }
    return { found: lost.length > 0, problems: said(), notes: [], collections: [] };
  }
  const index = await read(RECORDS_INDEX_FILE, recordsIndexSchema);
  if (index === undefined) {
    return { found: true, problems: said(), notes: noted(), collections: [] };
  }
  const keys = index.value.collections.map((one) => one.key);
  for (const again of twice(keys)) {
    say(RECORDS_INDEX_FILE, `names the collection ${again} twice`);
  }
  for (const folder of await unlisted(keys)) {
    say(
      RECORDS_INDEX_FILE,
      `leaves out the folder ${folder}, which holds a ${RECORDS_COLLECTION_FILE}, so nothing of it is shown`,
    );
  }

  const collections: {
    key: string;
    items: number;
    uses: number;
    metricRows: number;
  }[] = [];
  for (const collectionKey of new Set(keys)) {
    const at = (name: string): string => `${collectionKey}/${name}`;
    const collection = await read(at(RECORDS_COLLECTION_FILE), recordsCollectionSchema);
    if (collection === undefined) {
      continue;
    }
    for (const stranger of strangers(collection.json, COLLECTION_KEYS)) {
      say(at(RECORDS_COLLECTION_FILE), `${stranger} is no part of a collection`);
    }
    const statuses = (collection.value.statuses ?? []).map((one) => one.key);
    const fields = new Map((collection.value.fields ?? []).map((one) => [one.key, one.kind]));
    const metrics = (collection.value.metrics ?? []).map((one) => one.key);
    for (const [what, given] of [
      ["status", statuses],
      ["field", (collection.value.fields ?? []).map((one) => one.key)],
      ["metric", metrics],
      ["ratio", (collection.value.ratios ?? []).map((one) => one.key)],
    ] as const) {
      for (const again of twice(given)) {
        say(at(RECORDS_COLLECTION_FILE), `names the ${what} ${again} twice`);
      }
    }
    for (const ratio of collection.value.ratios ?? []) {
      for (const side of [ratio.of, ratio.per]) {
        if (!metrics.includes(side)) {
          say(
            at(RECORDS_COLLECTION_FILE),
            `the ratio ${ratio.key} is worked out from ${side}, which is no metric of the collection`,
          );
        }
      }
    }

    const items = await read(at(RECORDS_ITEMS_FILE), recordsItemsSchema);
    const ids = new Set<string>();
    /** The day each item was made, by its id: what a use or a figure of it is not dated before. */
    const madeOn = new Map<string, string>();
    if (items !== undefined) {
      for (const again of twice(items.value.map((item) => item.id))) {
        say(at(RECORDS_ITEMS_FILE), `gives the id ${again} to more than one item`);
      }
      const raw = Array.isArray(items.json) ? items.json : [];
      for (const [position, item] of items.value.entries()) {
        const here = `[${position}] (${item.id})`;
        ids.add(item.id);
        if (!madeOn.has(item.id)) {
          madeOn.set(item.id, item.madeOn);
        }
        for (const stranger of strangers(raw[position], ITEM_KEYS)) {
          say(at(RECORDS_ITEMS_FILE), `${here} ${stranger} is no part of an item`);
        }
        if (item.status !== undefined && !statuses.includes(item.status)) {
          say(
            at(RECORDS_ITEMS_FILE),
            `${here} status ${item.status} is not one of the collection's${statuses.length === 0 ? ", which names none" : `: ${statuses.join(", ")}`}`,
          );
        }
        // Which state each item is in is what a collection with statuses keeps: one without is
        // noted, since the record still reads and only the member knows the state.
        if (item.status === undefined && statuses.length > 0) {
          note(
            at(RECORDS_ITEMS_FILE),
            `${here} carries no status, where the collection names some: ${[...new Set(statuses)].join(", ")}`,
          );
        }
        for (const [name, value] of Object.entries(item.fields ?? {})) {
          const kind = fields.get(name);
          const wrong =
            kind === undefined
              ? "is no field of the collection"
              : kind === "number"
                ? typeof value === "number" && Number.isFinite(value)
                  ? undefined
                  : "is not a number"
                : typeof value !== "string"
                  ? "is not text"
                  : kind === "day" && !isRecordDay(value)
                    ? "is not a day, written as 2026-11-15"
                    : kind === "link" && !isRecordLink(value)
                      ? "is not an address that begins with https://"
                      : undefined;
          if (wrong !== undefined) {
            say(at(RECORDS_ITEMS_FILE), `${here} fields.${name} ${wrong}`);
          }
        }
        const named = [
          ...(item.preview === undefined ? [] : [["preview", item.preview] as const]),
          ...(item.files ?? []).map((one) => ["file", one.path] as const),
        ];
        for (const [what, path] of named) {
          const size = await files.size(at(path));
          if (size === undefined) {
            say(at(RECORDS_ITEMS_FILE), `${here} ${what} ${path} is not there`);
          } else if (
            size <= MAX_LFS_POINTER_BYTES &&
            notes.length < MAX_PROBLEMS &&
            (await files.pointer?.(at(path))) === true
          ) {
            note(
              at(RECORDS_ITEMS_FILE),
              `${here} ${what} ${path} is a git LFS pointer, not fetched on this machine: git lfs pull fetches it`,
            );
          }
        }
      }
    }

    /**
     * A use or a row of figures dated before its item was made: most often a day written
     * wrong, and now and then a thing used before it was recorded, which only the member
     * knows. A note, so that it is seen and nothing is refused.
     */
    const early = (file: string, position: number, item: string, on: string): void => {
      const made = madeOn.get(item);
      if (made !== undefined && on < made) {
        note(at(file), `[${position}] is dated ${on}, before its item ${item} was made (${made})`);
      }
    };
    const uses = await read(at(RECORDS_USES_FILE), recordsUsesSchema, true);
    for (const [position, use] of (uses?.value ?? []).entries()) {
      if (items !== undefined && !ids.has(use.item)) {
        say(at(RECORDS_USES_FILE), `[${position}] names the item ${use.item}, which is not there`);
      }
      early(RECORDS_USES_FILE, position, use.item, use.on);
    }
    const rows = await read(at(RECORDS_METRICS_FILE), recordsMetricsSchema, true);
    for (const [position, row] of (rows?.value ?? []).entries()) {
      if (items !== undefined && !ids.has(row.item)) {
        say(
          at(RECORDS_METRICS_FILE),
          `[${position}] names the item ${row.item}, which is not there`,
        );
      }
      early(RECORDS_METRICS_FILE, position, row.item, row.on);
      for (const [name, value] of Object.entries(row.values)) {
        if (!metrics.includes(name)) {
          say(
            at(RECORDS_METRICS_FILE),
            `[${position}] values.${name} is no metric of the collection`,
          );
        } else if (!Number.isFinite(value)) {
          say(at(RECORDS_METRICS_FILE), `[${position}] values.${name} is not a number`);
        }
      }
    }
    if (items !== undefined) {
      collections.push({
        key: collectionKey,
        items: items.value.length,
        uses: uses?.value.length ?? 0,
        metricRows: rows?.value.length ?? 0,
      });
    }
  }
  return { found: true, problems: said(), notes: noted(), collections };
}
