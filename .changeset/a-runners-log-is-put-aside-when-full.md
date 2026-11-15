---
"@skillcdn/console": patch
---

On Windows the runner's log is bounded. The task's shell adds the runner's lines to `runner.log` as before, and now puts the log aside when it holds four megabytes, as `runner.log.1`, keeping three put aside and letting the oldest go: sixteen megabytes at most, where the file grew for as long as the machine ran. A machine set up before takes it once its files are written again, `console agent setup --refresh` in the desk, and its task is started anew.
