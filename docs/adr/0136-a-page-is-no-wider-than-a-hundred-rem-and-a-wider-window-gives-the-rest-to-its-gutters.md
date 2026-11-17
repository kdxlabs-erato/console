# ADR-0136: A page is no wider than a hundred rem, and a wider window gives the rest to its gutters

- Status: Accepted
- Date: 2026-11-17

## Context

The gutter at the sides of the header, the tabs and every page grew with the window up to ten rem and stopped there, so a page had no widest: in a window of 2560 pixels it was 2300 wide. What stretches with its container stretched with it, a table's three columns standing at the left of an empty row and an editor's line running to some 1900 pixels, and what has a width of its own, a card, stood at the left of a pane that was mostly empty. A plugin's frame is as wide as the page, so a plugin's pages did the same.

## Decision

1. **A page is at most `--sc-width-page` wide, a hundred rem.** A window wider than that gives what is over to the gutters: `--sc-gutter` is the larger of the gutter a window had before and half of what the window has beyond a page's width.
2. **The header, the tabs and the page keep one edge**, since all three are inset by the one gutter.
3. **A page that wants every bit of the window keeps the gutter it had**, `--sc-gutter-wide`: the board, the calendar, a goal's board, and a page of a console's own or a plugin's that says it is wide. Under such a page the header and the tabs are as wide as it.

## Consequences

- Nothing changes in a window up to about 1780 pixels wide, where a page between its gutters is a hundred rem or less.
- A plugin's frame is bounded with the page it stands in, with nothing for the plugin to do.
- `--sc-gutter` has another value in a wide window, and two tokens are new: a patch whose entry says so first.
- Rejected: a widest for each part (every table, editor and grid of cards would name one, and the next part would forget to); the page centred at the width of its prose (a list of cards, a table and a form beside a list use the room up to a hundred rem well); a wide page bounded too (a board's columns are what a wide screen is for).
