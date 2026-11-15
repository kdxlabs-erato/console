---
"@skillcdn/console": patch
---

A desk keeps records of what its member made (ADR-0117): plain JSON files and the files themselves under `records/`, which an agent writes with its file tools and the desk's pages read. The format is `docs/specs/records.md`.

- **The format's schemas** are exported from `@skillcdn/console/api`: `recordsIndexSchema`, `recordsCollectionSchema`, `recordsItemSchema` and `recordsItemsSchema`, `recordsUseSchema` and `recordsUsesSchema`, `recordsMetricRowSchema` and `recordsMetricsSchema`, with their types, their bounds (`MAX_RECORD_ITEMS` and the rest) and `readRecords(schema, text)`, which answers a file's value or every problem with it in words.
- **`console desk check [<directory>]`** reads a desk's records and says each problem with its file and what is wrong, ending in 1 with any; a file that git LFS has not fetched is a note. It needs no sign-in. `checkRecords(files)` is the same check for a program.
