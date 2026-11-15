---
"@skillcdn/console": patch
---

A command on a run (`report`, `hand-in`, `ask`, `finish`, `fail`) that finds no open run begun with its own token now looks for the open runs of the same person in the project, begun through another of their agents or before the command was signed in again, and names them in `run.none`: the id, the task, the agent it was begun through and when it was last heard from, with `--run <id>` to go on with one. It said only to take a task, which would have ended such a run, one waiting for a decision included. With none of the person's open, the words are as before. `console runs --mine` says whose its listing is, the runs begun through this agent, and how the person's others are listed, where it printed `No runs.` beside a run of theirs.
