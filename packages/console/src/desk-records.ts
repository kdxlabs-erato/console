import type * as z from "zod/mini";
import { addDays, isDay, weekOf } from "./dates.js";
import {
  MAX_RECORD_COLLECTIONS,
  MAX_RECORD_FILE_BYTES,
  MAX_RECORD_ITEMS,
  MAX_RECORD_METRIC_ROWS,
  MAX_RECORD_USES,
  RECORD_ID,
  RECORD_KEY,
  type RecordsCollection,
  type RecordsItem,
  type RecordsMetricRow,
  type RecordsUse,
  recordsCollectionSchema,
  recordsIndexSchema,
  recordsItemSchema,
  recordsMetricRowSchema,
  recordsUseSchema,
} from "./records.js";

// A desk's records as the desk's pages read them (ADR-0117): what the desk's member made and what
// became of it, kept as files under the desk's `records/` and served beside the pages at
// `/records/`. An agent wrote them, so every file is read as what an agent sends: fetched from
// the page's own origin and nowhere else, bounded in size, parsed with the format's schemas,
// and what does not parse is named and left out while the rest is shown. A link is taken only
// as https and a preview only as a path under the collection's `files/`. This module is the
// reading and the counting, with no React in it; the views are `components/desk-records.tsx`.

/** Where a desk's records are served, beside the pages' own files. */
export const RECORDS_BASE = "/records";
/** How many weeks a collection's results count back, this week among them. */
export const RECORD_WEEKS = 8;
/** How many items a collection's results name as those that did best. */
export const RECORD_BEST = 10;
/** The kinds of picture a preview may be, by the end of its name. */
export const RECORD_PREVIEW_KINDS = ["png", "jpg", "jpeg", "gif", "webp", "avif"] as const;

/** What reads the records: the page's own `fetch`, and where they are served. */
export interface RecordsReader {
  readonly fetch: (path: string, init?: RequestInit) => Promise<Response>;
  /** The path the records are served under; `RECORDS_BASE` where left out. */
  readonly base?: string | undefined;
}

/** What is wrong with one file of the records, said in a line where it is shown. */
export interface RecordProblem {
  /** The file, from the records' own folder: `ad-creatives/items.json`. */
  readonly file: string;
  /**
   * `unreadable`: the file could not be had; `too_large`: it is over what the pages read;
   * `not_json`: it is not JSON; `not_as_format`: it, or some of its entries, are not as the
   * format says.
   */
  readonly kind: "unreadable" | "too_large" | "not_json" | "not_as_format";
  /** Where in the file the first thing wrong is: `[3].madeOn`. */
  readonly at?: string | undefined;
  /** How many entries were left out, where the file is a list. */
  readonly left?: number | undefined;
}

type FileRead =
  | { readonly kind: "read"; readonly value: unknown }
  | { readonly kind: "missing" }
  | { readonly kind: "problem"; readonly problem: RecordProblem };

/** The text of an answer, as far as `max` bytes: nothing where it is longer. */
async function boundedText(response: Response, max: number): Promise<string | undefined> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) {
    return undefined;
  }
  const body = response.body;
  if (body === null) {
    const whole = await response.text();
    return whole.length > max ? undefined : whole;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    read += value.byteLength;
    if (read > max) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * One file of the records as JSON. A file that is not there is missing, and so is an answer
 * that is not JSON by its type: a server that serves no records answers its own page there.
 */
async function readFile(
  reader: RecordsReader,
  file: string,
  signal: AbortSignal | undefined,
): Promise<FileRead> {
  const problem = (kind: RecordProblem["kind"]): FileRead => ({
    kind: "problem",
    problem: { file, kind },
  });
  let response: Response;
  try {
    response = await reader.fetch(`${reader.base ?? RECORDS_BASE}/${file}`, {
      cache: "no-store",
      credentials: "same-origin",
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (failure) {
    if (signal?.aborted === true) {
      throw failure;
    }
    return problem("unreadable");
  }
  if (response.status === 404) {
    return { kind: "missing" };
  }
  if (!response.ok) {
    return problem("unreadable");
  }
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
    return { kind: "missing" };
  }
  const text = await boundedText(response, MAX_RECORD_FILE_BYTES);
  if (text === undefined) {
    return problem("too_large");
  }
  try {
    return { kind: "read", value: JSON.parse(text) as unknown };
  } catch {
    return problem("not_json");
  }
}

/** Where in a file something is wrong, as a path a person can find: `[3].madeOn`. */
function placeOf(path: readonly PropertyKey[]): string {
  return path
    .map((step, index) =>
      typeof step === "number" ? `[${step}]` : `${index === 0 ? "" : "."}${String(step)}`,
    )
    .join("");
}

/** One value parsed with a schema of the format, or where it is not as the format says. */
function parseOne<T extends z.ZodMiniType>(
  schema: T,
  value: unknown,
): { readonly value: z.infer<T> } | { readonly at: string } {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { value: parsed.data }
    : { at: placeOf(parsed.error.issues[0]?.path ?? []) };
}

/**
 * A list of the format read entry by entry: those that are as the format says, `max` at most,
 * and one problem for the rest, with where the first of them is wrong.
 */
function parseList<T extends z.ZodMiniType>(
  schema: T,
  value: unknown,
  max: number,
  file: string,
): { readonly entries: z.infer<T>[]; readonly problem: RecordProblem | undefined } {
  if (!Array.isArray(value)) {
    return { entries: [], problem: { file, kind: "not_as_format", at: "" } };
  }
  const entries: z.infer<T>[] = [];
  let left = 0;
  let at: string | undefined;
  for (const [index, entry] of value.slice(0, max).entries()) {
    const parsed = parseOne(schema, entry);
    if ("value" in parsed) {
      entries.push(parsed.value);
    } else {
      left += 1;
      at ??= `[${index}]${parsed.at.length === 0 || parsed.at.startsWith("[") ? "" : "."}${parsed.at}`;
    }
  }
  if (value.length > max) {
    left += value.length - max;
    at ??= `[${max}]`;
  }
  return {
    entries,
    problem: left === 0 ? undefined : { file, kind: "not_as_format", at, left },
  };
}

/** An item's status as a collection counts it: the status, and how many items have it. */
export interface StatusCount {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/** A collection as the list of collections shows it. */
export interface CollectionSummary {
  readonly key: string;
  readonly title: string;
  readonly description: string | undefined;
  /** How many items it holds. */
  readonly items: number;
  /** The items by status, in the collection's order; none where it names no statuses. */
  readonly statuses: readonly StatusCount[];
  /** The day its last item was made on, or nothing where it holds none. */
  readonly lastMadeOn: string | undefined;
}

/** The items of a collection by status: one count for each status the collection names. */
export function statusCounts(
  collection: Pick<RecordsCollection, "statuses"> | undefined,
  items: readonly RecordsItem[],
): readonly StatusCount[] {
  return (collection?.statuses ?? []).map((status) => ({
    key: status.key,
    label: status.label,
    count: items.filter((item) => item.status === status.key).length,
  }));
}

/** The latest day any of the items was made on. */
export function lastMadeOn(items: readonly RecordsItem[]): string | undefined {
  return items.reduce<string | undefined>(
    (latest, item) => (latest === undefined || item.madeOn > latest ? item.madeOn : latest),
    undefined,
  );
}

/** What a desk keeps, as the first view of its page reads it. */
export type RecordsOverview =
  /** No records are served here: the desk has none yet, or the server was not told of them. */
  | { readonly kind: "none" }
  | {
      readonly kind: "read";
      readonly collections: readonly CollectionSummary[];
      readonly problems: readonly RecordProblem[];
    };

/**
 * The collections of a desk with what each holds: the index, then each collection's own file
 * and its items, two requests a collection, `MAX_RECORD_COLLECTIONS` collections at most.
 */
export async function readDeskRecords(
  reader: RecordsReader,
  signal?: AbortSignal,
): Promise<RecordsOverview> {
  const index = await readFile(reader, "index.json", signal);
  if (index.kind === "missing") {
    return { kind: "none" };
  }
  if (index.kind === "problem") {
    return { kind: "read", collections: [], problems: [index.problem] };
  }
  const parsed = parseOne(recordsIndexSchema, index.value);
  if (!("value" in parsed)) {
    return {
      kind: "read",
      collections: [],
      problems: [{ file: "index.json", kind: "not_as_format", at: parsed.at }],
    };
  }
  const named = new Map(parsed.value.collections.map((one) => [one.key, one] as const));
  const read = await Promise.all(
    [...named.values()].slice(0, MAX_RECORD_COLLECTIONS).map(async (one) => {
      const records = await readCollection(reader, one.key, signal, { items: true });
      return {
        summary: {
          key: one.key,
          title: records.collection?.title ?? one.title,
          description: records.collection?.description,
          items: records.items.length,
          statuses: statusCounts(records.collection, records.items),
          lastMadeOn: lastMadeOn(records.items),
        } satisfies CollectionSummary,
        problems: records.problems,
      };
    }),
  );
  return {
    kind: "read",
    collections: read.map((one) => one.summary),
    problems: read.flatMap((one) => one.problems),
  };
}

/** One collection as its pages read it. */
export interface CollectionRecords {
  readonly key: string;
  /** What the collection is; nothing where its own file is missing or wrong. */
  readonly collection: RecordsCollection | undefined;
  /** What was made, the last made first. */
  readonly items: readonly RecordsItem[];
  /** Where an item was used, the last first; of items the collection holds. */
  readonly uses: readonly RecordsUse[];
  /** How an item did, by day; of items the collection holds. */
  readonly metrics: readonly RecordsMetricRow[];
  readonly problems: readonly RecordProblem[];
  /** Whether anything of the collection was there to read. */
  readonly found: boolean;
}

/**
 * One collection: its own file and its items, and its uses and its metrics unless `items`
 * alone is asked for. A file that is missing is nothing held; one that is wrong is named
 * among the problems and the rest is read all the same.
 */
export async function readCollection(
  reader: RecordsReader,
  key: string,
  signal?: AbortSignal,
  only: { readonly items?: boolean } = {},
): Promise<CollectionRecords> {
  if (!RECORD_KEY.test(key)) {
    return {
      key,
      collection: undefined,
      items: [],
      uses: [],
      metrics: [],
      problems: [],
      found: false,
    };
  }
  const missing: FileRead = { kind: "missing" };
  const [own, itemsFile, usesFile, metricsFile] = await Promise.all([
    readFile(reader, `${key}/collection.json`, signal),
    readFile(reader, `${key}/items.json`, signal),
    only.items === true ? missing : readFile(reader, `${key}/uses.json`, signal),
    only.items === true ? missing : readFile(reader, `${key}/metrics.json`, signal),
  ]);
  const problems: RecordProblem[] = [];
  let collection: RecordsCollection | undefined;
  if (own.kind === "problem") {
    problems.push(own.problem);
  } else if (own.kind === "read") {
    const parsed = parseOne(recordsCollectionSchema, own.value);
    if ("value" in parsed) {
      collection = parsed.value;
    } else {
      problems.push({ file: `${key}/collection.json`, kind: "not_as_format", at: parsed.at });
    }
  }
  const list = <T extends z.ZodMiniType>(
    file: FileRead,
    name: string,
    schema: T,
    max: number,
  ): z.infer<T>[] => {
    if (file.kind === "problem") {
      problems.push(file.problem);
      return [];
    }
    if (file.kind === "missing") {
      return [];
    }
    const parsed = parseList(schema, file.value, max, `${key}/${name}`);
    if (parsed.problem !== undefined) {
      problems.push(parsed.problem);
    }
    return parsed.entries;
  };
  // An id stands for one item: of two with the same, the first is the item.
  const seen = new Set<string>();
  const items = list(itemsFile, "items.json", recordsItemSchema, MAX_RECORD_ITEMS)
    .filter((item) => {
      const first = !seen.has(item.id);
      seen.add(item.id);
      return first;
    })
    .sort((a, b) => b.madeOn.localeCompare(a.madeOn) || a.title.localeCompare(b.title));
  const held = (entry: { readonly item: string }) => seen.has(entry.item);
  return {
    key,
    collection,
    items,
    uses: list(usesFile, "uses.json", recordsUseSchema, MAX_RECORD_USES)
      .filter(held)
      .sort((a, b) => b.on.localeCompare(a.on)),
    metrics: list(
      metricsFile,
      "metrics.json",
      recordsMetricRowSchema,
      MAX_RECORD_METRIC_ROWS,
    ).filter(held),
    problems,
    found: own.kind !== "missing" || itemsFile.kind !== "missing",
  };
}

/**
 * A file of a collection as a path under its `files/`, or nothing where it is not one: no step
 * up or out, no name that begins with a dot, nothing of an address about it. `files/` may lead
 * the path or be left out.
 */
export function filePath(path: string | undefined): string | undefined {
  if (path === undefined || path.includes("\\") || path.includes("\0")) {
    return undefined;
  }
  const steps = path.split("/");
  const under = steps[0] === "files" ? steps.slice(1) : steps;
  return under.length === 0 ||
    under.some((step) => step.length === 0 || step.startsWith(".") || /[?#%]/.test(step))
    ? undefined
    : `files/${under.join("/")}`;
}

/** Where a file of a collection is read from, on the page's own origin; nothing for what is no file of it. */
export function fileSrc(
  key: string,
  path: string | undefined,
  base: string = RECORDS_BASE,
): string | undefined {
  const under = filePath(path);
  return under === undefined || !RECORD_KEY.test(key)
    ? undefined
    : `${base}/${key}/${under.split("/").map(encodeURIComponent).join("/")}`;
}

/** A preview as a path under the collection's `files/`: a file of it that is a picture by the end of its name. */
export function previewPath(preview: string | undefined): string | undefined {
  const under = filePath(preview);
  const kind = /\.([A-Za-z0-9]+)$/.exec(under ?? "")?.[1]?.toLowerCase();
  return RECORD_PREVIEW_KINDS.some((one) => one === kind) ? under : undefined;
}

/** Where a preview is read from, on the page's own origin; nothing for what is no preview. */
export function previewSrc(
  key: string,
  preview: string | undefined,
  base: string = RECORDS_BASE,
): string | undefined {
  return fileSrc(key, previewPath(preview), base);
}

/** How a file of an item stands, as the server answered for it: what it is shown as. */
export type RecordFileState =
  /** Not asked yet. */
  | { readonly kind: "reading" }
  /** Shown in place, by the kind the server says it is. */
  | { readonly kind: "picture" | "video" | "sound" }
  /** A PDF: in a frame where the server's answer lets a page of its own origin frame it, else opened apart. */
  | { readonly kind: "pdf"; readonly framed: boolean }
  /** Anything else: handed over as a download. */
  | { readonly kind: "other" }
  /** Kept with git LFS and not fetched on this machine: only its pointer is here. */
  | { readonly kind: "not_fetched"; readonly words: string | undefined }
  /** The server would not give it, in its own words. */
  | { readonly kind: "refused"; readonly words: string | undefined }
  /** No file of the collection, or the request failed. */
  | { readonly kind: "unreadable" };

/** How many bytes of a file are read to tell what it is. */
const PROBE_BYTES = 256;
/** How many characters of the server's own words about a file are shown. */
export const RECORD_FILE_WORDS = 300;
/** What the pointer git LFS leaves in place of a file it has not fetched begins with. */
const LFS_POINTER = "version https://git-lfs.github.com/spec/";

/** The first bytes of an answer as text, and no more of it. */
async function headOf(response: Response, max: number): Promise<string> {
  const body = response.body;
  if (body === null) {
    return (await response.text()).slice(0, max);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  while (read < max) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value.subarray(0, max - read));
    read += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * How one file of an item stands: asked of the server for its first bytes alone, so that a
 * film is not read to learn that it is one. The kind is the one the server says; a refusal is
 * kept with the server's words; a file that is the pointer git LFS leaves is not fetched here.
 */
export async function probeFile(
  reader: RecordsReader,
  key: string,
  path: string,
  signal?: AbortSignal,
): Promise<RecordFileState> {
  const src = fileSrc(key, path, reader.base ?? RECORDS_BASE);
  if (src === undefined) {
    return { kind: "unreadable" };
  }
  let response: Response;
  try {
    response = await reader.fetch(src, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { range: `bytes=0-${PROBE_BYTES - 1}` },
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (failure) {
    if (signal?.aborted === true) {
      throw failure;
    }
    return { kind: "unreadable" };
  }
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  const head = await headOf(response, PROBE_BYTES).catch(() => "");
  const worded = /^text\/plain|json/.test(type) ? head.trim().slice(0, RECORD_FILE_WORDS) : "";
  const words = worded.length === 0 ? undefined : worded;
  if (head.startsWith(LFS_POINTER)) {
    return { kind: "not_fetched", words: undefined };
  }
  if (!response.ok) {
    // A server that knows the file for a pointer says so in its refusal.
    return /\blfs\b/i.test(worded)
      ? { kind: "not_fetched", words }
      : response.status === 404 && words === undefined
        ? { kind: "unreadable" }
        : { kind: "refused", words };
  }
  if (type.startsWith("image/")) {
    return { kind: "picture" };
  }
  if (type.startsWith("video/")) {
    return { kind: "video" };
  }
  if (type.startsWith("audio/")) {
    return { kind: "sound" };
  }
  if (type.startsWith("application/pdf")) {
    // A frame shows it only where its own answer lets a page of the same origin frame it.
    const policy = (response.headers.get("content-security-policy") ?? "").toLowerCase();
    const options = (response.headers.get("x-frame-options") ?? "").toLowerCase();
    return {
      kind: "pdf",
      framed: !/frame-ancestors[^;]*'none'/.test(policy) && options !== "deny",
    };
  }
  return { kind: "other" };
}

/** A link as a page may follow it: https, and nothing else. */
export function httpsLink(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === ""
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** What an item says for one of the collection's fields, as the field's kind has it read. */
export type FieldValue =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "day"; readonly day: string }
  | { readonly kind: "link"; readonly href: string };

/**
 * An item's fields in the collection's order, each as its kind has it read. A value that is
 * not of its field's kind is shown as the text it is: a link that is not https is words.
 */
export function fieldsOf(
  collection: Pick<RecordsCollection, "fields"> | undefined,
  item: Pick<RecordsItem, "fields">,
): readonly { readonly key: string; readonly label: string; readonly value: FieldValue }[] {
  return (collection?.fields ?? []).flatMap((field) => {
    const raw = item.fields?.[field.key];
    if (raw === undefined || raw === "") {
      return [];
    }
    const text: FieldValue = { kind: "text", text: String(raw) };
    const link = field.kind === "link" && typeof raw === "string" ? httpsLink(raw) : undefined;
    const value: FieldValue =
      field.kind === "number" && typeof raw === "number"
        ? { kind: "number", value: raw }
        : field.kind === "day" && typeof raw === "string" && isDay(raw)
          ? { kind: "day", day: raw }
          : link !== undefined
            ? { kind: "link", href: link }
            : text;
    return [{ key: field.key, label: field.label, value }];
  });
}

type Metric = NonNullable<RecordsCollection["metrics"]>[number];
type Ratio = NonNullable<RecordsCollection["ratios"]>[number];

/** One metric over some rows: their sum, or for a percentage their mean, since a sum of shares says nothing. */
function totalOf(metric: Metric, rows: readonly RecordsMetricRow[]): number | undefined {
  const values = rows.flatMap((row) => {
    const value = row.values[metric.key];
    return value === undefined ? [] : [value];
  });
  if (values.length === 0) {
    return undefined;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return metric.unit === "percent" ? sum / values.length : sum;
}

/** A ratio over some rows: the sum of one metric for each of the other's, or nothing where there is none of the other. */
function ratioOf(ratio: Ratio, rows: readonly RecordsMetricRow[]): number | undefined {
  const sum = (key: string) => rows.reduce((total, row) => total + (row.values[key] ?? 0), 0);
  const per = sum(ratio.per);
  return per === 0 ? undefined : sum(ratio.of) / per;
}

/** A metric's figure: what it is, and its total over the rows counted; nothing where no row has it. */
export interface MetricFigure {
  readonly key: string;
  readonly label: string;
  readonly unit: Metric["unit"];
  readonly total: number | undefined;
}

/** A ratio's figure: what it is, and its value; nothing where it cannot be worked out. */
export interface RatioFigure {
  readonly key: string;
  readonly label: string;
  readonly as: Ratio["as"];
  readonly value: number | undefined;
}

/** The figures of some rows: each of the collection's metrics and each of its ratios. */
export function figuresOfRows(
  collection: Pick<RecordsCollection, "metrics" | "ratios"> | undefined,
  rows: readonly RecordsMetricRow[],
): { readonly metrics: readonly MetricFigure[]; readonly ratios: readonly RatioFigure[] } {
  return {
    metrics: (collection?.metrics ?? []).map((metric) => ({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      total: totalOf(metric, rows),
    })),
    ratios: (collection?.ratios ?? []).map((ratio) => ({
      key: ratio.key,
      label: ratio.label,
      as: ratio.as,
      value: ratioOf(ratio, rows),
    })),
  };
}

/** How a collection did: its figures over everything, and by week over the last weeks. */
export interface CollectionResults {
  readonly metrics: readonly MetricFigure[];
  readonly ratios: readonly RatioFigure[];
  /** The weeks counted, the oldest first, each with the metrics' figures of its days. */
  readonly weeks: readonly {
    readonly start: string;
    readonly end: string;
    readonly metrics: readonly MetricFigure[];
  }[];
}

/** A collection's results from its rows: the whole, and `weeks` weeks back from the week of `today`. */
export function resultsOf(input: {
  readonly collection: Pick<RecordsCollection, "metrics" | "ratios"> | undefined;
  readonly rows: readonly RecordsMetricRow[];
  readonly today: string;
  /** The weekday a week begins on: 1 for Monday, 7 for Sunday. */
  readonly firstDay?: number | undefined;
  readonly weeks?: number | undefined;
}): CollectionResults {
  const count = Math.max(1, input.weeks ?? RECORD_WEEKS);
  const last = weekOf(input.today, input.firstDay ?? 1)[0] ?? input.today;
  const whole = figuresOfRows(input.collection, input.rows);
  return {
    ...whole,
    weeks: Array.from({ length: count }, (_, index) => {
      const start = addDays(last, (index - (count - 1)) * 7);
      const end = addDays(start, 6);
      return {
        start,
        end,
        metrics: figuresOfRows(
          input.collection,
          input.rows.filter((row) => row.on >= start && row.on <= end),
        ).metrics,
      };
    }),
  };
}

/** The items that did best by one metric: the most first, `limit` at most, those with no row of it left out. */
export function bestItems(input: {
  readonly collection: Pick<RecordsCollection, "metrics"> | undefined;
  readonly items: readonly RecordsItem[];
  readonly rows: readonly RecordsMetricRow[];
  /** The metric's key; the collection's first where it names none of its own. */
  readonly by: string | undefined;
  readonly limit?: number | undefined;
}): {
  readonly metric: Metric | undefined;
  readonly items: readonly { readonly item: RecordsItem; readonly total: number }[];
} {
  const metrics = input.collection?.metrics ?? [];
  const metric = metrics.find((one) => one.key === input.by) ?? metrics[0];
  if (metric === undefined) {
    return { metric: undefined, items: [] };
  }
  const byItem = new Map<string, RecordsMetricRow[]>();
  for (const row of input.rows) {
    const rows = byItem.get(row.item) ?? [];
    rows.push(row);
    byItem.set(row.item, rows);
  }
  return {
    metric,
    items: input.items
      .flatMap((item) => {
        const total = totalOf(metric, byItem.get(item.id) ?? []);
        return total === undefined ? [] : [{ item, total }];
      })
      .sort((a, b) => b.total - a.total || a.item.title.localeCompare(b.item.title))
      .slice(0, Math.max(1, input.limit ?? RECORD_BEST)),
  };
}

/** How one item did: its rows by day, the last first, and its figures over all of them. */
export function itemResults(
  collection: Pick<RecordsCollection, "metrics" | "ratios"> | undefined,
  rows: readonly RecordsMetricRow[],
  itemId: string,
): {
  readonly days: readonly RecordsMetricRow[];
  readonly metrics: readonly MetricFigure[];
  readonly ratios: readonly RatioFigure[];
} {
  const days = rows.filter((row) => row.item === itemId).sort((a, b) => b.on.localeCompare(a.on));
  return { days, ...figuresOfRows(collection, days) };
}

/** What the address of the records' view says is shown: a collection, an item of it, or its results. */
export interface RecordsAddress {
  readonly collection?: string | undefined;
  readonly item?: string | undefined;
  /** Whether the collection's results are shown in place of its items. */
  readonly results?: boolean | undefined;
  /** The status the items are narrowed to. */
  readonly status?: string | undefined;
  /** The metric the best items are ordered by. */
  readonly by?: string | undefined;
}

/** What a query says of the records' view: only keys and ids that could be ones. */
export function recordsAddressOf(search: string): RecordsAddress {
  const params = new URLSearchParams(search);
  const keyOf = (name: string) => {
    const value = params.get(name) ?? "";
    return RECORD_KEY.test(value) ? value : undefined;
  };
  const collection = keyOf("collection");
  if (collection === undefined) {
    return {};
  }
  const item = params.get("item") ?? "";
  if (RECORD_ID.test(item)) {
    return { collection, item };
  }
  return params.get("show") === "results"
    ? { collection, results: true, by: keyOf("by") }
    : { collection, status: keyOf("status") };
}

/** The query of a place in the records' view, to put after the page's own address. */
export function recordsQuery(address: RecordsAddress): string {
  const params = new URLSearchParams();
  if (address.collection !== undefined) {
    params.set("collection", address.collection);
    if (address.item !== undefined) {
      params.set("item", address.item);
    } else if (address.results === true) {
      params.set("show", "results");
      if (address.by !== undefined) {
        params.set("by", address.by);
      }
    } else if (address.status !== undefined) {
      params.set("status", address.status);
    }
  }
  return params.toString();
}
