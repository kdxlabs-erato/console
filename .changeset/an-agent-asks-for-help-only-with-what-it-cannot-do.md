---
"@skillcdn/console": patch
---

An agent account's first task always says how help is asked ([ADR-0152](https://github.com/skillcdn/console/blob/main/docs/adr/0152-an-agent-does-everything-it-can-itself-and-asks-for-help-only-with-what-it-cannot-do.md)). "What you ask for" is there whatever the workspace's services are, and begins with the one rule: "Do everything you can yourself, and ask for help only with what you cannot do." Until now the section was written only where a service may leave the account without something, so an account whose services ask for nothing was told nothing of asking. `onboardingOf` writes it; what a task lists under it is as before.

The desk an agent account is set up with names what the agent cannot do first among what it asks as a decision, of whoever can do or decide it. A desk written before keeps its `AGENTS.md`: its account adds the words itself.
