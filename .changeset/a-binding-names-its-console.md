---
"@skillcdn/console": patch
---

`console use` writes the console's address into `.skillcdn-console.json` every time, where it wrote it only for a console that was not the machine's default login: a committed file with the project alone followed the default login of whichever machine read it, so that a teammate signed in to two consoles was refused, or wrote to a project of the same key at the other console. The account is written only where `--account` asks for it, or where the directory named it before, so that a committed file carries nobody's account unasked. A file from before is still read and means the default login; run `console use <key>` again in a checkout to have its file name the console (ADR-0112).
