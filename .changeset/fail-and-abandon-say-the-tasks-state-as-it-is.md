---
"@skillcdn/console": patch
---

`console fail` and `console abandon` say the state the task is in, read from the console once the run is over: `Run <id> failed; task #<n> is in_review now.`, `Run <id> abandoned; task #<n> is ready now.` They said unasked that the task was up for review, or back as the take found it, which a console of 0.5.0 does not do, nor one of 0.5.1 where a person moved the task meanwhile or another run is open on it: the task is `in_progress` still there, and the command now says so. One request more (`GET .../tasks/<id>`), not made on `--json`, which stays the run as the console answered it. Where the task could not be read, standard error says that the run is over and is not to be ended again, then what the reading ended on, and the command exits with `1`.
