---
"@skillcdn/console": patch
---

An agent account's desk says what lets a session, and a subagent it starts, begin a task at once (ADR-0115). The `AGENTS.md` that `console agent setup` writes now says that the desk is bound to no project, so that a board command run there names one (`--project <key>`) as a wake does; that a project's repository is cloned under `work/<name>` and its `AGENTS.md` read before the first change there; and what a subagent is handed, the task by its number and its project, the checkout and the skill `working-the-board`, with the run taken once and named on every command after. It names the workspace as it is called, which read doubled where that name ends in Console.

A desk that is there keeps its `AGENTS.md`, under `console agent setup --refresh` too: an account set up earlier writes the lines in itself.
