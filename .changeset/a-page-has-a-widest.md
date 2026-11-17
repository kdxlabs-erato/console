---
"@skillcdn/console": patch
---

Breaking: a page is at most a hundred rem wide, `--sc-width-page`. In a window wider than about 1780 pixels `--sc-gutter` grows to take what is over, so the header, the tabs and the page keep one edge and a plugin's frame is bounded with its page. A page that wants the whole window, the board, the calendar, a goal's board or a page that says it is wide, keeps the gutter a wide window had, now `--sc-gutter-wide` (ADR-0136).
