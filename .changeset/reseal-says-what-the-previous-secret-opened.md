---
"@skillcdn/console": patch
---

`migrate reseal` says how many values the previous secret opened, and says so in words where it opened none. A secret given as `AUTH_SECRET_PREVIOUS` that is not the one the deployment had opens nothing, and the step answered `left: 0` as a finished rotation does, which read as leave to take the real secret out. The line `sealed again` now carries `openedByPrevious`, and where that is `0` while some values open with neither secret, a second line follows, `the previous secret opened no value`, saying to check that `AUTH_SECRET_PREVIOUS` is the old secret, given in the same form the old one was, before it is taken out. The exit codes are as they were. `deploy/README.md` "Rotating the secret" and the skill `deploying-a-console` say the same.
