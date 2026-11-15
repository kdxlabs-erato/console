# ADR-0125: A feed is read no further than its settled end, which its writers hold a lock for

- Status: Accepted
- Date: 2026-11-15
- Builds on point 10 of [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md) (the board's wakes are read from a place in the feed) and on the plugins' hooks, which are dispatched from a cursor per plugin ([plugins.md](../specs/plugins.md#events-hooks-and-jobs)). Concerns [ADR-0051](0051-a-plugin-keeps-its-data-in-records-the-console-holds-or-in-a-schema-of-its-own-by-consent.md) (a plugin's own schema and role in the console's database).

## Context

An event is numbered when its row is inserted and seen when its transaction commits, and the two orders differ. A change that was numbered 8 and is slow to commit is passed by one numbered 9 that commits at once. Whoever reads a feed "after the number I was at" then reads 9, keeps 9 as its place, and never reads 8 when it appears.

Every reader of the two feeds, the console's events and the plugins' events, kept its place that way:

- **The board's wakes** lost a wake until the task's next event or the account's next briefing.
- **The plugins' hooks** lost the event for good: nothing delivers it again.
- **A page** loaded the feed as it stood, went on from its last number over the stream, and stayed stale until the next event or a reload. A command that waits for an answer waited out its time.

A test reproduced it: one transaction left open after its event was numbered, the next event committed, the job run. It takes two writes at nearly the same moment, the first slower than the second, so it is rare, and it was there since the feed was first read by number.

The same pass over the jobs found a second way a reader stops for good: an event whose wakes fail every time held the wake job at that event, tried again every five seconds, with every later wake behind it; and an event the console itself could not make ready for a hook held that plugin's hooks the same way.

The order was first held by an advisory lock. The review before the release found that any role of a database may take an advisory lock, and a plugin with a schema of its own (`storage:sql`) runs statements as a role of the console's database. One statement of such a plugin, taking the feed's lock alone, made every write of the board wait five seconds and fail; taking it shared, it kept every feed from settling. Neither needed a right the plugin was given.

A table of the console's own in `public` is no better. Every role may use `public` unless told otherwise, a plugin's among them, and a role that may use a schema may lock a table in it without any right on the table: a statement prepared over the table (`prepare q as select 1 from <table> for share`) is analysed and not run, and holds the lock its reading would take, here a writer's, until its transaction ends; some statements (a partition of the table, a comment on it) queue for the table alone before they are refused. Both were asked of PostgreSQL 18 as a plugin's role.

## Decision

1. **A feed's order is a lock on a table of the console's own, in a schema nobody else may use**, one table a feed: `feed_order.events` for the console's events, `feed_order.plugin_events` for the plugins'. Each holds no row and never will, which a constraint sees to. The schema `feed_order` is the console's role's, and nobody is given a right on it or on what is in it: a role that may not use a schema cannot name a table in it, and is refused before any lock is asked for, in every way there is to ask. Each feed has its table, so that a writer of the one holds up no reader of the other.
2. **A writer holds the lock shared.** Whatever writes an event locks the feed's table in `ROW SHARE` mode, inside its transaction and before the row is inserted, which is when the number is given. The lock is the transaction's and goes when it ends, committed or not. `ROW SHARE` conflicts with nothing but a lock taken alone (`EXCLUSIVE`, `ACCESS EXCLUSIVE`): writers never wait for each other, nor for a vacuum, an analyze or a dump.
3. **One function writes each feed** and takes the lock: `recordEvent` for the console's events, `emitPluginEvent` for the plugins', which is a transaction of its own because two inserts that each commit by themselves commit in either order too. A test reads the sources for an insert anywhere else.
4. **A reader asks for the lock alone and never waits for it.** It first reads the highest number committed, then asks for the table in `EXCLUSIVE` mode with `NOWAIT`. Where it is given, that number is the feed's **settled end**. Where it is refused, the reader asks again a few times, a fiftieth of a second apart, for a tenth of a second, and otherwise reads within the end its process saw settled before, which is as sound and only older.
5. **The reader asks through a function of the console's own**, `feed_order.writers_ended`, in a statement by itself. PostgreSQL takes no `LOCK TABLE` outside a transaction block. A transaction a process opened for it would hold the lock for a round trip to the database, or for as long as that process stalls, with every writer waiting behind it. Inside the function the lock is had and given up within the one statement, it is held for no read at all, and a lock that is refused is an answer and not an error in the server's log. Nobody but the function's owner may call it, and it runs with its caller's rights.
6. **No read by number goes beyond the settled end**: the wake job, the dispatcher on both feeds, the feed a page loads (`latest=true`) and reads on from (`after=`), the stream, the wait for an answer, a plugin's events as its frames read them, and where a plugin's cursor begins or keeps up to. The reads take the end themselves unless a caller hands them one it looked up, so that a new reader cannot forget it.
7. **A process that never saw a feed settle cannot say where the feed stands** while a writer is under way, after asking for two seconds: it has no older end to read within. Its jobs read nothing and come round again. A read over the API is refused with `503`, `feed.unsettled` and `retry-after: 1`, and its reader asks again: an empty page would be taken for a feed in which nothing ever happened, and a page's stream would go on from the beginning and be sent the whole history. A plugin enabled then has its place forgotten and begun by the dispatcher's next pass, never at the feed's beginning.
8. **An event that can never be handled is passed over, and said.** The wake job passes over an event whose wakes failed in twelve passes in a row of one process, a minute of them, with an error in the log that names the event's number and kind and nothing of its content. The dispatcher counts a try in which the console could not make the event ready, or could not call the hook, as a try the hook failed: after the last it skips the event with a `plugin.failed` event, as it does for a hook that fails.

### Why this passes nothing over

Let a reader read `M`, the highest number committed, and afterwards be given the feed's table alone at the moment `t`.

- Every number up to `M` was given before `M` was read: the sequences give their numbers one at a time, in order, and keep none ahead for a session (a test holds them to that).
- Whoever was given a number locked the table shared before it, and a lock on a table is held until the transaction ends. A lock taken alone is given only while nobody holds the table shared, so at `t` every transaction that was given a number before `t` has ended. PostgreSQL keeps a writer's lock with its session until someone asks for the table alone, and brings it out then: a test sees the reader refused beside such a lock.
- A transaction that committed made its rows visible before it gave the lock up, so every read that begins after `t` sees them. One that failed left a number that never comes.

So after `t`, the events numbered up to `M` are all there or never will be, and a place kept at or below `M` has nothing below it still to come. An end seen settled once stays settled, which is why an older one may stand in for a new one.

### What else touches the tables

Asked of PostgreSQL 18, and held by tests:

- **Beside a writer**, every lock is given but the two taken alone. A vacuum or an analyze of the table, which the server may do on its own, and a dump, go beside it.
- **A reader is refused** beside a vacuum, an analyze or a lock for building an index, and given beside a dump. A table with no row that is never written is vacuumed for the age of its transaction ids alone, in a moment; the reader asks again.
- **A refused reader leaves no waiter**: the next writer is numbered and committed while the first is still under way.
- **Nothing the console does takes a table alone but the reader's function.** A migration that changed one of the two tables would: it would wait for the writers under way, and every writer after it behind it. They are never altered while a console runs.
- **A plugin's role** is refused, at once and beside a writer under way, every way of locking the tables that was tried: `LOCK TABLE` in any mode, a row of them for share, a statement prepared over them, a comment, a partition, a child table, an analyze, and the function. Each is refused for the schema, before the table is looked up. The schema, the tables and the function are owned by the console's role, and nobody else is given anything on them.

## Consequences

- **No writer waits behind a reader.** A try that is refused stands in no queue. A reader that waited for the lock would stand in its queue, and every writer after it would wait behind it for as long as the slowest writer before it took. A writer waits only for the instant a reader holds the lock, which is one statement that reads nothing.
- **A plugin cannot hold the board's writes or its feeds** with the feeds' lock: it cannot name what they are held by.
- **A reader is held up by a writer that is slow.** While a transaction that numbered an event stays open, the wakes, the hooks and the pages go no further than what settled before it; they go on when it ends. Nothing is lost, and writers are not held up. Every transaction that writes an event is opened under `src/db/queries/` and does database work alone, a fixed and short run of statements. One that stops inside it is ended by the server after thirty seconds idle, a statement of it after fifteen, and a wait for a lock after five (the pool's `idle_in_transaction_session_timeout`, `statement_timeout` and `lock_timeout`): a stuck writer holds the feed for about half a minute after its last statement, and a statement that hangs for fifteen seconds at most.
- **Writers that follow each other without a gap hold the end where it is for as long as they last.** The end moves only at a moment no writer is under way, and nothing bounds how long such a moment may be in coming. How long the board's writers hold the lock was measured by running the whole integration suite with every transaction that took it timed from the lock to the end of its commit: 1,002 transactions of 71 write paths, with a dozen test files writing to one server side by side, held it for 34 ms at the median, 107 ms at the 99th hundredth and 148 ms at the longest; on a quiet server, some seven. How many such writers it takes was measured with writers that each did what a change of the board does (a row, the lock, the event, the nudge, the commit) and a reader asking every fiftieth of a second for four seconds, on a development machine:

  | Writers side by side | Pause between a writer's changes | Events a second | Tries given | Longest without |
  |---|---|---|---|---|
  | 1 | none | 64 | 37% | 0.2 s |
  | 2 | none | 182 | 2% | 3.2 s |
  | 4 or more | none | 290 | 1% or none | the whole run |
  | 2 | 20 ms | 68 | 72% | 0.1 s |
  | 4 | 20 ms | 122 | 38% | 0.2 s |
  | 10 | 20 ms | 260 | none | the whole run |

  So it happens where several changes are under way at every instant: a board written at well over a hundred events a second by writers side by side, which is a load put on it, an import or a script against the API, and not people and agents at work, whose busiest board writes a few events a second with long gaps: at ten a second held for the suite's 34 ms each, no writer is under way some seven tenths of the time, and a look whose every try meets one is put right by the next. One writer, however fast, leaves gaps. While it lasts nothing is lost and nothing is written late; the wakes, the hooks and the pages follow when it ends. The wake job says so in the log once the feed has stood unsettled for thirty seconds, and once a minute from then on.
- **When the slow writer fails instead of committing, nothing announces it.** The jobs come round on their timers and a page's stream asks again on its own within its poll time, so what was committed meanwhile is read then.
- **Order of delivery is the order of the numbers**, as before; it is now also complete.
- **A cursor that begins while a writer is under way begins at the older end.** A plugin enabled at such a moment may hear of what was committed just before it was, its own enabling among it, and never of less than what followed. Delivery is at least once already, and a hook keeps from acting twice by the event's id.
- **Asking costs one read of the highest number**, and the lock only when something was committed since the last look. Those who ask in one process at the same moment share a look, and whoever asks while one is under way is answered by the next, which began after they asked.
- **A page asks again where it is refused.** The pages read the feed as it stands through a read that waits a second and asks again, ten times, on `feed.unsettled`, and a plugin's frame takes its place in the stream at its next tick. The pages of a console built from an older package say that the project could not be loaded, where they had shown an empty feed and been sent its whole history.
- **The count of a wake's tries is one process's.** A restart begins it again, and two processes that take the pass by turns each count their own, so an event is passed over after at most twelve passes of each. It is bounded either way.
- **The passed-over wake is said in the log alone.** The board has no place for a problem of the console's own jobs: a new kind of event would be one more value in what a 0.5.0 command reads of the feed. Left for the next line.
- **While replicas of the release before still run beside these**, their writes take no lock, and the feed is as exact as it was before this decision until the last of them is gone.
- **A migration** makes the schema, its two tables and the function, as the transcript's schema was made. The function is written by hand in it, since the schema's generator knows no functions; it is the console's first.
- **Not changed:** an agent account's signals are numbered under the lock of its runner's row, and a session's transcript by its runner under the lock of the session's row, without a gap: both commit in the order of their numbers already. The console's other advisory locks, the migrations', a plugin's dispatch and a job's, are still any role's to take: a plugin that took one would hold up a migration, its own or another plugin's hooks, or a job, and not the board's writes. They are left for a decision of their own.
- **Rejected:**
  - an advisory lock: any role of the database may take one, a plugin's among them;
  - a table of the console's own in `public`: every role may use the schema unless told otherwise, and a role that may use a schema may lock a table in it without a right on it;
  - a lock on a row of a table of the console's own, shared by writers and taken alone by a reader that skips it where it is held: it needs no function, but every writer then writes to that one row's header, and a row that went missing would leave writers with nothing to lock without a word;
  - asking the server which locks are held, in place of taking one: it lists the locks a session keeps to itself one session at a time, so no instant is shown at which nobody holds the table;
  - reading only events a few seconds old: a transaction open for longer is still passed over;
  - waiting at a gap in the numbers until it fills or a time passes: every failed write leaves a gap, so every one delays what follows, and a transaction slower than the time is still passed over;
  - a reader that waits for the lock, always or once it was refused for long: it bounds how long writers that overlap hold the end, and writers queue behind the waiting reader for as long as the slowest writer under way takes, a stuck one among them. Not worth it while only a load put on the board can hold the end;
  - the reader holding the lock in a transaction of its own while it reads the highest number: the lock would be held for a round trip to the database instead of for nothing;
  - a place kept by transaction number instead of by event number: exact without a lock, but it needs a column on both tables and another shape for every cursor, the pages' among them.
