# ADR-0142: The console has one icon pack, drawn on one grid and used by name

- Status: Accepted
- Date: 2026-11-20
- Adds to [ADR-0106](0106-a-look-is-a-part-with-a-file-and-a-row-and-a-page-places-its-parts.md): an icon is a part, one more thing a plugin's page takes from the console, and one more thing a project's mark may show.

## Context

The console's pages drew five glyphs, each where it was needed: a card's menu, a column's fold, a menu's caret, two devices. Each was an `<svg>` written into its component, on a grid of sixteen or of twenty, filled or stroked as whoever wrote it chose. A plugin's page and a prototype built on the console had nothing to take: every one chose an icon set of its own or drew its own, and a workspace's pages ended up in several hands at once. A project's mark was a letter or two, or an image somebody had to find and upload.

Nothing is wrong with any one glyph. What is missing is one place they come from, one way they are drawn, and one way a page asks for one.

## Decision

1. **One pack, one grid, one stroke.** A glyph is drawn on a grid of twenty by twenty, in lines 1.5 wide with round ends and round joins, in one colour, never filled. That is how the glyphs the pages already drew on the larger grid were drawn; the rest are redrawn to it.
2. **A glyph is one SVG file, and the files are the source.** `packages/console/icons/<name>.svg`, named in lowercase with hyphens for what it shows (`calendar`, `arrow-right`), and `groups.json` beside them, which puts each in the group a picker and the catalogue show it under. Whoever draws the pack changes those files and nothing else.
3. **The package draws from data, never from markup.** `pnpm icons` reads the folder and writes `packages/console/src/icons/glyphs.ts`: every glyph as its shapes, an element's name with its measures. A file is read as what an agent or a tool handed in: by a small grammar of its own, which takes the seven shapes of a line drawing with their measures, the pack's one stroke where a tool wrote it out, and refuses everything else, a script, a style, a link, an id, a transform, a text, with what to do instead. `pnpm check:icons`, part of `pnpm check`, holds the written module to the folder and the folder to the rules.
4. **A page asks for a glyph by its name.** `Icon` draws one as elements in the colour of the text around it, at `xs`, `sm`, `md` or `lg`, hidden from a screen reader beside words and named where it stands alone. The data and `iconElement`, which makes the same element in a page that is not React's, are `@skillcdn/console/icons`, which depends on nothing, for a plugin's plain bundle and a prototype. The classes are a part, `icon`, in the stylesheet a plugin's frame already reads.
5. **The stroke is said on the grid, and a size may correct it.** A glyph drawn small is given a little more stroke and one drawn large a little less, in the part's file, so that a line stays about as heavy as the letters beside it. The correction is the stylesheet's; a glyph's file never says it.
6. **A project's mark may be an icon of the pack.** `glyph` on a project names one, and the mark shows it on the project's colour in the symbol's place; the project's own image still stands over both. The console takes a name of its own pack and nothing else. A reader whose pack lacks the name, an older page reading a newer console, shows the symbol.
7. **Choosing one is a part of the pack.** `IconPicker` shows the choice in a field and opens the pack under it: a box that finds a glyph by its name or by the words a language pack gives it, none as the first choice, the glyphs under their groups. It is worked whole with the keys.
8. **An icon stands beside words, and seldom for them.** A button a person has to understand keeps its words. The pages draw the glyphs they drew before from the pack, and gain none by this decision: where the console's own pages take more of them is a design pass's to say.

## Consequences

- A glyph is added by a file and a line of `groups.json`; a word it is also found by is a line in each language pack (`icons.words`), since what a person types is in their language, and a glyph without one is found by its name.
- The pack ships in the package: about thirteen kilobytes of data for some eighty glyphs, in every bundle that names `Icon`. A plain bundle that takes two glyphs takes the pack; cutting it to the glyphs a bundle names is left until one asks.
- The names are surface: a plugin's page, a prototype and a project's `glyph` name them. A glyph is redrawn freely under its name; a name is taken out only with a `Breaking:` entry, and a project that named it shows its symbol from then on.
- `projects` gains a column, `glyph`, and the REST contract a field, optional in an answer so that a console of before reads as none.
- The glyphs the pages drew are drawn as they were, but for a column's fold, a shade lighter than it was: its stroke is now said on the larger grid.
- Rejected: a set taken from elsewhere (its look is another product's, and a licence to carry); glyphs as a font or one sprite file (a frame's policy, and a page that must draw a glyph in its text's colour, are served by elements and not by either); markup kept as strings and set into the page (what the pages never do with anything, their own files included); a glyph's name stored in a project's `symbol` (a page of before would show the name as letters).
