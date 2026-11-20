---
"@skillcdn/console": patch
---

A runner takes its `runner.json` as it changes, and says how its wake sources stand ([ADR-0144](https://github.com/skillcdn/console/blob/main/docs/adr/0144-a-runner-takes-its-runner-json-as-it-changes-and-says-how-its-wake-sources-stand.md)). An agent that added a wake source to its `runner.json` was not woken by it until someone restarted the service on its machine. The runner now looks at the file with every heartbeat: one that reads and changed is taken between two turns, in the same process and with the same conversation; one that does not read changes nothing, and the agent is told what is wrong with it.

Each wake source says whether it is `connected`, `waiting` or `failing`, and why. The heartbeat carries that as `sources`, the console keeps it, and the account's page and `console agent <handle>` show it. A console before this version ignores the field, and a runner before it says none.

For whoever builds on the package: `createRunner` takes `reconfigured`, and `run()` may answer `"changed"`; a `WakeHost` has `stands(state, why?)`, which a wake source of one's own may call and a host of one's own, in a test say, has to have; `restAgentRunnerSchema` reads an optional `sources`.
