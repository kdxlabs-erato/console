---
"@skillcdn/console": patch
---

A session's transcript says which events a sub-agent made. Under the `claude` driver an event of a sub-agent carries two facts, `parent`, the id of the tool call that started the sub-agent, and `subagent`, what that call called it; the conversation on the agent's page shows such an event as a step under the sub-agent's name, what the sub-agent said among them, folded as a thought is, so that the agent's own words are told from what it had done for it. The `codex` and `acp` drivers' products do not say whose a line is, and their events read as before.
