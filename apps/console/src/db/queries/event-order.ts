import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { type Database, drizzleOf, type Transaction } from "../client.js";
import { events, pluginEvents } from "../schema.js";

// The order of a feed (ADR-0125). An event is given its number when it is inserted and is seen
// when its transaction commits, and the two orders differ: a change that was numbered first
// and committed last appears below a number a reader has already passed. Whoever reads a feed
// "after the number I was at" would never read it.
//
// So a writer holds a lock shared with every other writer of the stream, from before its event
// is numbered to the end of its transaction, and a reader asks, without waiting, for the same
// lock alone: the moment it has it, no writer that was given a number is still under way, and
// every number up to the highest it saw committed before is either there for good or never
// will be. That number is the stream's settled end, and a reader goes no further than it.

/** The two streams that are read by number: the console's events and the plugins'. */
export type EventStream = "console" | "plugin";

/**
 * The first of the two keys of the lock, "evts" in ASCII. PostgreSQL keeps the locks taken with
 * two keys apart from those taken with one (a plugin's job), and this space apart from the
 * dispatcher's ("hook").
 */
const ORDER_LOCK_SPACE = 0x65767473;
const ORDER_LOCK_KEYS: Readonly<Record<EventStream, number>> = { console: 1, plugin: 2 };

/** The lock one stream's order is kept under, as two keys. */
export function orderLockOf(stream: EventStream): readonly [number, number] {
  return [ORDER_LOCK_SPACE, ORDER_LOCK_KEYS[stream]];
}

/**
 * Taken by whatever writes an event of `stream`, inside the transaction that writes it and
 * before the row is inserted, which is when its number is given. Shared: writers never wait for
 * each other. Held to the end of the transaction, so that a number given is never under way
 * while a reader holds the lock alone.
 */
export async function holdEventOrder(tx: Transaction, stream: EventStream): Promise<void> {
  const [space, key] = orderLockOf(stream);
  await tx.execute(sql`select pg_advisory_xact_lock_shared(${space}, ${key})`);
}

/** How long a reader goes on asking for the lock before it reads within what it knew before. */
const PATIENCE_MS = 100;
/** The same for a process that knows no settled end yet, and so has nothing to read within. */
const FIRST_PATIENCE_MS = 2000;
/** How long it waits between two askings. */
const ASK_AGAIN_MS = 20;

interface Settling {
  /** The highest settled end this process has seen: sound for good, since what settled stays settled. */
  end: number | undefined;
  /** The look that answers whoever asks next: begun after the one under way, if one is. */
  next: Promise<void> | undefined;
  /** The last look begun, never rejecting: what the next waits for. */
  last: Promise<void>;
}

const settling = new WeakMap<Database, Record<EventStream, Settling>>();

function settlingOf(database: Database, stream: EventStream): Settling {
  let streams = settling.get(database);
  if (streams === undefined) {
    streams = {
      console: { end: undefined, next: undefined, last: Promise.resolve() },
      plugin: { end: undefined, next: undefined, last: Promise.resolve() },
    };
    settling.set(database, streams);
  }
  return streams[stream];
}

/** The highest number committed in the stream as this statement sees it, 0 where it is empty. */
async function highestCommitted(database: Database, stream: EventStream): Promise<number> {
  const table = stream === "console" ? events : pluginEvents;
  const [row] = await drizzleOf(database)
    .select({ highest: sql<number | string | null>`max(${table.id})` })
    .from(table);
  return Number(row?.highest ?? 0);
}

/**
 * Whether no writer of the stream is under way at this moment: the lock asked for alone, in a
 * statement of its own, never waited for, and given up as the statement ends. A reader that
 * waited would stand in the lock's queue, and every writer after it would wait behind it for as
 * long as the slowest writer before it took.
 */
async function noWriterUnderWay(database: Database, stream: EventStream): Promise<boolean> {
  const [space, key] = orderLockOf(stream);
  const asked = await drizzleOf(database).execute<{ alone: boolean }>(
    sql`select pg_try_advisory_xact_lock(${space}, ${key}) as alone`,
  );
  return asked.rows[0]?.alone === true;
}

/**
 * One look: the highest number committed, then the lock. The number is read first, so that
 * every number up to it was given before the lock was had, and the lock is held for no read at
 * all. Where nothing was committed since the last look there is nothing to settle, and no lock
 * is asked for.
 */
async function look(database: Database, stream: EventStream, state: Settling): Promise<void> {
  const until = performance.now() + (state.end === undefined ? FIRST_PATIENCE_MS : PATIENCE_MS);
  for (;;) {
    const highest = await highestCommitted(database, stream);
    if (state.end !== undefined && highest <= state.end) {
      return;
    }
    if (await noWriterUnderWay(database, stream)) {
      state.end = Math.max(state.end ?? 0, highest);
      return;
    }
    if (performance.now() >= until) {
      return;
    }
    await sleep(ASK_AGAIN_MS);
  }
}

/**
 * The settled end of a stream: the number a reader by number reads up to and no further, since
 * no event numbered at or below it can still appear. Where a writer is under way for longer than
 * a reader asks, the end this process saw settled before, which is as sound and only older; and
 * nothing where this process never saw one, which is a reader's word to leave its turn.
 *
 * Whoever asks while a look is under way is answered by the next one, begun after they asked:
 * a look answers for what was committed before it began, and theirs may have been committed
 * since. Those who ask together share a look.
 */
export function settledEnd(database: Database, stream: EventStream): Promise<number | undefined> {
  const state = settlingOf(database, stream);
  if (state.next === undefined) {
    const next = state.last.then(async () => {
      state.next = undefined;
      await look(database, stream, state);
    });
    state.next = next;
    state.last = next.catch(() => undefined);
  }
  return state.next.then(() => state.end);
}
