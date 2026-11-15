# ADR-0131: A signal is delivered when the product took it, and an event says which sub-agent made it

- Status: Accepted
- Date: 2026-11-15
- Amends point 5 of [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md), where `delivered` was the last signal handed to the product, and point 5 of [ADR-0086](0086-a-session-leaves-a-transcript-that-is-kept-for-good.md), where a secret is taken out of an event; builds on [ADR-0098](0098-a-message-is-on-the-record-where-the-agent-took-it-and-an-interrupt-may-carry-no-words.md). The contract is in [specs/runner.md](../specs/runner.md).

## Context

Three things the record of an agent account's work said were not what happened.

A signal was counted as delivered when the runner handed it to the product, before the product was known to have started. A product that did not start took nothing, and the runner kept what it was sent in its memory to try again. A runner whose process ended then, a machine restarted say, was started again past those signals: its own file and the console's record both said they were delivered, and nothing sent them again.

An agent account gives its tasks to sub-agents, as its desk tells it to. The transcript showed the sub-agents' tool calls among the main session's, and no event said whose a call was. Whoever read a session could not tell what the agent did from what it had done for it.

A driver cut a tool's input to the length it shows, and the runner took the account's secrets out of the text afterwards. A secret that stood across the cut was left in part. The runner took out a beginning of four characters or more at the end of a cut text; a shorter beginning stayed, and so did the beginning of a form the look at the end did not go through.

## Decision

1. **A signal is delivered when the record holds what became of it.** That is when the driver says the product took it (`taken`) or the turn it was handed in completes; when its session ends and the record says it was never read; when it is let go after a reset's one more try; and, for a signal that is the runner's own to act on, when the runner acted. A signal that waits to be handed over, or that a product was handed and has not said it took, is not delivered.
2. **`delivered` is the last signal delivered with every one before it.** Signals are counted in order: one the runner acted on is delivered once none before it is still owed. The runner keeps the number in its file and says it in the heartbeat, as before; the console answers the most it was told.
3. **Every driver says when a message is taken**, or completes the turn, which takes it: this is true of the three the package registers, so the rule needs nothing of a driver that it did not say already. The alternative, keeping in the runner's file the numbers handed over and not taken, would have had the console's record say "delivered" of what no product read, and the page show it as read.
4. **A transcript event of a sub-agent names the call that started it.** Two facts of the event's `data`: `parent`, the id of the tool call that started the sub-agent, as the product gave it to the call, and `subagent`, what that call called the sub-agent, where the driver read the call. An event of the session's own carries neither. They are facts as any other: bounded, shown as text, kept with the event, and they need no column and no change of a schema.
5. **A driver says it where its product does, and nothing where it does not.** The `claude` driver reads it from the product's stream, whose lines name the tool call a sub-agent's line belongs to (`parent_tool_use_id`, as the product's documentation has it), and reads what the call called the sub-agent from the call's input. The `codex` driver's stream names no agent on an item, and the protocol the `acp` driver speaks has none: both say nothing, and their events are shown as before.
6. **The page shows a sub-agent's event as a step, with a label.** What a sub-agent said is not the agent's own word to whoever reads: it is folded as a thought is, under the sub-agent's name, and its tool calls and thoughts carry the same label. No part was added for it.
7. **A text is cut after its secrets are out.** A session is handed what cuts a text to what the transcript shows (`cut` of what a driver is started with), and a driver cuts through it wherever it shows a part of what its product wrote: a tool's input, what a command printed, an error's detail. The secrets are taken out first and the text is cut after, so no part of one stands at the cut, however short.
8. **What is looked through for a cut is bounded.** The beginning of the text, as far as the cut and one form of a secret beyond it, and further only where taking secrets out left less than the length to show, up to a bound: a megabyte of a tool's input is not read for a line of four thousand characters. The last characters looked through may begin a secret whose end was not read, so they are never shown. A driver that keeps only the beginning of a long output says so, for the same reason.

## Consequences

- **A product that did not start loses no signal**, whatever becomes of the runner meanwhile: the runner started after asks for its stream from the last signal delivered.
- **A runner that ends in the middle of a turn may hand a message over twice** where the product took it and had not said so yet: a driver whose product says a message back when it reads it has said so by then, and for the others the message is in the conversation the next session goes on with. Once and once more is what is left of "at least once"; "at most once" lost signals.
- **The agent's page counts what is delivered, not what was handed over**: "3 of 4 delivered" while the fourth waits for the product to take it, which is what its foot shows as waiting.
- **A session's record names its sub-agents only from this version on**, and only under the `claude` driver. An event kept before reads as the main session's.
- **A driver of someone's own that cuts a text by itself** works as before and shows a part of a secret where it did before, until it cuts through what it is handed.
- **Rejected:**
  - a column for the sub-agent on the events' table: a fact is where the transcript keeps what an event is about, and a month put away would not have had it;
  - nesting a sub-agent's events under the call that started it, as rows inside a row: no part draws it, and a sub-agent's events arrive among the session's own, in the order they happened;
  - the driver emitting a text whole with the length to show, for the runner to cut: a driver would then hold nothing back of a megabyte, and what it shows inside a sentence of its own, a denial say, could not be cut.
