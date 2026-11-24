# The icon pack

The glyphs the console's pages, a plugin's pages and a prototype draw by name ([ADR-0142](../../../docs/adr/0142-the-console-has-one-icon-pack-drawn-on-one-grid-and-used-by-name.md)). This folder is the source: **one SVG file a glyph**, and `groups.json`, which says the group each stands under. Whoever draws the pack works here and nowhere else; the code reads what is here.

## The grid

| | |
|---|---|
| Canvas | 20 by 20 (`viewBox="0 0 20 20"`) |
| Stroke | 1.5, round ends, round joins, centred on the path |
| Colour | one, the text's: `stroke="currentColor"` (a tool's black is taken as that) |
| Fill | none on the lines. One part may be tinted: see below |
| Margin | keep the drawing two units clear of the canvas' edge, the stroke included, where the shape allows |
| Shapes | `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, twelve at most; a `g` only holds them together |
| Name | lowercase letters and digits, words joined by a hyphen, for what it shows: `calendar`, `arrow-right` |

A dot is a circle of radius 0.75, which the stroke fills, or a stroke of no length (`M10 6.5h.01`).

## The tinted part

The pack is a duotone ([ADR-0149](../../../docs/adr/0149-the-icon-pack-tints-one-part-of-a-glyph-in-the-accent.md)): under its lines a glyph may have one part filled in the accent, the one area that tells what the thing is.

- **One part.** A calendar's head, a folder's front, a lock's body, a lens, a bell, a speech bubble. Draw it as a shape filled and not stroked, `fill="#3b6fd4" stroke="none"` (any opacity; the stylesheet says how much), **before** the lines. Two such shapes at most, for a part that cannot be drawn in one.
- **Leave open what says something.** A house's door, a page's folded corner, a gear's hub (draw the hole the other way round, so the fill leaves it out).
- **Never a head.** A person's or an agent's face is not tinted; tint the body, or nothing.
- **Nothing to fill, no tint.** A plus, a check, an arrow, a chevron, dots: lines alone.

The colour, and where the tint goes away (`xs`, a line of text with `sc-icon-plain`, a filled button, a project's mark), are the part's, in `../src/styles/parts/icon.css`.

Flatten transforms and outline nothing: a glyph stays strokes. Export plain SVG. The reader refuses what is none of the above, a style, a class, an id, a transform, a text, a mask, a link, and says which file and what to change; the width and height of twenty and the stroke's own attributes, which a tool writes out, are fine.

The sizes a glyph is drawn at, and the little the stroke is corrected by at each (heavier when small, lighter when large), are in the part's file, `../src/styles/parts/icon.css`: `xs` 12 pixels, `sm` 16, `md` 20, `lg` 32. Draw for 20 and look at 16.

## Changing a glyph, adding one

1. Replace `<name>.svg`, or add a file. A name already in use stays what it shows: a project's mark and a plugin's page name it.
2. For a new one, add its name to the `icons` of its group in `groups.json`, where it should stand among the others.
3. Run `pnpm icons`. It reads this folder, says what it refuses, and writes `../src/icons/glyphs.ts`, which is committed with the files.
4. Look: `pnpm dev`, then `/parts#icon` shows every glyph at each size under its name, and `/parts#mark` one as a project's mark. A project's settings (sign in as alice) show the picker.

A word a glyph is also found by, beside its name, is a line under `icons.words` in each language pack (`../src/i18n/en.ts`, `ko.ts`): optional, and the same glyphs in every pack. A new group needs its word under `icons.groups` there.

`pnpm check:icons` holds all of this, and is part of `pnpm check`.
