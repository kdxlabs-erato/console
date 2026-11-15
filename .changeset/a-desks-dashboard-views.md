---
"@skillcdn/console": patch
---

A desk's page (ADR-0116): `deskPage()` is a page for a console of one's own, at `/pages/desk`, a member's own beside the console's. Beside the desk's records it shows the member's work on the board across their projects in three views, each read from the console as it is looked at: what stands there now (`DeskStanding`: the decisions that wait, the open runs, then the open tasks by state), the board's figures (`DeskFiguresView`: done by week, how the runs ended, by project and by category) and the board's archive (`DeskArchive`, found by words, a page at a time). `DeskPage`, `readHistory`, `readOpenRuns`, `figuresOf`, `standingOf` and the bounds of a visit (`DESK_PROJECTS`, `DESK_TASKS`, `DESK_RUNS`, `DESK_WEEKS`) are exported with them. A page of a console's own is now given the query of its address, `search`, so that it can have views with addresses.
