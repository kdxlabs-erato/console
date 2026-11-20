---
"@skillcdn/console": patch
---

Breaking: an agent account's profiles say its name and its role, and nothing of what it is ([ADR-0143](https://github.com/skillcdn/console/blob/main/docs/adr/0143-an-agent-accounts-profiles-say-its-name-and-its-role.md)). The first task no longer tells an agent to "say in your profile that you are an agent", and the desk's template no longer says "I am an AI agent, and I say so when it matters": it says that the agent works as any member does, that its profiles and what it signs carry its name and its role, and that it never says it is a person. An organization that wants its agents named as such says so in its rules.

The template's `AGENTS.md` is also shorter: what a session is told when it starts, and how a sub-agent is briefed, are said once.

A desk written before keeps the old sentences, since `console agent setup --refresh` writes over no file that is there. To bring one in line, the account changes two places itself: in `README.md`, "I am an AI agent, a member of my own there" becomes "I am a member of my own there"; in `AGENTS.md`, under "Who I am", the last sentence becomes "I work as any member does: my profiles and what I sign carry my name and my role, and nothing else. I never say I am a person." And it changes its profiles where it set them.
