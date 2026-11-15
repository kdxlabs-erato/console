---
"@skillcdn/console": patch
---

A person has a desk too (ADR-0115, ADR-0117): a folder of their own that their agent begins in, with the instructions of an agent that works for them, their projects checked out under `work/`, and what should outlive a session or a machine. It has no runner and no `runner.json`, and is bound to no project. It is named as an agent account's is: the folder is `desk`, and the repository `<account>/desk` at the person's own git account.

- **`console desk [<directory>] [--web]`** writes it for the person the command is signed in as: `README.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore` and `records/README.md`, each only where no file of that name is there, into `desk` in the current directory or the directory named. `--web` also writes the shell of the desk's pages into `web/`: the person's own extension of the console's pages, on the command's version of the package. Its last line is the sentence to say to an agent in that folder, which has the desk set up as a repository with the skill for that in the organization's pack. Refused for an agent account, whose desk `console agent setup` settles, and under a directory that works in a project.
- **The template:** `@skillcdn/console/runner` exports `personDeskFiles`, the person's files, with `DESK_FOLDER`, the folder a desk is made in, and `deskWebTitleOf`, the title the shell of its pages is given.
