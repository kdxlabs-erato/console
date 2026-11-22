---
"@skillcdn/console": patch
---

`console skill` says how far a skill goes on, and where it ends. A part that is not the last says how many pages of the skill follow it, where the pack counts them (SkillCDN 0.6.1): `3 more pages of the skill follow this part.`, before the console's words that the part stops in the middle and that the next command is run now. The last part of a skill read in parts ends with `The skill is complete: this was its last part.` A reader told how many pages follow reads a skill to its end far more often than one told only that it continues, which SkillCDN 0.6.1 measured of its own pages; the console's parts now say the same of theirs. `console plugin <key> skill` prints a plugin's skill the same way.

Fixed with it: a skill of three or more pages that one command printed whole, as a skill in Korean of some forty kilobytes is, ended with the words of a part that goes on, "This part stops in the middle of the skill ... Run that command now", under a skill that was complete and over no command to run. The line was taken from a run of pages the command had tried on the way and not from what it printed.
