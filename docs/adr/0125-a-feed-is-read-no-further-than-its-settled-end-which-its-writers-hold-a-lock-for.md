# ADR-0125: A feed is read no further than its settled end, which its writers hold a lock for

- Status: Accepted
- Date: 2026-11-15
- Builds on point 10 of [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md) (the board's wakes are read from a place in the feed) and on the plugins' hooks, which are dispatched from a cursor per plugin ([plugins.md](../specs/plugins.md#events-hooks-and-jobs)).

## Context

An event is numbered when its row is inserted and seen when its transaction commits, and the two orders differ. A change that was numbered 8 and is slow to commit is passed by one numbered 9 that commits at once. Whoever reads a feed "after the number I was at" then reads 9, keeps 9 as its place, and never reads 8 when it appears.

Every reader of the two feeds, the console's events and the plugins' events, kept its place that way:

- **The board's wakes** lost a wake until the task's next event or the account's next briefing.
- **The plugins' hooks** lost the event for good: nothing delivers it again.
- **A page** loaded the feed as it stood, went on from its last number over the stream, and stayed stale until the next event or a reload. A command that waits for an answer waited out its time.

A test reproduced it: one transaction left open after its event was numbered, the next event committed, the job run. It takes two writes at nearly the same moment, the first slower than the second, so it is rare, and it was there since the feed was first read by number.

The same pass over the jobs found a second way a reader stops for good: an event whose wakes fail every time held the wake job at that event, tried again every five seconds, with every later wake behind it; and an event the console itself could not make ready for a hook held that plugin's hooks the same way.

## Decision

1. **A writer holds the stream's order.** Whatever writes an event takes an advisory lock, shared with every other writer of the stream, inside its transaction and before the row is inserted, which is when the number is given. The lock is the transaction's and goes when it ends, committed or not. Each stream has a key of its own: a writer of the one holds up no reader of the other.
2. **One function writes each stream** and takes the lock: `recordEvent` for the console's events, `emitPluginEvent` for the plugins', which is a transaction of its own because two inserts that each commit by themselves commit in either order too. A test reads the sources for an insert anywhere else.
3. **A reader asks for the lock alone and never waits for it.** It first reads the highest number committed, then asks for the exclusive lock with a try, in a statement of its own, so that the lock is given up as the statement ends and is held for no read at all. Where it is given, that number is the stream's **settled end**. Where it is refused, the reader asks again a few times, a fiftieth of a second apart, for a tenth of a second, and otherwise reads within the end its process saw settled before, which is as sound and only older.
4. **No read by number goes beyond the settled end**: the wake job, the dispatcher on both streams, the feed a page loads (`latest=true`) and reads on from (`after=`), the stream, the wait for an answer, a plugin's events as its frames read them, and where a plugin's cursor begins or keeps up to. The reads take the end themselves unless a caller hands them one it looked up, so that a new reader cannot forget it.
5. **A process that never saw a stream settle reads nothing by number** while a writer is under way, after asking for two seconds: it has no older end to read within. A plugin enabled then has its place forgotten and begun by the dispatcher's next pass, never at the stream's beginning.
6. **An event that can never be handled is passed over, and said.** The wake job passes over an event whose wakes failed in twelve passes in a row of one process, a minute of them, with an error in the log that names the event's number and kind and nothing of its content. The dispatcher counts a try in which the console could not make the event ready, or could not call the hook, as a try the hook failed: after the last it skips the event with a `plugin.failed` event, as it does for a hook that fails.

### Why this passes nothing over

Let a reader read `M`, the highest number committed, and afterwards be given the lock alone at the moment `t`.

- Every number up to `M` was given before `M` was read: the sequences give their numbers one at a time, in order, and keep none ahead for a session (a test holds them to that).
- Whoever was given a number took the shared lock before it and holds it until its transaction ends. At `t` nobody holds it, so every transaction that was given a number before `t` has ended.
- A transaction that committed made its rows visible before it gave the lock up, so every read that begins after `t` sees them. One that failed left a number that never comes.

So after `t`, the events numbered up to `M` are all there or never will be, and a place kept at or below `M` has nothing below it still to come. An end seen settled once stays settled, which is why an older one may stand in for a new one.

## Consequences

- **No writer waits behind a reader.** A try that is refused stands in no queue. A reader that waited for the lock would stand in its queue, and every writer after it would wait behind it for as long as the slowest writer before it took. A writer waits only for the instant a reader holds the lock, which is one statement that reads nothing.
- **A reader is held up by a writer that is slow.** While a transaction that numbered an event stays open, the wakes, the hooks and the pages go no further than what settled before it; they go on when it ends. Nothing is lost, and writers are not held up. Every transaction that writes an event today does database work alone and is over in a moment; a change that kept its transaction open across slow work would delay what follows the feed for as long.
- **When the slow writer fails instead of committing, nothing announces it.** The jobs come round on their timers and a page's stream asks again on its own within its poll time, so what was committed meanwhile is read then.
- **Order of delivery is the order of the numbers**, as before; it is now also complete.
- **A cursor that begins while a writer is under way begins at the older end.** A plugin enabled at such a moment may hear of what was committed just before it was, its own enabling among it, and never of less than what followed. Delivery is at least once already, and a hook keeps from acting twice by the event's id.
- **Asking costs one read of the highest number**, and the lock only when something was committed since the last look. Those who ask in one process at the same moment share a look, and whoever asks while one is under way is answered by the next, which began after they asked.
- **The count of a wake's tries is one process's.** A restart begins it again, and two processes that take the pass by turns each count their own, so an event is passed over after at most twelve passes of each. It is bounded either way.
- **The passed-over wake is said in the log alone.** The board has no place for a problem of the console's own jobs: a new kind of event would be one more value in what a 0.5.0 command reads of the feed, and a column needs a migration. Left for the next line.
- **No migration.** The lock is an advisory one, and the cursors are what they were.
- **Not changed:** an agent account's signals are numbered under the lock of its runner's row, and a session's transcript by its runner under the lock of the session's row, without a gap: both commit in the order of their numbers already.
- **Rejected:**
  - reading only events a few seconds old: a transaction open for longer is still passed over;
  - waiting at a gap in the numbers until it fills or a time passes: every failed write leaves a gap, so every one delays what follows, and a transaction slower than the time is still passed over;
  - an exclusive lock the reader waits for: writers queue behind the waiting reader;
  - the reader holding the lock while it reads the highest number: the lock would be held for a round trip to the database instead of for nothing;
  - a place kept by transaction number instead of by event number: exact without a lock, but it needs a column on both tables and another shape for every cursor, the pages' among them.
