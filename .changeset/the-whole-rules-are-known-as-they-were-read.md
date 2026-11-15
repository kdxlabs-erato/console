---
"@skillcdn/console": patch
---

The console's rules are known in a text that carries them whole as they were read, so that only what was added is stored. `addedRulesOf`, and with it `PUT /api/v1/rules`, knew the whole only as the package keeps it: with `{language}` filled, as `console rules` prints it and a command of 0.5.0 sends it back, or with lines that end in a carriage return and a line feed, nothing was cut, and the console's rules were stored as an addition and read twice from then on. The whole is now known with any words where the language stands and with either line ending, wherever it stands in the text: what was added before it and after it is kept, without the heading. A text that quotes a sentence of the rules, or a part of them, is kept as it is.
