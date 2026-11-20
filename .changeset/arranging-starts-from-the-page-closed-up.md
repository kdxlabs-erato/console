---
"@skillcdn/console": patch
---

Breaking: arranging the front page starts from the page closed up, and a page kept with gaps can be closed (ADR-0139). The page of someone who has arranged nothing draws a tile in a box that need not be a size it comes in, the lead half the page wide; when they pressed "Edit layout" each tile took the cells nearest that box, so on twelve columns bands of empty columns opened beside the lead and at the page's edge, and moving one tile kept them. Arranging now starts with the tiles in the page's order at the first room from the top, a widget at another of its `sizes` where the rows close with it, given room before any is taken from it, and the projects icons as they were, their own row ending short.

While arranging, "Close the gaps" closes the width at hand by the same rule, for a page that was kept with gaps before; it is offered where it would move something, and a project made a card stays one. A language pack of one's own gains the word `home.tidy`.

On a grid of six columns the page nobody arranged stands the widgets that come two cells wide beside a lead that leaves two columns, one under the other, then the projects, where the projects alone left most of those cells empty and the widgets stood under the lead three cells wide. `tidied` and `sameArrangement` are new beside `arranged` in the module of the front page's tiles.
