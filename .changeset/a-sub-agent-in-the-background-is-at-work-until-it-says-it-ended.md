---
"@skillcdn/console": patch
---

An agent's page shows a sub-agent that goes on in the background as at work until it has ended (ADR-0161). Claude Code starts a sub-agent in the background unless it is asked to wait: the call is answered at once and the agent ends its turn while the sub-agent works on. The page read such a sub-agent as done from that answer, and listed who is at work only while a turn was under way, so an agent whose sub-agent worked for an hour looked idle. What the sub-agent did was on the record all along, under its call.

The `claude` driver now says two things more of a sub-agent, from the product's own stream: `background: true` on the answer of a call whose sub-agent goes on, and a `status` event of the sub-agent's that says how it ended, under `over` (`completed`, `failed` or `stopped`), for a sub-agent in the foreground too. The page reads a sub-agent in the background as at work until that event, whatever turn ended meanwhile, and as ended where its session ended first; the conversation's foot says how many sub-agents are at work with no turn under way too; and where the events read hold what a sub-agent did and not the call that started it, the page reads the events before, a few steps back, so that a sub-agent that has worked for long is read under its call.

A session recorded before reads as before, and so does one of the `codex` and the `acp` driver, which say neither. A driver of your own says the two facts where its product does; `DriverEvent` is unchanged.
