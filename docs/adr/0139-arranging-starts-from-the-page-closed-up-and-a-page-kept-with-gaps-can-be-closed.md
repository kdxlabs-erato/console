# ADR-0139: Arranging starts from the page closed up, and a page kept with gaps can be closed

- Status: Accepted
- Date: 2026-11-20
- Amends point 3 of [ADR-0082](0082-the-page-of-someone-who-has-arranged-nothing-is-composed-edge-to-edge.md), "arranging starts from the composed page: each widget takes the cells nearest where it stood, at the size it was told", and its consequence that the two differ by up to half a cell; point 2 of [ADR-0108](0108-a-project-on-the-composed-page-stands-on-one-cell.md), "a project stays where it stood when the person starts to arrange the page", which holds from now on where the composed page stands on whole cells and not where it is closed up; point 2 of [ADR-0110](0110-a-lead-with-nothing-beside-it-stands-at-a-size-it-comes-in.md), where the projects alone followed a lead into the columns it leaves; and adds to [ADR-0109](0109-arranging-can-put-the-page-back-as-composed.md). The composed page of ADR-0082, a project's one cell on it (ADR-0108, point 1) and the closing up of a width nobody arranged when another was stand. The contract is in [specs/plugins.md](../specs/plugins.md).

## Context

The composed page draws a tile in a box that need not be a size it comes in: the lead half the page wide. On twelve columns that is six cells, and the widths a widget comes in are two, four and eight. When a person began to arrange such a page, each tile took the cells nearest where it stood at the size it was told, so a lead drawn six wide stood four wide with two empty columns beside it, the two widgets beside it stood four wide with two more at the page's edge, and the rows under a lead told a size of two rows stood empty. The page a person had just looked at, closed edge to edge, came apart under their hand, and looked broken.

Moving one tile kept the whole width, the gaps with it, and nothing closed them again. A person who had only tried the arranging once had a front page with bands of empty cells from then on, and the one way back was to give up everything they had arranged.

On a grid of six columns the composed page itself left cells empty. A lead that comes four cells wide leaves two columns, the projects followed it there, and three icons took three of eight cells. The widgets after the lead stood under it two to a row, each three cells wide, which is no size either.

Closing the page up from the sizes alone was tried when the page was first composed, and rejected: the lead shrank to a strip and the projects grew to cards, so that the page closed by becoming another page. What follows closes what a person arranges, and leaves what they look at composed.

## Decision

1. **Arranging starts from the page closed up**, where the composed page draws a tile at no size of its own. The tiles stand in the page's order, the widgets placed at the top, the projects, the widgets placed at the bottom, each at the first room reading from the top. A widget has the size the composed page told it, or another of the sizes it comes in that takes no cell from it, where the rows close with that: a widget is given room, and none is taken from it. Of the ways to close, the one that leaves the fewest cells empty stands, then the one that changes the fewest sizes, then the shortest page; where no size closes the rows, the sizes told stand, packed.
2. **The projects stay as they are.** An icon is not made a card to fill a row. What is empty is counted in the rows the widgets take: the projects' last row may end short, as on the composed page, and a row of icons under the widgets is no gap.
3. **Where the composed page stands every tile on whole cells, at a size it comes in, arranging starts on those very cells** and nothing is closed up: the projects alone, a lead alone with the projects beside it, and a narrow grid as point 5 composes it. The page and its arranging do not differ there, whatever cells stand empty beside a lead.
4. **A page being arranged can be closed up.** A button beside the one that puts the page back as composed closes the width at hand by the rule of points 1 and 2, from the tiles in the order they are read and the sizes they have, a project a person made a card staying a card and no widget made smaller. It is offered only where it would move something. Done keeps what it did, and Cancel lets it go, as any change.
5. **Beside a lead that leaves columns stand the widgets that fit there, then the projects.** Where the lead stands at a size of its own and leaves columns, the widgets after it stand in those columns in their order, each at the largest of its sizes that is as wide as the columns, one under the other and no lower than the lead reaches, and none after the first that has no such size. The projects take the rows left beside the lead, then go across the page below it. A widget that does not stand beside the lead stands below, two to a row, as before.

## Consequences

- **A person who starts to arrange a page sees it settle onto the grid, closed where its sizes allow.** On twelve columns a lead that comes eight cells wide takes them with the two widgets beside it in the four left, one under the other; three widgets that come four cells by four stand side by side; and the projects take a row of their own under them: the composed page's order, on sizes the tiles come in.
- **A tile may move further than half a cell when arranging starts**, where the composed page drew it at no size of its own. The tiles keep their place in the document, so no frame loads again.
- **A widget may be given a larger size than the composed page told it**, always one it declared, and never a smaller one: a page whose rows no size closes keeps the cells it cannot fill.
- **A page kept with gaps before this stays as it was kept** (ADR-0082, point 5: what a person arranged is theirs) until its person asks for it to be closed.
- **On six columns two small widgets stand beside a large lead**, and the page nobody arranged has no empty column there. A widget that comes no narrower than four cells stands under the lead as before, and the projects beside it.
- Nothing stored changes shape, and `HomeGrid` keeps its props. A language pack of one's own gains the word `home.tidy`.
- **Rejected:**
  - composing the page from the sizes alone, so that the page and its arranging were one: the page a person first meets would give up its lead half the page wide for whatever the sizes close on, which is what ADR-0082 set out to end;
  - making the projects cards where that closes a row, as a width nobody arranged is closed: a person who pressed the button to move one tile would find their icons turned into cards;
  - closing a kept page up of itself, when a tile leaves or a widget arrives: a gap may be what the person meant, and a page that rearranges itself is no longer theirs. The button is there for when it is not;
  - letting a widget take a smaller size where that closes the rows: a lead four rows high beside three icons scores better two rows high, since a strip takes fewer rows to count the empty cells in, and three widgets two rows high close a row of twelve as well as a lead eight wide does. The page a person looked at would have lost its lead the moment they began to arrange it.
