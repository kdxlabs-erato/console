---
"@skillcdn/console": patch
---

The ready page of a desk, `deskPage()`, draws its figures with the charts ([ADR-0123](https://github.com/skillcdn/console/blob/main/docs/adr/0123-charts-are-parts-placed-by-measures-and-drawn-by-the-stylesheet.md)). What it shows is as it was.

- **A collection's results** (`DeskCollectionResults`): each metric and each ratio in all is a figure, a metric's with the run it came by; one metric the member picks is a chart by week, which carries its figures as a table for a reader who cannot see it; what did best is a ranking in bars, each item with its status and its figure.
- **An item** (`DeskItemView`): its figures in all are figures, and its figures by day a table, a column a metric.
- **The board's figures** (`DeskFiguresView`): what was done by week is a chart of columns; how the runs ended, and what was done by project and by category, are bars with their figures in words.
- `BarList` and `FigureTable` take for a row's name what the page shows for it, a mark with a name or a badge, told apart by the row's `id`; `Chart` takes `figures="beside"` where the page shows the chart's figures itself, in a table.
