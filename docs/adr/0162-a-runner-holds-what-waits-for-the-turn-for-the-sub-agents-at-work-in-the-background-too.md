# ADR-0162: A runner holds what waits for the turn for the sub-agents at work in the background too

- Status: Accepted
- Date: 2026-11-25
- Amends [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md), by which a model chosen is taken and a new day's conversation begun when no turn is under way; [ADR-0101](0101-a-runner-ends-for-an-update-of-its-command-and-its-service-starts-it-again.md) and [ADR-0144](0144-a-runner-takes-its-runner-json-as-it-changes-and-says-how-its-wake-sources-stand.md), by which the runner ends for an update and for its `runner.json` between two turns; and [ADR-0154](0154-an-agent-account-begins-a-new-conversation-for-itself-when-its-turn-is-over.md), point 2, by which the account's own reset is taken when its turn is over. Closes what [ADR-0161](0161-a-sub-agent-that-goes-on-in-the-background-is-at-work-until-its-own-line-says-it-ended.md) left to be looked at by itself. The contract is in [specs/runner.md](../specs/runner.md#a-sessions-life).

## Context

A runner took a session for idle once the agent's own turn was over. Five things end a session then, each of them made to wait for the turn so that it would cut no work short: a model or an effort chosen for a product that takes them only when it starts, the account's own reset, an update of the command the runner runs from, a `runner.json` that changed, and the first briefing of a day or a week where `runner.json` asks for a new conversation then.

An agent account hands its tasks to sub-agents and ends its turn, and Claude Code runs a sub-agent in the background unless it is asked to wait (ADR-0161). So a session whose turn is over and whose sub-agents work on for an hour is the ordinary state of an account at work, and not a rare one. A sub-agent lives in the product's process: each of the five ended that process, and the sub-agents with it, in the middle of whatever they did, leaving a branch half pushed and a run open on the board until the board ends it. Read from the runner's source, and held by tests that fail on the runner of before; not seen on a machine.

Since ADR-0161 the record says which sub-agents go on and when each ended, so the runner has what it needs to know without reading anything new.

## Decision

1. **What waits for the turn waits for the sub-agents in the background too.** A model or an effort chosen, the account's own reset, an update of the command and a `runner.json` that changed end the open session once no turn is under way and no sub-agent is at work in its background. The runner reads who is at work from what its driver says, as the page does (ADR-0161): from the answer of a call that says its sub-agent goes on (`background`) until that sub-agent's own line says it ended (`over`), and at work again where it does something after that line.
2. **And for the turn that reads a sub-agent's report.** The product hands the agent the report in a turn it starts itself, which the runner sent nothing for. With no turn of the runner's under way, what the agent itself says or does is such a turn, held for until it completes; and for a minute after a sub-agent in the background ended the session is not taken for idle, the product being about to start that turn.
3. **An hour at most.** Counted from when the runner first held an ending so: past it the session ends as it would have, with whoever is still at work. A sub-agent the product ended without a word reads as at work for good (ADR-0161), and an update or a model chosen cannot wait on that. Where nothing is left that would end the session, a `runner.json` put back say, the next thing that would counts from its own moment. A turn under way is waited for as before, however long.
4. **The record says that the runner waits, and that it waited in vain.** A `status` event, once for each: what the session is to end for, how many sub-agents are at work and how long the runner waits at most; and past the hour, how many end with the session. Whoever chose a model and sees the agent go on with the old one reads why there.
5. **A supervisor's `stop`, `restart` and `reset` end the session at once**, as they do in the middle of a turn, and so does the runner's own stop, by its service or its machine. They are a person's word that the session is to end now, the way out of work that hangs or goes wrong; the five above are things that can wait, which is why they waited for the turn already. A supervisor who wants a model taken now sends a restart after it.
6. **A new day's conversation is not begun over sub-agents at work.** The briefing is handed to the open session, and the conversation goes on that day, as it does where a turn is under way then (ADR-0085). Held back until the sub-agents ended, the briefing would wait an hour, and the sub-agents' reports belong to the conversation that started them.
7. **While it waits for sub-agents with an update seen, the runner goes on handing over what arrives.** A runner that is to end for an update hands the product nothing more (ADR-0101), which under a turn lasts minutes. For sub-agents it may last the hour, in which the agent would hear nothing it is told: it reads what it is sent in turns of its own, and the hand-over stops once nothing but a turn is waited for.
8. **Nothing is asked of the product, the console or the agent.** No route, no fact of an event and no word of `runner.json` is new. A driver that says neither fact of ADR-0161, `codex` and `acp` today, has its sessions end as before.

## Consequences

- **A model chosen for an agent with sub-agents at work is taken up to an hour later**, and so are an update and a `runner.json` that changed. The heartbeat goes on saying what the session runs with, and the record says why.
- **An account that begins a new conversation while its sub-agents work keeps the old one until they ended.** Their reports are read in it first; the account's words wait at the foot of the conversation meanwhile, as they do for a turn.
- **A console that refuses the runner as too old hears nothing of the session for as long as an update waits**: up to an hour, where it was a turn's length. The sub-agents' own commands are the updated one's, and go on.
- **A sub-agent that takes longer than the hour is ended with its session**, as before this decision, and the record says so.
- **Where the product starts a turn of its own and never ends it**, the hour ends the wait, as it does for a sub-agent that never says it ended.
- **Rejected:**
  - a session that counts as at a turn while sub-agents work: a message would then wait to be written on the record until the product said it took it, and an interrupt would stop a turn that is not there; what is under way and what is merely not idle are two things;
  - no bound: one sub-agent the product ended without a word would hold an update for as long as the session lasts;
  - a bound an agent sets in `runner.json`: nobody asked for one, and a constant is changed in one place when somebody does;
  - asking the product which tasks are alive (`background_tasks_changed`): a second reading of what the record already says, which the page and the runner would then hold two views of;
  - a supervisor's signals made to wait as well: they are the way out of work that hangs, and ADR-0154 kept them at once for that reason;
  - holding a day's briefing until the sub-agents ended: the agent's first word of the day would come an hour late for the sake of an empty conversation.
