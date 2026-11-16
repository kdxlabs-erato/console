# ADR-0134: The coral is the second colour of a series, and a calmer one

- Status: Accepted
- Date: 2026-11-16
- Amends point 4 of [ADR-0123](0123-charts-are-parts-placed-by-measures-and-drawn-by-the-stylesheet.md) (six colours for a series): its order and two of its values. The checks the six are held to are unchanged.

## Context

ADR-0123 chose six colours that pass its checks and gave them in the order blue, teal, raspberry, coral, violet, green. Charts use the first colours most: a chart of two series draws in the first two, one of three in the first three. The first two, the blue and the teal, were 17.8 apart to full colour vision, 17.8 under protanopia and 16.5 under deuteranopia (distance in OKLab, times a hundred), where the blue and the coral were 37.5, 22.4 and 32.8; the first three came to 9.0 under deuteranopia, the teal beside the raspberry. And the coral, `#fa4655` at a chroma of 0.215 where the other five are 0.11 to 0.19, was the loudest mark wherever it was drawn.

## Decision

1. **The order is blue, coral, raspberry, teal, violet, green.** The coral and the teal change places: `--sc-series-2` is the coral and `--sc-series-4` the teal.
2. **The coral is calmer: `#e45b63`**, at a chroma of 0.17. With the other five as they were, the only calmer coral that passed every check was a dusty rose at 0.10; one at 0.13 to 0.17 keeps 15 from the raspberry to full colour vision only with the raspberry a little deeper, so:
3. **The raspberry is a step deeper: `#bf1b7f`**, 2.4 from `#bb2b76`.
4. **The checks are ADR-0123's.** Any two of the six are 15.2 or more apart to full colour vision and 8.1 or more under protanopia and deuteranopia, and each is 3:1 or better against the light grounds and a dark one.

## Consequences

- The first two, the blue and the coral, are 33.3 apart to full colour vision, 21.2 under protanopia and 30.2 under deuteranopia; any two of the first three are 15.2, 14.5 and 14.5 or more.
- A plugin that drew with `--sc-series-2`, `--sc-series-3` or `--sc-series-4` draws its series in the new colours: a patch whose entry says so first.
- The coral is 11.1 from the point and 14.9 from the danger tone to full colour vision; a page still says good and bad in words and tones, never by which series a thing is.
- Rejected: a new set of six (the checks leave the same families of hue, so a new set changes the look and not how well it reads); the teal second (the closest pair of the first three stays at the front); the coral as it was (the loudest mark of a chart would be whatever is second).
