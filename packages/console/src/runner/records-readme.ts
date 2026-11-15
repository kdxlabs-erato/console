import {
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
} from "../records.js";

// `records/README.md` of a desk (ADR-0117): the format of its records in the fewest words that
// let an agent write one right the first time, with one small example of each file. A fixed
// file of both desks, a person's and an agent account's, written with the desk and the member's
// from then on. The bounds and the words a field may be are the schemas' own, so that the file
// cannot say another format than the one that is checked; a test reads its examples with the
// schemas and through the check.

const count = (value: number): string => value.toLocaleString("en-US");
const words = (values: readonly string[]): string =>
  values
    .map((value) => `\`${value}\``)
    .join(", ")
    .replace(/, ([^,]*)$/, " or $1");
const FENCE = "```";

export const RECORDS_README = `# The records of this desk

What was made here and what became of it, kept as plain JSON and the files themselves. An agent writes them with its file tools; nothing is generated. Which kinds this desk keeps is said in the desk's \`AGENTS.md\`. After writing, run \`console desk check\` in the desk: it says each problem with its file, and signs in nowhere.

## The files

${FENCE}
records/
  index.json             the collections
  <key>/collection.json  what the collection is, and how its items are read
  <key>/items.json       what was made
  <key>/uses.json        where an item was used (optional)
  <key>/metrics.json     how an item did, by day (optional)
  <key>/files/           the files themselves
${FENCE}

A key is lowercase letters, digits and hyphens. A day is written \`2026-11-15\`. An address begins with \`https://\`. Everything else is text, and is shown as text.

\`index.json\`, the collections in the order they are shown:

${FENCE}json
{ "collections": [{ "key": "ad-creatives", "title": "Ad creatives" }] }
${FENCE}

\`ad-creatives/collection.json\`. Only \`title\` is needed; the rest says how an item is read:

${FENCE}json
{
  "title": "Ad creatives",
  "description": "What was made for the ads, and how each did.",
  "statuses": [
    { "key": "used", "label": "Used" },
    { "key": "unused", "label": "Not used" }
  ],
  "fields": [{ "key": "format", "label": "Format", "kind": "text" }],
  "metrics": [
    { "key": "impressions", "label": "Impressions", "unit": "count" },
    { "key": "clicks", "label": "Clicks", "unit": "count" },
    { "key": "spend", "label": "Spend", "unit": "currency", "currency": "KRW" }
  ],
  "ratios": [
    { "key": "ctr", "label": "Clicks per impression", "of": "clicks", "per": "impressions", "as": "percent" }
  ]
}
${FENCE}

A field's \`kind\` is ${words(RECORD_FIELD_KINDS)}. A metric's \`unit\` is ${words(RECORD_METRIC_UNITS)}. A ratio is the total of \`of\` for each of \`per\`, shown \`as\` ${words(RECORD_RATIO_FORMS)}.

\`ad-creatives/items.json\`, a list. \`id\`, \`title\` and \`madeOn\` are needed; an \`id\` is letters, digits and hyphens, and never changes:

${FENCE}json
[
  {
    "id": "c-001",
    "title": "Morning commute, 15 seconds",
    "madeOn": "2026-11-03",
    "status": "used",
    "preview": "files/c-001.png",
    "files": [{ "label": "The video", "path": "files/c-001.mp4" }],
    "links": [{ "label": "Where it runs", "url": "https://ads.example/c-001" }],
    "task": { "project": "ads", "number": 12 },
    "fields": { "format": "9:16" },
    "note": "The first cut."
  }
]
${FENCE}

\`status\` is one of the collection's. \`preview\` is a picture (${RECORD_PREVIEW_KINDS.map((kind) => kind.slice(1)).join(", ")}). \`task\` is a task of the board, where the item is tied to one.

\`ad-creatives/uses.json\`, a list: where an item was used, and when.

${FENCE}json
[{ "item": "c-001", "on": "2026-11-06", "where": "The November campaign, feed" }]
${FENCE}

\`ad-creatives/metrics.json\`, a list: a row for an item and a day, with a number for each metric that day has.

${FENCE}json
[{ "item": "c-001", "on": "2026-11-06", "values": { "impressions": 1200, "clicks": 36, "spend": 54000 } }]
${FENCE}

## The files themselves

\`files/\` of a collection holds what was made, of any kind and size, and an item names each by its path from the collection: \`files/c-001.mp4\`. No part of a path begins with a full stop. A large file goes in with git LFS: track its kind (\`git lfs track\`) before adding it.

## Bounds

At most ${count(MAX_RECORD_COLLECTIONS)} collections; in a collection ${count(MAX_RECORD_ITEMS)} items, ${count(MAX_RECORD_USES)} uses and ${count(MAX_RECORD_METRIC_ROWS)} rows of figures; ${count(MAX_RECORD_KEY_LENGTH)} characters in a key or an id, ${count(MAX_RECORD_LINE_LENGTH)} in a title, a label or \`where\`, ${count(MAX_RECORD_TEXT_LENGTH)} in a description, a note or a field that is text; ${count(MAX_RECORD_FILE_BYTES / (1024 * 1024))} MiB in a JSON file. A file under \`files/\` has no bound.

## What never goes in

A secret: a token, a key, a password.
`;
