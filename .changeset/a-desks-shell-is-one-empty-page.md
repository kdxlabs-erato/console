---
"@skillcdn/console": patch
---

The shell of a desk's pages is one page of the member's own, with nothing on it yet ([ADR-0122](https://github.com/skillcdn/console/blob/main/docs/adr/0122-a-desk-is-given-its-least-and-grown-by-what-its-member-asks.md)).

- **`template/desk-web` no longer mounts `deskPage()`** (the template was never released with it). `src/main.tsx` lists the pages and mounts one, `page`, from `src/page.tsx` beside it, at `/pages/mine`, which `/` opens on. The page says that it is its member's and that their agent builds it from what they ask, in the language the pages speak; its comments say what a page is given, what it may read (the board as the member, and the desk's `records/` at `/records/`) and what it is built from (the parts' catalogue, and the charts). A desk written before this keeps the pages it has.
- **`deskPage()` and its views stay exported**, as blocks one may add: `pages: [page, deskPage()]`. The README's "A desk's pages" lists them, each in a line.
- **The README** has "Pages of your own" as a section of its own: what a page is given, what it may read beside the board, and what it is built from.
