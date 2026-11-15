---
"@skillcdn/console": patch
---

The command prints the address of a task's page and of a decision's, on a line of its own (`page: https://console.example/projects/web/tasks/12`): `console task`, `task new`, `task edit` and `take` for a task; `ask`, `decision` and `answer` for a decision, in the project the command reached it in, else at the decision's own address. An agent that tells a person of a task or a decision gives that line, in place of the console's front page. The address is made from the console's origin and the pages' routes and asked of no console; `--json` is unchanged. `console decision <id> --wait` that runs out, on a command signed in as the agent account that raised the decision, ends in the account's words, that the answer wakes it, as `ask --wait` does.
