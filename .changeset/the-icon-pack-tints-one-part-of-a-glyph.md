---
"@skillcdn/console": patch
---

The icon pack is a duotone (ADR-0149): under its lines a glyph may have one part tinted in the accent, the one area that tells what the thing is, a calendar's head, a folder's front, a lock's body. `GlyphShape` has an optional third place, `"tint"`, and `Icon` and `iconElement` give that shape the class `sc-icon-tint`, which the `icon` part colours in `--sc-color-accent-solid` at 30%; without the stylesheet it is drawn in the text's colour, faint. The tint goes away at `xs`, on a filled button, on a project's mark, and where a glyph stands in a line of text and takes `sc-icon-plain`; it deepens on a thing chosen and greys where a thing cannot be used. `pnpm icons` takes a shape filled in the accent with `stroke="none"`, before the lines, as a tinted part, two at most.

The pack has four more glyphs, for an editor's tools: `undo`, `redo`, `list-numbered` and `quote`. The settings gear is redrawn with six teeth, and the calendar, document, folder, comment, bell, person, lock, search and home are redrawn a little rounder; every glyph keeps its name.
