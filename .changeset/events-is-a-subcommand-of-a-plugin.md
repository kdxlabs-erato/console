---
"@skillcdn/console": patch
---

Breaking: `events` is a subcommand of `console plugin <key>` (ADR-0128), so no command or query of a plugin may be named `events`: `definePlugin` refuses one, `console-plugin check` says so, and a console of this version does not load a plugin that has one. Rename the command or the query; none of the plugins published beside the console has one.
