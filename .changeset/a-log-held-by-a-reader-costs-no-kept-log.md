---
"@skillcdn/console": patch
---

On Windows, reading the runner's log while the runner writes it no longer costs the logs put aside. A full `runner.log` held open by whatever read it, `Get-Content -Wait` say, could not be moved, and every line the runner wrote meanwhile let one more of `runner.log.1` to `runner.log.3` go until none was left. The task's shell now moves the log first, to `runner.log.0`, and moves the ones put aside only once that worked: a log that is held is added to as it is and put aside when it is let go. A machine set up before takes it once its files are written again, `console agent setup --refresh` in the desk, and its task is started anew.
