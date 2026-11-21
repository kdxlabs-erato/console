# ADR-0147: The page nobody arranged stands as arranging shows it, and no size is chosen for a person

- Status: Accepted
- Date: 2026-11-21
- Supersedes [ADR-0082](0082-the-page-of-someone-who-has-arranged-nothing-is-composed-edge-to-edge.md) but for its point 5, [ADR-0108](0108-a-project-on-the-composed-page-stands-on-one-cell.md), [ADR-0110](0110-a-lead-with-nothing-beside-it-stands-at-a-size-it-comes-in.md) and [ADR-0139](0139-arranging-starts-from-the-page-closed-up-and-a-page-kept-with-gaps-can-be-closed.md), and the sentence of point 1 of [ADR-0105](0105-a-project-at-a-larger-size-is-a-glance-at-its-board.md) on the projects taking one size together where a width is closed up. Points 3 and 5 of [ADR-0061](0061-the-front-page-is-one-grid-of-tiles-a-person-arranges-by-hand.md), the page nobody arranged and a width nobody arranged packed from the top, hold again as they were written; [ADR-0109](0109-arranging-can-put-the-page-back-as-composed.md) puts the page back to the page this decision stands. The contract is in [specs/plugins.md](../specs/plugins.md).

## Context

The front page had two layouts. The page of someone who had arranged nothing was composed (ADR-0082): the first widget half the page wide, boxes reaching fractions of a cell, each frame told the size of its own nearest its box. The page being arranged stood on the grid's cells at sizes the tiles come in, and where the composed page drew a tile at no size of its own, arranging started from the page closed up, a widget given a larger size where that closed the rows (ADR-0139).

On a page of four widgets and seven projects, the two were different pages. Reset to default showed the notice four cells by four with the other widgets beside and under it. Done kept nothing arranged, and the page then stood composed: the notice half the page wide and six rows high, the fourth widget alone across the page, another drawn wide enough to show what that widget shows only when wide. Edit layout moved every tile before a person touched one. What a person sees while arranging is what they expect to keep, and the page did not keep it.

Each rule added to the composed page since ADR-0082, the projects on one cell, the lead alone at a size of its own, the widgets beside a lead that leaves columns, the page closed up when arranging starts, narrowed the distance between the two pages without closing it: the composed page was made to meet the page's edges, and the sizes cannot always.

## Decision

1. **One page, looked at or arranged.** Where a person has arranged nothing, every tile they may see stands in the page's order, the widgets placed at the top, the projects, the widgets placed at the bottom, each at the size it starts at, at the first room reading from the top: a widget at its `defaultSize` where the grid fits it, else at the largest of its `sizes` that fits; a project an icon on one cell. Edit layout moves nothing, and Done after Reset to default keeps the page that was shown.
2. **No size is chosen for a person.** No widget is drawn larger or smaller than the size it starts at, to lead the page or to close a row. A widget is shown large where its plugin starts it large or the person picks a larger size.
3. **A width nobody arranged, when another was, reads the same order packed from the top,** each tile at the size kept at the other width where this grid has it, else at the size it starts at. A project kept as an icon stays one.
4. **Close the gaps moves tiles and changes no size.** While arranging, it stands the tiles in the order they are read, each at the size it has, at the first room from the top, and is offered only where that moves something. A page nobody arranged already stands so.
5. **A width a person arranged stands as they left it** (ADR-0082, point 5, which holds).

## Consequences

- The page nobody arranged may leave cells empty at the end of a row, and a small tile after a large one takes the room left beside it, so that projects may stand beside a widget rather than in a row of their own. A person who wants a widget larger, or the page closed, picks the sizes.
- A plugin's `defaultSize` is the size its widget is first seen at, at every width that holds it; a widget meant to lead a page says so with a large `defaultSize`.
- A frame is always told the size of the cells it has.
- Nothing stored changes shape, and `HomeGrid` keeps its props. A page kept before stands as it was kept; a person who kept nothing arranged sees their page stand as point 1 says.
- The layout is one pass over the tiles, where a width nobody arranged tried up to 4096 combinations of sizes.
- Rejected:
  - keeping the composed page and showing it while arranging: its boxes are fractions of a cell, and a tile cannot be put down on a cell there without the others moving, which is what ADR-0082, point 3, did and ADR-0139 ended;
  - composing the page on whole cells, the first widget at the largest size that fits beside the next ones: still a size chosen for the person, and a lead that changes with how many widgets follow it;
  - Reset to default leaving the arranging at once, so that no page is shown before Done: Edit layout would still move every tile of a page nobody arranged.
