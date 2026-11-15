# ADR-0132: What a runner writes is bounded by the hour, and its log by its size

- Status: Accepted
- Date: 2026-11-15
- Builds on [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md) (the runner, its heartbeat and its wakes) and [ADR-0086](0086-a-session-leaves-a-transcript-that-is-kept-for-good.md) (the transcript, which is kept for good). The contract is in [specs/runner.md](../specs/runner.md) and [specs/rest.md](../specs/rest.md).

## Context

An agent account's runner writes to the console with the account's own session, and nothing bounded how much. A session's transcript took a batch of a hundred events as often as one was sent; an account began a session whenever its runner asked; a wake source raised a wake for whatever it heard; and every change of the agent's state the runner reported became an event of the workspace's feed. What a session hands in of pictures was bounded, sixty a minute, and nothing else was.

None of that is met by work. It is met by a product that fails as it starts, again and again, by one that prints without end, by a wake source that hears itself, and by a runner whose state is spoiled. Each of them writes for as long as it runs: a transcript that is kept for good, a feed every member reads and every plugin's hook is handed, signals that wake the agent they were raised for.

On the agent's machine the same held of the runner's own lines. On Linux they go to the account's journal, which the system keeps to a size. On Windows the task's shell appended them to one file, and nothing ever cut it.

## Decision

1. **Four things a runner writes are bounded by the hour**, each counted over the hour before the write, for one agent account:

   | What | The bound | Past it |
   |---|---|---|
   | The events one session's transcript takes | 60,000 | `transcript.too_many` (`429`), the batch refused whole |
   | The sessions an account begins | 60 | `transcript.too_many_sessions` (`429`), the open session left open |
   | The wakes its runner raises itself | 600 | `signal.too_many` (`429`), nothing recorded |
   | The changes of its state its runner has the feed told | 20 | the change is kept with the account, and told later |

   The bounds are the package's (`MAX_TRANSCRIPT_EVENTS_PER_HOUR` and the three beside it) and the server holds them among its quotas, as it holds how many tasks a project has. No setting of a deployment changes them: none is known to need another.
2. **A refusal says when the hour has room** (`retry-after`, in seconds), and keeps nothing of what it refused.
3. **What a supervisor, the board and the schedule send an agent is not counted.** The bound on wakes is on those a runner raises itself, from a wake source on its machine.
4. **The feed's last word of an account is how the account stands.** A change of state beyond the hour's bound is not lost: the account's row keeps it, which its page reads, and a later heartbeat tells the feed how the account stands once the hour has room, from the state the feed was told last. So the feed is told at most twenty changes an hour of one account, and is never left saying what is no longer so for longer than that hour.
5. **The count is read from what is kept, and reads a bounded part of it.** The events of a session are received in the order of their numbers, so whether a batch fits is one row's answer: the event that many before the batch's end, and when it was received. The sessions are counted by their index. The wakes are looked for among the account's last signals, and the changes of state among the workspace's last events, a bounded number of each. Nothing new is kept for the counting, and no table is changed.
6. **The runner holds back what was refused, and says so once.** The events of a session wait in the runner's memory, within what it keeps, and are sent again after a minute, then after twice as long each time, a quarter of an hour at most. What a wake source raises is let go for as long. A session that could not be begun is tried again after the cool-down, as for an agent that could not go on, and what was to be handed over stays undelivered meanwhile.
7. **On Windows the runner's log is put aside when it is full.** The task's shell, which writes the log, puts it aside as `runner.log.1` when it holds four megabytes, and keeps three put aside. Whoever writes the log bounds it, so that a runner that cannot start is bounded as one that runs.

## Consequences

- **A product that fails again and again costs an hour's worth and no more**: of the transcript, of the feed, of the agent's own record of signals.
- **An agent at work never meets a bound.** Sixty thousand events an hour is more than sixteen a second for the whole hour, in one session.
- **A long session that was held back shows a gap in time, and none in its numbers**: the events are sent later, numbered as they were.
- **The bound on a session's events is per session, and the bound on sessions per account**: together, what one account's transcript takes in an hour. An account that ends a session to begin another meets the second.
- **A command of a version before this one** reads a refusal as any other it does not know: it keeps the events and asks again a second later, for as long as the hour is full.
- **Rejected:**
  - counters kept with the account's row: a migration, and a second record of what the tables already say;
  - a bound a deployment sets: one more setting for a number nobody has a reason to change;
  - folding a change of state into the event before it: an event is what happened, written once, and a feed whose event changed after it was read is read twice;
  - a rotation of the log inside the runner: a runner that does not start writes lines too, and never reaches it.
