---
"@skillcdn/console": patch
---

The Agents page says little of a desk ([ADR-0122](https://github.com/skillcdn/console/blob/main/docs/adr/0122-a-desk-is-given-its-least-and-grown-by-what-its-member-asks.md), point 6): a title, one line, and the block to tell an agent, with nothing after it.

- **The block** (`DeskWords`, which takes the console's origin as before) is "Run these in order, doing what each one says before the next:" over three commands: the command's install, `console login --url <origin>` and `console desk`. It names `console desk` alone: a desk's pages come when its member asks for them, and what follows the install is the command's to say, in its own last lines.
- **Gone from it:** `--web`, the paragraph on what a desk holds, the paragraph on what the agent does, and the words on a login that is there already.
- **The pack's words** under `desk.command` are `title`, `line` and `quote`, in English and Korean.
