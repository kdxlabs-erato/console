import {
  type ChosenNotifications,
  carriedBy,
  type NotificationKind,
  type TaskFollowState,
} from "@skillcdn/console/api";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { decisionReachableBy, mayWorkIn, projectVisibleTo, supervises } from "../../auth/policy.js";
import { type Database, drizzleOf, type Transaction } from "../client.js";
import { decisions, notifications, people, projects, taskFollows } from "../schema.js";
import { type PersonRecord, personColumns, toPerson } from "./people.js";

// What a member is told of what happens on the board (ADR-0157): the notifications the worker
// makes as it reads the feed, what a member made of one task for themselves, and what they
// chose to be told of. A notification is read by its member alone, and only while they may
// still see the thing it is of: whoever was taken off a private project reads nothing of what
// happened in it, told of it or not.

/** A notification as its row says. */
export interface NotificationRecord {
  readonly id: string;
  readonly personId: string;
  readonly eventId: number;
  readonly kind: NotificationKind;
  readonly followed: boolean;
  readonly woken: boolean;
  readonly projectId: string | undefined;
  readonly createdAt: Date;
  readonly readAt: Date | undefined;
}

type NotificationRow = typeof notifications.$inferSelect;

const toNotification = (row: NotificationRow): NotificationRecord => ({
  id: row.id,
  personId: row.personId,
  eventId: row.eventId,
  kind: row.kind,
  followed: row.followed,
  woken: row.woken,
  projectId: row.projectId ?? undefined,
  createdAt: row.createdAt,
  readAt: row.readAt ?? undefined,
});

/** A member a notification may be made for, with what they chose to be told of. */
export interface MemberToTell {
  readonly person: PersonRecord;
  readonly chosen: ChosenNotifications | undefined;
}

/** The members a notification is looked for among: the policy's conditions read `people` themselves. */
const told = alias(people, "told");

/**
 * Those of some members who may be told of a thing: the ones that are in, and, of a thing in a
 * project, those who may still work in it, as a worker of a task in it must (ADR-0035): a
 * notification names the task, and whoever was taken off a private project is told nothing of
 * what is in it. Each with what they chose to be told of.
 */
export async function membersToTell(
  database: Database,
  workspaceId: string,
  ids: readonly string[],
  projectId?: string,
): Promise<MemberToTell[]> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) {
    return [];
  }
  const rows = await drizzleOf(database)
    .select({ person: personColumns(told), chosen: told.notifications })
    .from(told)
    .where(
      and(
        eq(told.workspaceId, workspaceId),
        eq(told.status, "active"),
        inArray(told.id, wanted),
        projectId === undefined ? undefined : mayWorkIn(projectId, told.id),
      ),
    );
  return rows.map((row) => ({ person: toPerson(row.person), chosen: row.chosen ?? undefined }));
}

/** What each of the members who chose something of a task chose: its notifications on (`following`), or off (`muted`). */
export async function followsOfTask(
  database: Database,
  taskId: string,
): Promise<Map<string, TaskFollowState>> {
  const rows = await drizzleOf(database)
    .select({ personId: taskFollows.personId, state: taskFollows.state })
    .from(taskFollows)
    .where(eq(taskFollows.taskId, taskId));
  return new Map(rows.map((row) => [row.personId, row.state]));
}

/** What one member chose of a task: its notifications on, off, or nothing where they left it as their settings have it. */
export async function followOf(
  database: Database,
  taskId: string,
  personId: string,
): Promise<TaskFollowState | undefined> {
  const [row] = await drizzleOf(database)
    .select({ state: taskFollows.state })
    .from(taskFollows)
    .where(and(eq(taskFollows.taskId, taskId), eq(taskFollows.personId, personId)))
    .limit(1);
  return row?.state;
}

/** Keeps what a member chose of a task, or takes it back with nothing. */
export async function setFollow(
  database: Database,
  input: {
    readonly taskId: string;
    readonly personId: string;
    readonly state: TaskFollowState | undefined;
    readonly now: Date;
  },
): Promise<void> {
  const { taskId, personId, state, now } = input;
  if (state === undefined) {
    await drizzleOf(database)
      .delete(taskFollows)
      .where(and(eq(taskFollows.taskId, taskId), eq(taskFollows.personId, personId)));
    return;
  }
  await drizzleOf(database)
    .insert(taskFollows)
    .values({ taskId, personId, state, updatedAt: now })
    .onConflictDoUpdate({
      target: [taskFollows.taskId, taskFollows.personId],
      set: { state, updatedAt: now },
    });
}

/** What a notification is made of. */
export interface NotificationToMake {
  readonly workspaceId: string;
  readonly personId: string;
  readonly eventId: number;
  readonly kind: NotificationKind;
  readonly followed: boolean;
  /** Whether the console tells the member itself, by a wake of its agent account. */
  readonly woken: boolean;
  readonly projectId: string | undefined;
  readonly taskId: string | undefined;
  readonly decisionId: string | undefined;
  /** The agent account it is about, for one of how an account stands. */
  readonly aboutId: string | undefined;
  readonly createdAt: Date;
}

/**
 * Makes a notification, once for a member and an event: whether it was made, false where the
 * member was told of that event already, by a pass that ended before it kept its place.
 */
export async function makeNotification(
  tx: Transaction,
  input: NotificationToMake,
): Promise<boolean> {
  const made = await tx
    .insert(notifications)
    .values({
      workspaceId: input.workspaceId,
      personId: input.personId,
      eventId: input.eventId,
      kind: input.kind,
      followed: input.followed,
      woken: input.woken,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      decisionId: input.decisionId ?? null,
      aboutId: input.aboutId ?? null,
      createdAt: input.createdAt,
      // What the console told the member itself, by a wake, is read as it is made.
      readAt: input.woken ? input.createdAt : null,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return made.length > 0;
}

/**
 * On a `notifications` row: whether `person` may still read what it is of. A decision reaches
 * whom it reaches wherever it is (ADR-0068); anything else of a project is read by whoever may
 * see the project; and how an agent account stands by whoever supervises it.
 */
function stillSeenBy(person: PersonRecord) {
  return sql`(case
    when ${notifications.decisionId} is not null then exists (select 1 from ${decisions} where ${decisions.id} = ${notifications.decisionId} and ${decisionReachableBy(person)})
    when ${notifications.projectId} is not null then exists (select 1 from ${projects} where ${projects.id} = ${notifications.projectId} and ${projectVisibleTo(person)})
    when ${notifications.aboutId} is not null then exists (select 1 from ${people} where ${people.id} = ${notifications.aboutId} and ${supervises(person)})
    else false end)`;
}

/** The notifications of one member that they may still read. */
const of = (person: PersonRecord) =>
  and(
    eq(notifications.personId, person.id),
    eq(notifications.workspaceId, person.workspaceId),
    stillSeenBy(person),
  );

/**
 * A page of a member's notifications, the newest first, and whether there is more; with
 * `unread`, those they have not read alone.
 */
export async function listNotificationsFor(
  database: Database,
  person: PersonRecord,
  page: { readonly unread: boolean; readonly limit: number; readonly offset: number },
): Promise<{ readonly items: NotificationRecord[]; readonly more: boolean }> {
  const rows = await drizzleOf(database)
    .select()
    .from(notifications)
    .where(and(of(person), page.unread ? isNull(notifications.readAt) : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.eventId))
    .limit(page.limit + 1)
    .offset(page.offset);
  return { items: rows.slice(0, page.limit).map(toNotification), more: rows.length > page.limit };
}

/** How many notifications a member has not read, of those they may still read. */
export async function countUnreadNotifications(
  database: Database,
  person: PersonRecord,
): Promise<number> {
  const [row] = await drizzleOf(database)
    .select({ unread: sql<number | string>`count(*)` })
    .from(notifications)
    .where(and(of(person), isNull(notifications.readAt)));
  return Number(row?.unread ?? 0);
}

/**
 * Marks a member's notifications as read, those named or every one: how many were marked.
 * One that is another member's, read already, or of a thing they may no longer see is none of
 * them, so that what is counted as marked is what their list shows.
 */
export async function markNotificationsRead(
  database: Database,
  person: PersonRecord,
  which: { readonly ids: readonly string[] } | "all",
  now: Date,
): Promise<number> {
  const marked = await drizzleOf(database)
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        of(person),
        isNull(notifications.readAt),
        which === "all" ? undefined : inArray(notifications.id, [...which.ids]),
      ),
    )
    .returning({ id: notifications.id });
  return marked.length;
}

/** Lets go of the notifications made before a moment: how many. The feed keeps what happened. */
export async function deleteNotificationsBefore(database: Database, before: Date): Promise<number> {
  const gone = await drizzleOf(database)
    .delete(notifications)
    .where(lt(notifications.createdAt, before))
    .returning({ id: notifications.id });
  return gone.length;
}

/** What a member chose to be told of, or nothing while they chose nothing. */
export async function chosenNotificationsOf(
  database: Database,
  personId: string,
): Promise<ChosenNotifications | undefined> {
  const [row] = await drizzleOf(database)
    .select({ chosen: people.notifications })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);
  return row?.chosen ?? undefined;
}

/**
 * Changes what a member chose to be told of: `change` is handed what they chose before and
 * answers what they choose now, or nothing for the defaults of what they are. The member's row
 * is held while it is read and written, so that two changes made at once, on a page and through
 * an agent say, are made one after the other and neither is lost.
 */
export async function changeChosenNotifications(
  database: Database,
  personId: string,
  change: (before: ChosenNotifications | undefined) => ChosenNotifications | undefined,
  now: Date,
): Promise<void> {
  await drizzleOf(database).transaction(async (tx) => {
    const [row] = await tx
      .select({ chosen: people.notifications })
      .from(people)
      .where(eq(people.id, personId))
      .for("update");
    await tx
      .update(people)
      .set({ notifications: change(row?.chosen ?? undefined) ?? null, updatedAt: now })
      .where(eq(people.id, personId));
  });
}

/**
 * Whom the console told of each of some events, and under which kind, as one plugin that
 * carries notifications elsewhere is handed them with an event (ADR-0157): every member a
 * notification was made for, but those who turned that kind off for this plugin. A member who
 * turned the kind off altogether has no notification, and so is none of them.
 */
export async function notificationsOfEvents(
  database: Database,
  eventIds: readonly number[],
  plugin: string,
): Promise<
  Map<number, { readonly personId: string; readonly kind: string; readonly woken: boolean }[]>
> {
  const found = new Map<number, { personId: string; kind: string; woken: boolean }[]>();
  if (eventIds.length === 0) {
    return found;
  }
  const rows = await drizzleOf(database)
    .select({
      eventId: notifications.eventId,
      personId: notifications.personId,
      kind: notifications.kind,
      woken: notifications.woken,
      chosen: people.notifications,
    })
    .from(notifications)
    .innerJoin(people, eq(people.id, notifications.personId))
    .where(inArray(notifications.eventId, [...eventIds]))
    .orderBy(notifications.eventId, notifications.personId);
  for (const row of rows) {
    if (!carriedBy(row.chosen, plugin, row.kind)) {
      continue;
    }
    const list = found.get(row.eventId) ?? [];
    list.push({ personId: row.personId, kind: row.kind, woken: row.woken });
    found.set(row.eventId, list);
  }
  return found;
}
