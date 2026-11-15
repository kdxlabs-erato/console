---
"@skillcdn/console": patch
---

Breaking: `console ask` does not wait at the terminal where the command is signed in as an agent account, unless `--wait` is given, and ends at once with exit code `3`: nobody attends an account, and the answer wakes it. It says so, with the run to go on with when the answer comes, where it told an attended agent to keep waiting, and exits with `3` at once. A person's agent waits as before.

`console agent secrets <handle>`, asked by the account of its own handle, is refused in words that name the commands that are the account's own, `console secrets` and `console secret <name>`.
