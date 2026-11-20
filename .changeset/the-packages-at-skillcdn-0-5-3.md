---
"@skillcdn/console": patch
---

The command is built on SkillCDN 0.5.3. A long skill read with `console skill` still comes in parts, and a part after the first now begins under the skill's name, its source and its license alone: the description and the lists of its files and of what it refers to are printed once, with the first part, where every part repeated them before. Where a part ends inside a file of the skill the place is marked `(Continues in the next part.)`. The line a part ends with, and the console's own words under it that the next command is run now, are as they were. A console that reads its pack from a directory finds a name joined by capitals by its words too, as SkillCDN 0.5.3 reads one.

The image is built on the release of its HTTP framework that holds a request's body to its limit however it is sent: a body sent in very many small pieces was kept piece by piece, and a request within the limit could take far more memory than its size. Every route of the console that reads a body is behind that limit, a plugin's own endpoints among them, so a console is updated to this image rather than left on the one before.
