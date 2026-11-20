---
"@skillcdn/console": patch
---

An agent account wakes itself, now or at a moment to come ([ADR-0145](https://github.com/skillcdn/console/blob/main/docs/adr/0145-an-agent-account-wakes-itself-now-or-at-a-moment-to-come.md)). `console agent wake me "<words>"`, on the command signed in as the account, raises a wake the account's runner takes as any other: for whoever prepared its machine, or signed something in there, to say so. `--in <minutes>` or `--at <HH:MM>` keeps it for later instead, one under a name (`--key`), which `console agent signals me` lists and `--cancel` takes away: for an agent that has something to look at again. A wake and nothing else, thirty within an hour and twenty kept at a time; what tells, stops or starts an agent stays its supervisors'.

The client has `raiseOwnWake`, `ownWakes` and `cancelOwnWake`, over `POST`, `GET` and `DELETE /api/v1/agents/me/wakes`; a console before this version has no such route, and the command says so.
