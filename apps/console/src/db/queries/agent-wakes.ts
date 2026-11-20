import { and, asc, eq, lte, ne, sql } from "drizzle-orm";
import { DomainError } from "../../errors.js";
import { type Database, drizzleOf, type Transaction } from "../client.js";
import { agentWakes, people } from "../schema.js";
import { type PersonRecord, personColumns, toPerson } from "./people.js";

// The wakes an agent account keeps for itself for later (ADR-0145): kept by its own command,
// one under a name at a time, and raised by the worker as a signal of the account's record when
// their moment has come. A wake kept is no signal yet: it is on no record until it is raised.

/** A wake kept for later, as its row says. */
export interface OwnWakeRecord {
  readonly key: string;
  readonly at: Date;
  readonly text: string;
  /** The agent it was kept through: the name of the account's command. */
  readonly agent: string | undefined;
  readonly createdAt: Date;
}

/** An account keeps as many wakes for later as it may: one more, under a name of its own, is refused. */
export class OwnWakeError extends DomainError {
  constructor() {
    super("wake.too_many", "the account keeps as many wakes for later as it may");
  }
}

type WakeRow = typeof agentWakes.$inferSelect;

const toWake = (row: WakeRow): OwnWakeRecord => ({
  key: row.key,
  at: row.at,
  text: row.text,
  agent: row.agent ?? undefined,
  createdAt: row.createdAt,
});

/**
 * Keeps a wake for later: under its name, where a second takes the first one's place. An
 * account keeps `most` of them at a time; one more under a name it does not keep is refused.
 */
export async function keepOwnWake(
  database: Database,
  input: {
    readonly account: PersonRecord;
    readonly key: string;
    readonly at: Date;
    readonly text: string;
    readonly agent: string | undefined;
    readonly most: number;
    readonly now: Date;
  },
): Promise<OwnWakeRecord> {
  const { account, key, now } = input;
  return drizzleOf(database).transaction(async (tx) => {
    // One account's wakes are kept one at a time, so that two kept at once are counted in turn.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`agent_wakes:${account.id}`}))`);
    const [others] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(agentWakes)
      .where(and(eq(agentWakes.personId, account.id), ne(agentWakes.key, key)));
    if ((others?.count ?? 0) >= input.most) {
      throw new OwnWakeError();
    }
    const [row] = await tx
      .insert(agentWakes)
      .values({
        personId: account.id,
        key,
        at: input.at,
        text: input.text,
        agent: input.agent ?? null,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [agentWakes.personId, agentWakes.key],
        set: { at: input.at, text: input.text, agent: input.agent ?? null, createdAt: now },
      })
      .returning();
    if (row === undefined) {
      throw new Error("the wake kept was not found");
    }
    return toWake(row);
  });
}

/** The wakes an account keeps for later, the soonest first. */
export async function listOwnWakes(database: Database, personId: string): Promise<OwnWakeRecord[]> {
  const rows = await drizzleOf(database)
    .select()
    .from(agentWakes)
    .where(eq(agentWakes.personId, personId))
    .orderBy(asc(agentWakes.at), asc(agentWakes.key));
  return rows.map(toWake);
}

/** Takes a wake kept for later away, by its name; whether there was one. */
export async function cancelOwnWake(
  database: Database,
  personId: string,
  key: string,
): Promise<boolean> {
  const rows = await drizzleOf(database)
    .delete(agentWakes)
    .where(and(eq(agentWakes.personId, personId), eq(agentWakes.key, key)))
    .returning({ key: agentWakes.key });
  return rows.length > 0;
}

/**
 * The wakes of a workspace's active agent accounts whose moment has come, the earliest first.
 * Read, and not taken: each is taken in the transaction that raises it (`takeOwnWake`). One of
 * an account that is out stays until the account is back in, or goes with it.
 */
export async function dueOwnWakes(
  database: Database,
  workspaceId: string,
  now: Date,
): Promise<{ readonly account: PersonRecord; readonly wake: OwnWakeRecord }[]> {
  const due = await drizzleOf(database)
    .select({ wake: agentWakes, account: personColumns(people) })
    .from(agentWakes)
    .innerJoin(people, eq(people.id, agentWakes.personId))
    .where(
      and(
        eq(people.workspaceId, workspaceId),
        eq(people.kind, "agent"),
        eq(people.status, "active"),
        lte(agentWakes.at, now),
      ),
    )
    .orderBy(asc(agentWakes.at), asc(agentWakes.key));
  return due.map((one) => ({ account: toPerson(one.account), wake: toWake(one.wake) }));
}

/** A wake that was due is there no more as it was read: taken away, or kept anew for another moment. */
export class OwnWakeGone extends Error {}

/**
 * Takes a wake that is due, in the transaction that raises it: the row as it was read, by its
 * name and its moment. One the account took away or kept anew since is not this one, and
 * nothing is raised for it (`OwnWakeGone`).
 */
export async function takeOwnWake(
  tx: Transaction,
  personId: string,
  wake: Pick<OwnWakeRecord, "key" | "at">,
): Promise<void> {
  const taken = await tx
    .delete(agentWakes)
    .where(
      and(
        eq(agentWakes.personId, personId),
        eq(agentWakes.key, wake.key),
        eq(agentWakes.at, wake.at),
      ),
    )
    .returning({ key: agentWakes.key });
  if (taken.length === 0) {
    throw new OwnWakeGone();
  }
}
