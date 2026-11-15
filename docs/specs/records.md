# Spec: a desk's records

- Status: **Built** ([ADR-0117](../adr/0117-a-desk-keeps-records-of-what-its-member-made-as-files-the-desks-pages-read.md)).
- Where things live: the format's schemas, its bounds and the check in `packages/console/src/records.ts`, exported from `@skillcdn/console/api`; the file that says the format to an agent, `records/README.md`, in the desk's templates (`packages/console/src/runner/desk.ts`); `console desk check` and `console serve --records` in `packages/console/src/cli/` ([cli.md](cli.md#a-desk-of-ones-own)).

A desk is a member's own repository, a person's or an agent account's ([runner.md](runner.md#the-desk)). Its records are what the member made and what became of it: plain JSON files and the files themselves, under `records/`, written by whichever agent works in the desk with its file tools. Nothing is generated and nothing needs a build. The desk's pages, the member's own extension of the console's pages, read them through `console serve --records`; `console desk check` says whether they read right, with no page and no console.

## The files

```
records/
  README.md              the format, for whichever agent works in the desk; written with the desk
  index.json             the collections
  <key>/
    collection.json      what the collection is, and how its items are read
    items.json           what was made: a list of items
    uses.json            where an item was used: a list (optional)
    metrics.json         how an item did, by day: a list (optional)
    files/               the files themselves: what was made, of any kind and size
```

A key is lowercase letters, digits and hyphens, beginning with a letter or a digit, and it is the folder's name. A day is written `2026-11-15`. An address begins with `https://`. Everything else a person reads there is text, and is shown as text: a line (a title, a label, where an item was used) has no line break in it, and no text holds a control character or one that makes a string look like another. A key of a file the format does not name is read past by the schemas, so that a page built on an older format still reads a newer file, and said by the check, since a field spelled wrong is otherwise taken as left out.

## `index.json`

`{ "collections": [ { "key", "title" } ] }`: the collections of the desk, in the order they are shown, each with the key its folder is called by. No command writes it: the first record does.

## `collection.json`

| Field | What it is |
|---|---|
| `title` | What the collection is called |
| `description` | A few words on what it keeps (optional) |
| `statuses` | `[ { "key", "label" } ]`: the words an item's `status` may be, such as used and not used. Left out, an item has none |
| `fields` | `[ { "key", "label", "kind" } ]`: what every item says beside its title; `kind` is `text`, `number`, `day` or `link` |
| `metrics` | `[ { "key", "label", "unit", "currency" } ]`: the figures an item is measured in, by day; `unit` is `count`, `currency`, `percent` or `seconds`, and `currency`, three capital letters such as `KRW`, says which where it is one (optional) |
| `ratios` | `[ { "key", "label", "of", "per", "as" } ]`: a figure worked out from the totals of two metrics, `of` for each `per`, such as clicks per impression; `as` is `percent` or `number` |

## An item, a use, a row of figures

An item, an entry of `items.json`:

| Field | What it is |
|---|---|
| `id` | Letters, digits and hyphens: what the uses and the figures name the item by. Never changed |
| `title` | What it is called |
| `madeOn` | The day it was made |
| `status` | One of the collection's statuses (optional) |
| `preview` | A picture of it, by its path under the collection's `files/`: `png`, `jpg`, `jpeg`, `webp`, `gif`, `avif` or `svg` (optional) |
| `files` | `[ { "label", "path" } ]`: the files themselves, each by its path under the collection's `files/` (optional) |
| `links` | `[ { "label", "url" } ]`: where it is elsewhere (optional) |
| `task` | `{ "project", "number" }`: a task of the board, where the member ties the item to one (optional). Nothing asks for it, and nothing forbids it |
| `fields` | `{ "<field key>": value }`: text, a number, a day or an address, as the field's `kind` says (optional) |
| `note` | A few words (optional) |

A use, an entry of `uses.json`: `item`, the item's id; `on`, a day; `where`, the campaign, the channel, the page; `note` (optional). A row of figures, an entry of `metrics.json`: `item`; `on`, a day; `values`, `{ "<metric key>": number }` for each metric the day has a figure for.

## The files themselves

A desk keeps what was made: pictures, video, sound, documents, of any size. A path begins with `files/`, and every part of it is a name that begins with no full stop, ends with neither a full stop nor a space, and holds none of `\ / : * ? " < > |`. What is large goes in with git LFS, which the desk's member sets up for the kinds they keep; a file that LFS has not fetched on a machine is a few lines of text in its place, a pointer, which the check notes and the serving refuses by name.

No secret goes into a record or among its files: a token, a key, a password. A desk's repository is private. What else a desk may hold is its member's to say, and its organization's where its rules say so.

## Bounds

| What | At most |
|---|---|
| Collections of a desk | 100 |
| Items of a collection | 5,000 |
| Uses of a collection | 20,000 |
| Rows of figures of a collection | 50,000 |
| Statuses of a collection | 20 |
| Fields, metrics and ratios of a collection | 30 each |
| Files an item names | 50 |
| Links an item carries | 20 |
| A key or an item's id | 64 characters |
| A title, a label, where an item was used | 200 characters |
| A description, a note, a field that is text | 2,000 characters |
| An address | 2,048 characters |
| A path under `files/` | 300 characters |
| A JSON file of the records | 8 MiB |
| A file under `files/` | no bound |

The names of the bounds are the package's (`MAX_RECORD_ITEMS` and the rest), and the schemas hold them.

## The check

`console desk check [<directory>]` reads the records of the desk in the directory, the current one unless another is named, and asks nothing of a console: it needs no sign-in. It says each problem on a line, with the file and what is wrong:

- a file that is no JSON, or not in the format: a field missing or of another kind, a key or an id spelled otherwise, a day that is none, an address that does not begin with `https://`, a path that leaves `files/`, a text over its bound;
- a collection the index names twice, or whose `collection.json` is not there; a folder of `records/` the index leaves out; a status, a field, a metric or a ratio named twice; a ratio worked out from what is no metric;
- an id given to more than one item; a status that is not one of the collection's; a field the collection does not name, or of another kind than it says; a key that is no part of an item or of a collection;
- a preview or a file that is not there; a use or a row of figures of an item that is not there; a figure for what is no metric;
- a JSON file over its bound, which is not read.

A file an item names that is a git LFS pointer is said as a note, `note: …`, and is no problem; so is a use or a row of figures dated before its item was made, which is most often a day written wrong and now and then a thing used before it was recorded: only the member knows. With any problem the command ends in 1; with none it says how many collections read and what each keeps, and where `records/index.json` is not there, that the desk has no records yet, which is no failure. At most 20 problems of one file and 200 in all are said. `--json` answers `{ "directory", "found", "problems": [ { "file", "problem" } ], "notes", "collections": [ { "key", "items", "uses", "metricRows" } ] }`.

## Serving

`console serve [<dir>] [--port <n>] [--records <dir>]` serves the records in the directory named at `/records/`, beside the build and the API ([cli.md](cli.md#a-console-of-ones-own)): `records/index.json` of the desk is `GET /records/index.json`. On the loopback alone, as everything the command serves, and to no request that the browser says comes from another site's page.

- **Read when asked.** Every request reads the file as it is then, and is answered with `Cache-Control: no-store`: a record an agent just wrote is what the page shows.
- **`GET` alone.** Any other method is `405`, `records.read_only`.
- **Nothing outside the directory.** A path with a part that is empty, `.` or `..`, that begins with a full stop, or that holds a backslash; a file reached through a link that leaves the directory; a folder: each is `404`, `records.not_found`, as a file that is not there is, and nothing is listed.
- **By its kind.** JSON, a picture (`png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`), a video (`mp4`, `m4v`, `webm`, `mov`, `ogv`), a sound (`mp3`, `m4a`, `aac`, `wav`, `ogg`, `oga`, `flac`) and a PDF are answered with their own content type, so that a page shows them in place. An `svg` is answered as a picture and as a download at once (`Content-Disposition: attachment`, and a policy that runs nothing), so that a page shows it and nothing opens it as a document of the pages' origin. Anything else is handed over as a download: `application/octet-stream`, `Content-Disposition: attachment` with its name. Every answer says `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy: same-origin`.
- **A part of a file.** A request for one range of bytes (`Range: bytes=…`) is answered with `206` and that part, so that a video is played from where it is looked at; a range the file does not have is `416`.
- **A file git LFS has not fetched** is `409`, `records.not_fetched`, with what fetches it: `git lfs pull` in the desk.
- **Without `--records`,** every path under `/records/` is `404`, `records.not_served`, and never the build's page.

A refusal is `{ "error": { "code", "message" } }`, as the API's are. The pages of the build are served under the policy of every build ([ADR-0014](../adr/0014-a-persons-own-console-is-served-from-their-machine-by-the-command.md)): what is of the same origin is shown, so a picture, a video and a sound of `/records/` are, and a PDF in a frame; nothing of another origin is.
