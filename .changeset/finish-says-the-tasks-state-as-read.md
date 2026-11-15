---
"@skillcdn/console": patch
---

`console finish` says the state its task is in, read once the run is over (`Run <id> finished; task #<n> is in_review now.`), as `fail` and `abandon` do, where it said the task was up for review without asking: a finished run leaves its task at work where another run is open on it.
