---
"@skillcdn/console": patch
---

A runner's line no longer says that a session's events are "kept and sent again later" where they are not: a session that ends while the console takes no more of its events within the hour, or while the console is away, is let go with what it had not sent, and the runner says how many events were let go and why (`3 events of session <id> were let go unsent when it ended: ...`).
