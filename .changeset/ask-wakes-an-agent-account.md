---
"@skillcdn/console": patch
---

`console ask` does not wait at the terminal where the command is signed in as an agent account, unless `--wait` is given: nobody attends an account, and the answer wakes it. It says so, with the run to go on with when the answer comes, where it told an attended agent to keep waiting, and exits with `3` at once. A person's agent waits as before.
