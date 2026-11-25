# ADR-0149: The icon pack tints one part of a glyph in the accent

- Status: Accepted
- Date: 2026-11-24
- Amends point 1 of [ADR-0142](0142-the-console-has-one-icon-pack-drawn-on-one-grid-and-used-by-name.md): a glyph is still lines on one grid with one stroke, and may have one part filled under them.

## Context

The pack was lines alone, 1.5 wide with round ends, in the text's colour. Drawn so, it looked like the line sets every other product takes, and nothing in it was the console's own. The designer looked at directions drawn on the same ten glyphs (filled, a pale fill under the lines, a thin sharp line, a broken line, a bold line, pixels) and chose the second, in the console's blue, on condition that the blue is used with thought and not poured into every outline.

## Decision

1. **A glyph may have one tinted part.** The one area that tells what the thing is: a calendar's head, a folder's front, a lock's body, a lens, a bell. It is a shape filled and not stroked, under the lines; a file holds at most two such shapes, for a part that has to be drawn in two. A glyph with no inside, a plus, a check, an arrow, has none.
2. **What is left open says something too.** A house leaves its door untinted, a page its folded corner, a gear its hub. A figure's head is never tinted: a person's or an agent's face is no surface to colour; where a figure is tinted at all, it is the body.
3. **The colour is the accent's, the amount the part's.** The file's fill says nothing that is kept: `sc-icon-tint` fills the part in `--sc-color-accent-solid` at 30%. Where a thing is chosen the tint deepens; where it cannot be used it greys. A page without the console's stylesheet draws it in the text's colour, faint.
4. **The tint goes where it would muddy, and where the place has a colour of its own.** At `xs`, in a line of text (`sc-icon-plain`), on a filled button and on a project's mark, a glyph is its lines alone. And so in a place of a tone of its own, a danger button, a callout or a badge of a tone: the accent under lines drawn in the place's colour is a second colour there, blue under red. Weighed against it on a look at the pack before its release were a grey tint in such a place, which keeps the duotone and says nothing, and a tint in the place's own colour, which looks most finished and gives every tone the pages come to have a tint to choose with it; lines alone is the rule there was, a line longer.
5. **The reader holds the rule.** `pnpm icons` takes a shape with `fill` (the accent or the text's colour) and `stroke="none"` as a tinted part, writes it as `"tint"` after its measures, and refuses a filled shape of any other kind, a tint after a line, more than two, or a glyph that is tint alone.

## Consequences

- The pack has 86 glyphs, each with at most one tinted part; the editor's four (`list-numbered`, `quote`, `undo`, `redo`) are among them.
- `GlyphShape` has a third, optional place, `"tint"`; `Icon` and `iconElement` give that shape its class. On a page without the console's stylesheet the package draws the tint itself, filled in the text's colour, faint, and not stroked. A reader of `GLYPHS` written for lines alone strokes it as it strokes every shape, an outline round the part: it reads the third place from now on, which the changeset says as `Breaking:`.
- A plugin's page asks for nothing new: the part's stylesheet colours the tint and takes it away in a place of a tone, and a glyph in a line of text takes `sc-icon-plain`.
