---
"@skillcdn/console": patch
---

Breaking: setting a machine up for an agent account gives the machine its least, and leaves the rest to the agent ([ADR-0140](https://github.com/skillcdn/console/blob/main/docs/adr/0140-a-machine-is-given-its-least-and-the-agent-does-the-rest-itself.md)). What changes for whoever runs or builds on it:

- **The invitation's line** now reads "Set this machine up for an agent account. Install what is missing yourself, without asking: ... Ask me only for a sign-in or an administrator's password." A language pack of one's own writes `agents.page.settings.machine.made.line` anew.
- **`console agent setup` looks at the machine before anyone signs in**: git (on a Mac the Command Line Tools first), the command of the agent's product (`claude`, then `codex`, or the one `--driver` names), and for Claude Code Google Chrome, which its browser tool works in (`--no-browser` for an agent that signs in at no page). Everything missing is said at once, with what installs it, and the command ends there with exit 1. A script that ran the setup on a machine without these now stops before the sign-in.
- **The command prints the part of whoever prepares the machine, and no more.** `setupGuideText` prints the sections whose `who` is `operator`, and the section `machine` is one of them now; the guide's page and `--json` carry it whole. The steps of the guide changed: nothing offers to type what an account signs in with, and no password is to be written in a chat.
- **A setup ends by handing over**: whether the agent's first session began, where to watch it, its first task, and that the machine's part ends there.
- **`runner.json` takes `"browser": "chrome"`**, which starts Claude Code with its browser tool (`--chrome`); a new desk names it where the browser was found, and names the driver of the product found.
- **A desk the setup writes or clones is a repository whose git reads `git.token` from the account's store** for the workspace's git host, in place of the machine's own credential helpers. A desk that is there is left as it is.
- **`console secret <name> --set` and `console agent secret` say when a value does not look like what its name holds** (`slack.app_token`, and `git.token` at GitHub or GitLab), or holds a space. The value is kept all the same, and never said.

The skill `running-an-agent` is rewritten for this, and is shorter.
