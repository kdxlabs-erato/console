---
"@skillcdn/console": patch
---

An agent account's desk says what lets a session, and a subagent it starts, begin a task at once (ADR-0115). The `AGENTS.md` that `console agent setup` writes now says that the desk is bound to no project, so that a board command run there names one (`--project <key>`) as a wake does; that a project's repository is cloned under `work/<name>` and its `AGENTS.md` read before the first change there; and what a subagent is handed, the task by its number and its project, the checkout and the skill `working-the-board`, with the run taken once and named on every command after. It names the workspace as it is called, which read doubled where that name ends in Console.

Both desks' `AGENTS.md` say what a desk is for (ADR-0117): what was made and should be found again is kept under `records/`, the kinds named in the file; what is done in the desk is the member's own and on no board unless they put it there; the skill `working-the-board` is read before the first task of the board, and not for a job that is no task; the desk is never bound to a project. A person's says which language to write to them in, where the console knows one. An agent account's says that the organization's pack is looked in before a job is done by hand, that a brief names a task and does not restate it, and that scratch files go under `work/`. Each lost what an agent knows anyway.

A desk that is there keeps its `AGENTS.md`, under `console agent setup --refresh` too: an account set up earlier writes the lines in itself.
