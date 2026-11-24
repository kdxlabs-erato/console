---
"@skillcdn/console": patch
---

`console agent invite <handle> --out <path>` writes the invitation's line to a file and prints no code. What a command prints under an agent stays in that agent's record, so an agent that supervises an agent account can now make its invitation and hand the line to whoever prepares the machine without reading it: the file is the body of a decision (`console ask --file --to`), an attachment of a comment (`console comment --attach`), or a file at the messenger, and never a comment's own words, which the command prints back. The path is tried before the invitation is made, so that one that cannot be written makes no invitation, and the file is written for its OS account alone to read. Without `--out` the command prints what it printed before.

The path is tried before the invitation is made, and the try takes nothing away of what is at it: where no invitation can be made, the line of the one before is still in its file.
