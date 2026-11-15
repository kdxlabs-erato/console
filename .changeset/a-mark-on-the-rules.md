---
"@skillcdn/console": patch
---

`console rules` and `console take` print the rules under a first line that says what follows (ADR-0119): `Rules <mark>:`, which parts there are and how many characters each is, the project's own or that it has none, its plugins, the workspace's. The project's own rules and the plugins' lines now stand before the workspace's, since they are short and differ by project; the separate line "Rules of this project: none of its own" is gone, the first line says it. `console take <number> --rules <mark>` leaves the rules out where the mark is the one they have, with a line in their place, and prints them whole, saying so, where a rule changed since or the mark is of another project's; without it a take prints them whole, as before. `--json` carries the rules either way and gains `mark`.
