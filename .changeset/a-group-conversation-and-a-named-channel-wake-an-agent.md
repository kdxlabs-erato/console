---
"@skillcdn/console": patch
---

Breaking: the `slack` wake source wakes an agent account for what a person says in a group conversation it is in, whether the message names it or not, as a direct message does: an account that is in group conversations begins a turn for every message a person writes there, from its runner's next start. A channel wakes it the same way once the desk's `runner.json` names it: `"channels": ["C0123ABCD"]`, by the ids the messenger gives its channels, capital letters and digits, fifty at most; a channel's name there is refused with the file, since nobody would be listened to by it. What an app posted there wakes nobody unless it names the agent, and every other channel wakes the agent only by a mention, as before.

A `runner.json` that names no `channels` reads as it did. A wake source of your own is handed the list as `host.channels`.
