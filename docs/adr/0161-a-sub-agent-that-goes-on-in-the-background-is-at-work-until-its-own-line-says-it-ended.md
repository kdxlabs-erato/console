# ADR-0161: A sub-agent that goes on in the background is at work until its own line says it ended

- Status: Accepted
- Date: 2026-11-25
- Amends points 5 and 6 of [ADR-0141](0141-what-an-agent-said-is-read-as-markdown-and-a-sub-agent-under-the-call-that-started-it.md), where a sub-agent is done by its call's answer and the page says who is at work while a turn is under way, and adds two facts to those of point 4 of [ADR-0131](0131-a-signal-is-delivered-when-the-product-took-it-and-an-event-says-which-sub-agent-made-it.md). Closes what ADR-0141 left to look at once a stream of such a run was at hand. The contract is in [specs/runner.md](../specs/runner.md).

## Context

An agent account gives its tasks to sub-agents and keeps its own session free for people and the board, as its desk tells it to. Claude Code starts a sub-agent in the background unless it is asked to wait, so that is how most of an account's work is done: the call that starts the sub-agent is answered at once, the agent ends its turn, and the sub-agent works on for an hour.

A supervisor who opened such an agent's page saw the call and nothing at work, and had to ask whether anything was running. The page read a sub-agent as done by its call's answer (ADR-0141, point 5), which for one in the background is the product's word that it was started; it listed who is at work only while a turn was under way; and a sub-agent that had worked for long had its call before the events the page reads first, so that its steps stood in the session's own line.

ADR-0141 read such a run from the product's documentation, having no stream of one. One was recorded since (Claude Code 2.1.330, started as the driver starts it), and an account's record of two long runs was read. What a sub-agent in the background does comes through the session's own stream as what one in the foreground does, each line naming the call that started it (`parent_tool_use_id`), past the result of the turn that started it, and the record already held every step of both runs under their calls. What the record lacked was two words: that the call's answer is not the sub-agent's, and that the sub-agent ended.

## Decision

1. **The answer of a call whose sub-agent goes on says so.** A fact of the `tool_result`: `background: true`. The answer is then the product's word that the sub-agent was started, and not what the sub-agent answered. A driver says it where its product does: the `claude` driver, from the structured output the product writes beside the result (`tool_use_result`, whose `status` is `async_launched`).
2. **A sub-agent's own line says when it ended.** A `status` event that names the call (`parent`, with `subagent` as its other events have it) and says how under `over`: `completed`, `failed` or `stopped`. The `claude` driver says it from the product's line on the end of a task (`task_notification`), for a sub-agent in the foreground too, where it stands just before the call's answer, so that the record of the two is one shape. It knows the sub-agent by the id the product knows it by as a task, which the product's lines name beside the call. Of a sub-agent that failed it shows what the product said of why, cut after the secrets are out, as everything a driver shows a part of is. A new fact and not `ended`, which on a `status` is the session's end to every reader.
3. **A sub-agent that goes on is at work until that line**, whatever turn ended meanwhile: done, failed or stopped by it, and ended where its session ended first. One that does something after the line, as one the agent starts again does, is at work again until the next. One in the foreground stands as before: by its call's answer, and ended with its turn.
4. **The conversation's foot says who is at work with no turn under way too.** While sub-agents are at work in an open session of an agent that is running, the row stands, for them alone where the agent's own turn is over: how many, and each with what it is at, its count and its time.
5. **The page reads back for the call.** Where the events read hold what a sub-agent did and not the call that started it, the events before are read too, a few steps back at most, so that what it did is read under its call and counted at the foot. Past that it stands where it arrived, under its name, as before.
6. **Nothing changes how an agent runs its sub-agents, and nothing but the product's stream is read.** The other two drivers say neither fact, and their sessions read as before.

## Consequences

- **A supervisor sees that a sub-agent is at work, and what it is at**, at the conversation's foot and on the sub-agent's row, for as long as it works, in the background as in the foreground.
- **A session of before reads as before.** Its events are there, under their calls; a sub-agent in the background reads as done from its call's answer on, since nothing of its record says otherwise. So does a session whose runner is older than its console.
- **Where the product ends a sub-agent without a word**, it reads as at work until its session ends. The product was seen to say that one completed; that one failed or was stopped is read as its documentation has it.
- **A sub-agent whose call lies further back than the page reads** is shown by its steps where they arrive, and is not counted at the foot.
- **A runner still takes a session for idle once the agent's own turn is over**, with sub-agents at work in the background or none: a model set, an update of the command, a `runner.json` that changed, the account's own reset and a new day's conversation end such a session, and its sub-agents with it. That is no part of this decision and is to be looked at by itself.
- **Rejected:**
  - a rule that an agent waits for its sub-agents: the main session would answer nobody while they work, which is what handing work over is for, and the product's own default would have to be turned off on every machine;
  - following the file the product keeps of a sub-agent on the machine: its lines are the product's own record and no contract, a second reading beside the stream with the secrets to take out again, and the stream says the same;
  - an event for every word of the product's on a task's progress (`task_progress`): it says again, a line a tool call, what the sub-agent's own events say;
  - a count of the sub-agents at work in the runner's heartbeat: as ADR-0141 has it, the record says it as it happens.
