import * as z from "zod/mini";

// The format of a desk's records as the desk's pages read it (ADR-0117): the files under a
// desk's `records/`, each a small JSON file an agent wrote. This module is the pages' own
// copy of the format's shapes and bounds, and the one place they are named: the pages parse
// with what is exported here and with nothing else, so that the format's own schemas, once
// the package carries them, take this module's place by being exported from it under the
// same names. Nothing here reads a file or draws a page.

/** How many collections a desk's index may name. */
export const MAX_RECORD_COLLECTIONS = 50;
/** How many items a collection may hold. */
export const MAX_RECORD_ITEMS = 2000;
/** How many uses a collection may hold. */
export const MAX_RECORD_USES = 5000;
/** How many rows of metrics a collection may hold. */
export const MAX_RECORD_METRIC_ROWS = 20_000;
/** How many statuses, fields, metrics or ratios a collection may name, of each. */
export const MAX_RECORD_DEFINITIONS = 20;
/** How many links an item may carry. */
export const MAX_RECORD_LINKS = 10;
/** How many files an item may name. */
export const MAX_RECORD_FILES = 20;
/** How long a title, a label or a key may be. */
export const MAX_RECORD_TITLE_LENGTH = 200;
/** How long a text may be: a description, a note, a field's value, where a thing was used. */
export const MAX_RECORD_TEXT_LENGTH = 2000;
/** How long a link or a path may be. */
export const MAX_RECORD_ADDRESS_LENGTH = 2048;
/** How many bytes of one of the records' JSON files the pages read. */
export const MAX_RECORD_FILE_BYTES = 2 * 1024 * 1024;

/** A key: lowercase letters, digits and hyphens. */
export const RECORD_KEY = /^[a-z0-9][a-z0-9-]*$/;
/** An item's id: letters, digits and hyphens. */
export const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

const key = z
  .string()
  .check(z.minLength(1), z.maxLength(MAX_RECORD_TITLE_LENGTH), z.regex(RECORD_KEY));
const id = z
  .string()
  .check(z.minLength(1), z.maxLength(MAX_RECORD_TITLE_LENGTH), z.regex(RECORD_ID));
const title = z.string().check(z.minLength(1), z.maxLength(MAX_RECORD_TITLE_LENGTH));
const text = z.string().check(z.maxLength(MAX_RECORD_TEXT_LENGTH));
const day = z.iso.date();
const amount = z.number().check(z.gte(-Number.MAX_SAFE_INTEGER), z.lte(Number.MAX_SAFE_INTEGER));

/** `records/index.json`: the collections a desk keeps, in the order it shows them. */
export const recordsIndexSchema = z.object({
  collections: z.array(z.object({ key, title })).check(z.maxLength(MAX_RECORD_COLLECTIONS)),
});
export type RecordsIndex = z.infer<typeof recordsIndexSchema>;

/** The kinds a field of an item may be. */
export const RECORD_FIELD_KINDS = ["text", "number", "day", "link"] as const;
/** The units a metric may be in. */
export const RECORD_METRIC_UNITS = ["count", "currency", "percent", "seconds"] as const;
/** What a ratio is shown as. */
export const RECORD_RATIO_FORMS = ["percent", "number"] as const;

const definitions = <T extends z.ZodMiniType>(one: T) =>
  z.optional(z.array(one).check(z.maxLength(MAX_RECORD_DEFINITIONS)));

/** `records/<key>/collection.json`: what the collection is and how its items are read. */
export const recordCollectionSchema = z.object({
  title,
  description: z.optional(text),
  /** The words an item's `status` may be; left out, an item has none. */
  statuses: definitions(z.object({ key, label: title })),
  /** What each item says beside its title. */
  fields: definitions(z.object({ key, label: title, kind: z.enum(RECORD_FIELD_KINDS) })),
  metrics: definitions(z.object({ key, label: title, unit: z.enum(RECORD_METRIC_UNITS) })),
  /** A figure worked out from two metrics' totals: `of` for each `per`. */
  ratios: definitions(
    z.object({ key, label: title, of: key, per: key, as: z.enum(RECORD_RATIO_FORMS) }),
  ),
});
export type RecordCollection = z.infer<typeof recordCollectionSchema>;

/** One thing that was made: an entry of `records/<key>/items.json`. */
export const recordItemSchema = z.object({
  id,
  title,
  madeOn: day,
  /** One of the collection's statuses, by key. */
  status: z.optional(key),
  /** A path under the collection's `files/`: a picture that stands for the item in a list. */
  preview: z.optional(z.string().check(z.minLength(1), z.maxLength(MAX_RECORD_ADDRESS_LENGTH))),
  /** Where the thing itself is: https only. */
  links: z.optional(
    z
      .array(
        z.object({
          label: title,
          url: z.string().check(z.minLength(1), z.maxLength(MAX_RECORD_ADDRESS_LENGTH)),
        }),
      )
      .check(z.maxLength(MAX_RECORD_LINKS)),
  ),
  /** The files of the thing itself, each a path under the collection's `files/`: of any kind and size. */
  files: z.optional(
    z
      .array(
        z.object({
          label: title,
          path: z.string().check(z.minLength(1), z.maxLength(MAX_RECORD_ADDRESS_LENGTH)),
        }),
      )
      .check(z.maxLength(MAX_RECORD_FILES)),
  ),
  /** A task of the board, where the item names one. */
  task: z.optional(z.object({ project: key, number: z.int().check(z.positive()) })),
  /** What the item says for each of the collection's fields, by the field's key. */
  fields: z.optional(z.record(z.string(), z.union([text, amount]))),
  note: z.optional(text),
});
export type RecordItem = z.infer<typeof recordItemSchema>;

/** Where an item was used: an entry of `records/<key>/uses.json`. */
export const recordUseSchema = z.object({
  item: id,
  on: day,
  /** The campaign, the channel, the page. */
  where: z.string().check(z.minLength(1), z.maxLength(MAX_RECORD_TEXT_LENGTH)),
  note: z.optional(text),
});
export type RecordUse = z.infer<typeof recordUseSchema>;

/** How an item did on one day: an entry of `records/<key>/metrics.json`. */
export const recordMetricRowSchema = z.object({
  item: id,
  on: day,
  /** A number for each of the collection's metrics it has one for, by the metric's key. */
  values: z.record(z.string(), amount),
});
export type RecordMetricRow = z.infer<typeof recordMetricRowSchema>;
