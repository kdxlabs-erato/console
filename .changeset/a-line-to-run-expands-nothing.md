---
"@skillcdn/console": patch
---

The lines the command prints for an agent to run expand nothing in a path, in bash or in PowerShell. The command that reads the next part of a skill, an outline's `--rows` and `--code` lines and the `cd` that `console-plugin init` says next quoted a path in double quotes, inside which both shells expand `$`, a backtick and `$(...)`: `console skill 'skills/$(x)/SKILL.md'` ended with a line that ran `x`. A path is now as it is where neither shell reads anything of it, in single quotes otherwise, and in double quotes where it holds a single quote and nothing either shell reads there; for a path with a single quote and a `$`, a backtick, a double quote, a backslash or a `!`, which no one spelling keeps whole in both, no line is printed, and the command says why and what to run.
