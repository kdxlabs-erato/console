---
"@skillcdn/console": patch
---

A person has a desk too (ADR-0115): a folder of their own that their agent begins in, with the instructions of an agent that works for them, their projects checked out under `work/`, and what should outlive a session or a machine. It has no runner and no `runner.json`, and is bound to no project.

- **`console desk [<directory>] [--web]`** writes it for the person the command is signed in as: `README.md`, `AGENTS.md`, `CLAUDE.md` and `.gitignore`, each only where no file of that name is there, into `<handle>-desk` in the current directory or the directory named. `--web` also writes the shell of their dashboard into `web/`, a console of their own on the command's version of the package. Its last line is the sentence to say to an agent in that folder, which has the desk set up as a repository with the skill for that in the organization's pack. Refused for an agent account, whose desk `console agent setup` settles, and under a directory that works in a project.
- **The template:** `@skillcdn/console/runner` exports `personDeskFiles`, the four files, with `deskFolderOf`, the folder a desk is made in, and `deskWebTitleOf`, the title its dashboard's shell is given.
