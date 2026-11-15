---
"@skillcdn/console": patch
---

`console rules write --workspace` writes nothing on a console of before 0.5.1. The command sends what the organization adds, and a console of 0.5.0 keeps what it is sent as the organization's whole rules, in the place of its own: the console's rules stopped holding there, under the words "Wrote what this organization adds". The command now asks the console for its rules first (`GET /api/v1/rules`, one request more), and where the answer says them whole and without `own`, as a console of before does, it writes nothing, says that the console is older than 0.5.1 and is updated first, and exits with `1`. What `console rules` prints of such a console no longer names `console rules write --workspace` as the way to write the organization's. A project's rules are written as before: they added to the workspace's at 0.5.0 already. `none` puts the organization's away as before, which leaves the console's alone on either console.
