---
"@skillcdn/console": patch
---

Breaking: the Korean pack writes a particle in the form its word takes where it wrote both forms, in the feed, a task's history, a decision's lines and the plugins' settings; a Latin word is read as a loan word is, which is a guess. A small label is cased by the new `--sc-label-case`, `uppercase`, and `none` on a page in Korean, so a Korean label no longer has its Latin words alone in capitals. A task has one word in Korean. `projects.members.since` of a language pack is the words before and after the moment, `{ before, after }`, where it was one word before it: a console with a pack of its own gives the two (ADR-0137).
