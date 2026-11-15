# Collections: things made, where each was used and how it did

One shape a desk may take, read when its member wants a set of things they made kept with, for each, whether and where it was used and how it did by day. It is not the shape of a desk: for anything else, choose a shape for that thing ([SKILL.md](SKILL.md), phase 3). The package has this one whole, so nothing of it is built: its schemas ([records.md](/docs/specs/records.md)), `console desk check`, which says each problem of the files with its file and signs in nowhere, and a ready page, `deskPage()`. Which collections a desk keeps is said in the desk's `AGENTS.md`. After writing, run `console desk check` in the desk.

## The files

```
records/
  index.json             the collections
  <key>/collection.json  what the collection is, and how its items are read
  <key>/items.json       what was made
  <key>/uses.json        where an item was used (optional)
  <key>/metrics.json     how an item did, by day (optional)
  <key>/files/           the files themselves
```

A key is lowercase letters, digits and hyphens. A day is written `2026-11-15`. An address begins with `https://`. Everything else is text, and is shown as text.

`index.json`, the collections in the order they are shown:

```json
{ "collections": [{ "key": "ad-creatives", "title": "Ad creatives" }] }
```

`ad-creatives/collection.json`. Only `title` is needed; the rest says how an item is read:

```json
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
```

A field's `kind` is `text`, `number`, `day` or `link`. A metric's `unit` is `count`, `currency`, `percent` or `seconds`. Each state an item can be in is a status, the one it begins in too. A rate of two metrics, such as clicks per impression, is a ratio: the total of `of` for each of `per`, shown `as` `percent` or `number`; a rate that is no ratio is shown nowhere.

`ad-creatives/items.json`, a list. `id`, `title` and `madeOn` are needed; an `id` is letters, digits and hyphens, and never changes:

```json
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
```

`status` is one of the collection's, and where the collection has statuses every item carries one. `preview` is a picture (png, jpg, jpeg, webp, gif, avif, svg). `task` is a task of the board, where the item is tied to one.

`ad-creatives/uses.json`, a list: where an item was used, and when.

```json
[{ "item": "c-001", "on": "2026-11-06", "where": "The November campaign, feed" }]
```

`ad-creatives/metrics.json`, a list: a row for an item and a day, with a number for each metric that day has.

```json
[{ "item": "c-001", "on": "2026-11-06", "values": { "impressions": 1200, "clicks": 36, "spend": 54000 } }]
```

## The files themselves

`files/` of a collection holds what was made, of any kind and size, and an item names each by its path from the collection: `files/c-001.mp4`. No part of a path begins with a full stop. A large file goes in with git LFS: track its kind (`git lfs track`) before adding it.

## Bounds

At most 100 collections; in a collection 5,000 items, 20,000 uses and 50,000 rows of figures; 64 characters in a key or an id, 200 in a title, a label or `where`, 2,000 in a description, a note or a field that is text; 8 MiB in a JSON file. A file under `files/` has no bound.

## What the check says

A problem, with its file, for what does not read: a file that is no JSON or not in this shape, an item a use or a row of figures names that is not there, a preview or a file that is not there, a JSON file over its bound. A note, and no problem, for a file git LFS has not fetched on this machine, a use or a figure dated before its item was made, and an item with no status where its collection names some. With any problem it ends in 1; where a desk keeps no collection it says so and ends in 0, and what else lies under `records/` is not its to read.

## What never goes in

A secret: a token, a key, a password.
