---
"@skillcdn/console": patch
---

A plugin's frame is a whole number of pixels wide and tall. A tile of the front page follows the cells of its grid, which are no whole pixels, and a frame's document is laid out on whole ones: it took a box of 598.5 pixels as 599, half a pixel of its right edge was cut, and a border a widget drew there showed half as thick as on the left. The frame is now the next whole pixel down each way, a widget's and a page's alike, where the browser rounds a measure (`round()`, which the three engines have); where it does not, nothing changes. A plugin that left a pixel of room at its edges for this may keep it.
