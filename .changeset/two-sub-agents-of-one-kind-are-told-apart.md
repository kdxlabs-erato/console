---
"@skillcdn/console": patch
---

Two sub-agents of one kind at once are told apart in a session's transcript. Under the `claude` driver a sub-agent was called by its kind alone where the call named one, so two `Explore` sub-agents were both "Explore" on the agent's page; it is now called by its kind and what the call says it is for, the kind first (`Explore: Read src/ of acme/web`), within the 80 characters the name keeps, and by the one of the two where the call names only one.
