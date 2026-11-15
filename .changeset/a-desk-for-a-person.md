---
"@skillcdn/console": patch
---

A person has a desk too (ADR-0115): a repository of their own with the instructions of an agent that works for them, their projects checked out under `work/`, and what should outlive a session or a machine. It has no runner and no `runner.json`, and is bound to no project.

- **The template:** `@skillcdn/console/runner` exports `personDeskFiles`, the four files of a person's desk (`README.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`), with `deskFolderOf`, the folder it is made in (`<handle>-desk`, from the login), and `deskWebTitleOf`, the title its dashboard's shell is given.
