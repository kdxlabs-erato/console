# ADR-0138: A progress bar is drawn as a share is, in the series' green and blue

- Status: Accepted
- Date: 2026-11-17
- Adds to [ADR-0123](0123-charts-are-parts-placed-by-measures-and-drawn-by-the-stylesheet.md) and [ADR-0134](0134-the-coral-is-the-second-colour-of-a-series-and-a-calmer-one.md): the progress bar, which was no part of the charts, is drawn in their colours.

## Context

The progress bar is older than the charts. It drew what is done in the tone for success, `#146b44`, and what is at work in the accent, `#2c5bc4`, the two touching. The charts draw in the six colours of a series, whose green is `#04933e` and whose blue is `#285fd4`, and a share parts its colours with a gap. So one page showed two greens and two blues that were nearly, and not, the same: a goal's bar beside a chart of the same goal's tasks, and a list of bars that says done in the series' green, as the parts' page shows one, beside a progress bar that says it in the other. A plugin that draws a bar of its own on the progress bar's track took a third blue, the accent's solid.

## Decision

1. **A progress bar is a share of two parts.** What is done is drawn in `--sc-series-6`, the green, and what is at work in `--sc-series-1`, the blue; what is not begun is the track.
2. **A gap parts the two**, two pixels, as a share's parts are parted. A part of nothing is not drawn, so that no gap stands at the bar's edge.
3. **A bar a plugin draws on the track takes the series' colours too.** The reference plugins' do.

## Consequences

- The green and the blue of a page are one green and one blue wherever a bar or a chart draws them. The tones for success and the accent stay what words, badges and controls wear.
- The bar is brighter than it was: the series' colours are picked to stand out as marks, where the tones were picked to carry words.
- `ProgressBar` renders one element fewer for a part of nothing: a patch whose entry says so first.
- Rejected: the bar in the tones, and the charts' green and blue moved to them (the six were picked together and checked pair by pair, and moving two of them undoes that); a colour for each of the board's states (five parts in half a rem read as noise, and the figures beside the bar already say them).
