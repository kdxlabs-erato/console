---
"@skillcdn/console": patch
---

Breaking: the command's reads of a pack go as the `skillcdn` command's own do (ADR-0118), where they had drifted from it.

- `console skill --file <path>` prints a page of the file, 40,000 characters unless `--limit` says otherwise (up to 100,000), and where the next begins, which `--offset` reads; it printed the file whole.
- `console skills <folder|file>` prints a page of the folder or of the outline, 50 entries unless `--limit` says otherwise (up to 200), and a page that ends before the folder does names its `nextCursor`, which `--cursor` continues; it printed the folder whole.
- A read the pack refused ends with exit `1` and the refusal on standard error, the listing too; it was printed with exit `0`. A path with nothing at it is said in the pack's own code and words (`file.not_found: ...`), a skill that is not there with the skills there are; `--json` still prints the console's answer, which says the status.
- `console skills --search` takes its folder with `--path <folder>` as well as after the words.
- `console skills --rows` takes `--format json`, an array of rows with their cells by column name; `console skills --code` takes `--grep <pattern>` and prints each block under `--- <path> > <heading> (<language>) ---`; `--out` says `Wrote <how much> to <file>.`; a document with no table prints the CSV's header alone.
- The listing marks a folder's README as the overview of its folder.

A skill is still read whole, and the tables and the code blocks are still joined.
