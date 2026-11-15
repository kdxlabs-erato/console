---
"@skillcdn/console": patch
---

Breaking: the command reads a pack with the reads of the `skillcdn` command itself (ADR-0124), and a long skill comes in parts.

- `console skill <path>` prints a skill of more than 28,000 characters in parts, so that the host running your agent shows each part whole: a host may save a longer output to a file and show only its start. A part says at its head that the skill's context is incomplete, and ends with the command that prints the next part, `console skill <path> --cursor <cursor>`, and a line that says to run it now, with `--project`, `--url` and `--account` as you gave them. Read every part before using the skill. A skill that fits is printed whole, as before, and `--json` carries it whole.
- `console skill --file <path>` prints a page of 24,000 characters, ended at the end of a line, unless `--limit` says otherwise, which a host shows whole too. `--json` carries the page the API gives, 40,000 characters unless `--limit` says otherwise.
- A plugin's skills are printed with the plugin's own commands named in them, `console plugin <key> skill` and `console plugin <key> skills`; they named the project's.
- `console skills --rows` and `--code` ask the console what the pack is before they read, one request more; what they print is the same.
- A number out of its range is said as `skillcdn` says it: `--limit takes an integer between 1 and 200`, without the value after it.
- `@skillcdn/cli` is a dependency of the package now, for those reads: an install is some 10 MB larger, since that package declares what its own command serves a pack with. The command alone imports it; nothing of it reaches a console you build from the package.

Nothing changes in the REST API, and the command reads a pack through a console of 0.5.0 as before.
