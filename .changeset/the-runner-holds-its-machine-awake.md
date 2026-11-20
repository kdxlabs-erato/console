---
"@skillcdn/console": patch
---

A runner holds its machine awake while it runs. An agent account's machine with nobody at its screen went to sleep when idle, and the agent was not heard from. `console runner` now starts the system's own helper for as long as its process is there: `caffeinate` on macOS, the system's request to stay awake held by a small script on Windows, `systemd-inhibit` on Linux. It needs no administrator and changes no setting of the machine. The runner's own lines say whether it holds ("the machine is kept from sleeping while the runner runs"), and `console agent setup` ends by saying so, asking the system on macOS, with what is left to whoever keeps the machine: a sleep someone asks for, a lid that is closed, and logging the OS account in after a restart. An account set up before gets this with the update of the command, with nothing to do. The helper for Windows was run on Windows 11; those for macOS and Linux were not run on a machine yet.
