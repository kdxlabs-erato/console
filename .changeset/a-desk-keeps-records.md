---
"@skillcdn/console": patch
---

A desk keeps what its member asks for under `records/`: plain files, JSON an agent writes with its file tools and the files themselves, which the desk's pages read. For a set of things made, with where each was used and how it did, the package has a form ready, collections (ADR-0117, as ADR-0122 amends it), which a desk takes where its member asks for exactly that. The format is `docs/specs/records.md`.

- **The format's schemas** are exported from `@skillcdn/console/api`: `recordsIndexSchema`, `recordsCollectionSchema`, `recordsItemSchema` and `recordsItemsSchema`, `recordsUseSchema` and `recordsUsesSchema`, `recordsMetricRowSchema` and `recordsMetricsSchema`, with their types, their bounds (`MAX_RECORD_ITEMS` and the rest) and `readRecords(schema, text)`, which answers a file's value or every problem with it in words.
- **The format is said to an agent** by the skill `keeping-a-desk`, on its page `collections.md`: the fewest words that let an agent write a collection right, with an example of each file. Nothing of it is written into a desk: `console desk` and `console agent setup` write no file under `records/`.
- **`console serve [<dir>] [--port <n>] [--records <dir>]`** serves what a desk keeps at `/records/`, beside the build and the API, for the desk's pages: each file read when it is asked for, `GET` alone, nothing outside the directory; a picture, a video, a sound and a PDF by their kinds, anything else as a download; a part of a file where a player asks for one; a file git LFS has not fetched refused as `records.not_fetched`. Without the flag, a path under `/records/` is `records.not_served`.
- **`console desk check [<directory>]`** reads a desk's collections and says each problem with its file and what is wrong, ending in 1 with any; a file that git LFS has not fetched is a note. It needs no sign-in. `checkRecords(files)` is the same check for a program.
