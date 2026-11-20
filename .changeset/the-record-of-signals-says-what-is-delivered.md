---
"@skillcdn/console": patch
---

`console agent signals` says of each signal whether it is delivered. The account's line said how many were, `3 of 4 delivered`, and the record did not say which one waits. `GET /api/v1/agents/<handle>/signals` and `GET /api/v1/agents/me/signals` now answer `delivered` beside the page (`restSignalsSchema`, optional), the number of the last signal delivered with every one before it, as the account's runner last said, and the command writes `delivered` or `waiting` on each line. A console before this one leaves the number out, and the command then says nothing of it.
