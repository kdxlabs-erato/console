---
"@skillcdn/console": patch
---

The lists of tasks and of runs have a brief form: `GET /api/v1/projects/<key>/tasks?brief=true` answers the tasks without their bodies, and `.../runs?brief=true` the runs without their reports, counted in `reportCount`. The client has `taskBriefs` and `runBriefs` for them, with `restTaskBriefsSchema`, `restRunBriefSchema`, `restRunBriefsSchema` and `reportCountOf`. The command asks for the brief form wherever it prints a line a task or a run (`tasks`, `runs`, `task`, `goal`, and the look for the open run every command on a run makes), and whole on `--json`; a desk's pages read their board views in it (`DeskReader` is `taskBriefs` and `runBriefs` now, and `DeskRun` carries a run without its reports). A console from before this version ignores the word and answers whole, which reads the same.
