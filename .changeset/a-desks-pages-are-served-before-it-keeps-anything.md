---
"@skillcdn/console": patch
---

`console serve --records <dir>` serves a desk's pages before the desk keeps anything ([ADR-0122](https://github.com/skillcdn/console/blob/main/docs/adr/0122-a-desk-is-given-its-least-and-grown-by-what-its-member-asks.md)).

- **A directory that is not there yet is no error.** A new desk has no `records/` until something is kept, and the shell's `npm run serve`, which is `console serve dist --records ../records`, ended there with "No records to serve". Now every path under `/records/` answers `404`, `records.not_found`, until the directory is there, and the line the command prints says that nothing is kept there yet.
- **What comes to be kept is served with no restart:** the directory is looked for at each request.
- **What is there and is no directory is still refused** before anything listens, as "is there and is not a directory".
