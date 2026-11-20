---
"@skillcdn/console": patch
---

A project's mark may be an icon of the console's pack. A project gains `glyph`, the name of one, which the mark shows on the project's colour in the symbol's place; the project's own image still stands over both.

- The project's form chooses it with the pack's picker, beside the mark's letters, the colour and the image, and `ProjectMark` draws it from `project.glyph`.
- `console project new` and `console project edit` take `--glyph <name>`, `none` to take it away; a name that is none of the pack's is answered with the pack's names before anything is sent. `console project <key>` says `glyph:` on the line of the mark, between the symbol and the image.
- Over REST, `glyph` is optional on what makes and changes a project and takes a name of the console's own pack alone; in an answer it is the name or `null`, and a console older than the field leaves it out. `projectGlyphOf` reads it: a name the reader's pack lacks is none, and the mark is its symbol.
- A deployment's `migrate` role adds the column (`0064_project_glyph`).
