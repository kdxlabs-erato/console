---
"@skillcdn/console": patch
---

Breaking (the colours of a series, below): charts, as parts of the console's look, for a page of a desk and a plugin's page alike ([ADR-0123](https://github.com/skillcdn/console/blob/main/docs/adr/0123-charts-are-parts-placed-by-measures-and-drawn-by-the-stylesheet.md)).

- **Eight parts** in `console.css`, each with its row in the catalogue (`src/styles/README.md`): `stat`, `bars`, `chart`, `spark`, `share`, `legend`, `figures` and `series`, the colour a series is drawn in.
- **Their components**, exported from `@skillcdn/console`: `Stat` and `Stats` (a figure with its name, its change and its run), `BarList` (a ranking or a comparison), `Chart` (columns or lines over time, one to a few series against one scale), `Sparkline`, `ShareBar` (one whole in its parts), `Legend` and `FigureTable`. Each takes its figures as props, says what it shows to a reader who cannot see it, and is as wide as where it is put; the README's "Charts" has their props and which is for what.
- **`@skillcdn/console/charts`**, a new entry with no dependency: the measures the charts are placed by (`chartLayout`, `chartScale`, `columnOf`, `barLengths`, `shareParts`, `sparkPoints`, `labelStep`, `labelledPoints`, `seriesClass`, `chartMeasure`), for a plugin's plain bundle. A measure is an attribute of an SVG and never a style, so the charts are drawn in a plugin's frame as on a console's page.
- **Breaking: the colours of a series have other values.** `--sc-series-1` to `--sc-series-6` are now blue, teal, raspberry, coral, violet and green, chosen so that any two of them are told apart, also by a reader who does not tell red from green, and so that each stands out on a light ground and on a dark one. Slots 2, 3, 4 and 6 are another hue than before (they were orange, green, ochre and teal); a plugin that drew with these tokens is drawn in the new colours.
