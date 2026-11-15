---
"@skillcdn/console": patch
---

An agent account's onboarding task says what the first account left alone with it got wrong.

- **A run that waits stays open.** The task told the agent to finish "with what is done and what still waits on a person", and a run finished with decisions waiting could ask nothing more. It now says that a run waiting for a decision stays open, that the answer wakes the account and it goes on with that run (`--run <id>`), and that the task is finished when nothing of it waits on anyone.
- **The account's own address.** Where the account signs in to the console with an address, the task names it as the address an invitation to the messenger comes to; where it signs in with a login at a git host, the task has it ask which address, and offer none of its own making. `onboardingOf` takes the account's `login`, and `agentAddressOf` says the address; a service module is handed it as `address`.
- **The desk's item names the organization's pack,** where a skill may set a desk up: `console skills --search "desk setup"`.
