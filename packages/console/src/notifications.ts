// What a member is told of what happens on the board (ADR-0157): the kinds of it, what each
// member is told where they chose nothing, and how one event becomes at most one notification
// for one member. The console decides who is told and keeps the record; carrying it out of the
// console, to a messenger say, is a plugin's. The rules that name whom an event concerns are the
// worker's (`apps/console`), which reads the board; what is here needs no database, and is read
// by the pages and the command as the console reads it.

/**
 * What a notification is of, as the member reads why they are told:
 *
 * - `assigned`: a task was given to them, as its owner or as someone at work on it;
 * - `ready`: a task they are at work on is ready to begin, and not planned for a later day;
 * - `moved`: a task they own went from one state to another;
 * - `changed`: the title, the body or the days of a task of theirs changed;
 * - `commented`: someone wrote on a task of theirs;
 * - `archived`: a task of theirs was put away;
 * - `decision`: a decision waits for them;
 * - `answered`: a decision they raised was answered;
 * - `agent`: an agent account that reports to them stands otherwise: it stopped, was refused,
 *   failed or is not heard from, or runs again after; or it raised a decision for them, which
 *   is how an account tells its manager of what it will not do by itself (ADR-0158).
 */
export const NOTIFICATION_KINDS = [
  "assigned",
  "ready",
  "moved",
  "changed",
  "commented",
  "archived",
  "decision",
  "answered",
  "agent",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** What a member made of one task for themselves: told of everything on it, or of nothing. */
export const TASK_FOLLOW_STATES = ["following", "muted"] as const;
export type TaskFollowState = (typeof TASK_FOLLOW_STATES)[number];

/** Which kinds a member is told of, each on or off. */
export type NotificationKinds = Readonly<Record<NotificationKind, boolean>>;

const kinds = (on: readonly NotificationKind[]): NotificationKinds =>
  Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, on.includes(kind)])) as Record<
    NotificationKind,
    boolean
  >;

/**
 * What a member is told of where they chose nothing. A person is told of the agent accounts
 * that report to them, which is what cannot wait, and of nothing else until they turn it on:
 * what happens to their own work is on the board when they look, and a notification they did
 * not ask for is noise. An agent account is told of what asks something of it, a task to
 * begin, a comment, a decision that waits for it, an answer to one it raised: nobody attends
 * an agent account, so that what it is not told of it does not learn of.
 */
export const NOTIFICATION_DEFAULTS: Readonly<Record<"person" | "agent", NotificationKinds>> = {
  person: kinds(["agent"]),
  agent: kinds(["ready", "commented", "decision", "answered", "agent"]),
};

/** What a member chose, as it is kept: only what they chose, so that what they did not follows the defaults. */
export interface ChosenNotifications {
  readonly kinds?: Readonly<Partial<Record<NotificationKind, boolean>>> | undefined;
  /** The projects they are told nothing of, by their ids. */
  readonly projectsOff?: readonly string[] | undefined;
  /** Whether they are told of what an agent of their own did as them. */
  readonly ownAgents?: boolean | undefined;
}

/** What a member is told of: their choices over the defaults of what they are. */
export interface NotificationSettings {
  readonly kinds: NotificationKinds;
  readonly projectsOff: readonly string[];
  readonly ownAgents: boolean;
}

/** A member's settings from what they chose, `null` or nothing for a member who chose nothing. */
export function notificationSettingsOf(
  member: "person" | "agent",
  chosen: ChosenNotifications | null | undefined,
): NotificationSettings {
  const defaults = NOTIFICATION_DEFAULTS[member];
  return {
    kinds: Object.fromEntries(
      NOTIFICATION_KINDS.map((kind) => {
        const said = chosen?.kinds?.[kind];
        return [kind, typeof said === "boolean" ? said : defaults[kind]];
      }),
    ) as Record<NotificationKind, boolean>,
    projectsOff: [...(chosen?.projectsOff ?? [])],
    ownAgents: chosen?.ownAgents === true,
  };
}

/**
 * The kind an event is told to one member under, or nothing where they are told nothing of it.
 * `candidates` are the kinds the event is to the member by what they are to the thing, the one
 * that says most first: a task made ready that they are at work on is `ready` before it is
 * `assigned`.
 *
 * - A task they muted tells them nothing, whatever they are to it.
 * - A task they follow tells them everything, under the first kind, whatever their settings:
 *   following is the member saying so of that one task.
 * - Otherwise they are told under the first kind they have on, and of nothing in a project
 *   they turned off.
 *
 * `follow` is theirs of the task the event is of; nothing for an event of no task.
 */
export function notificationKindFor(input: {
  readonly candidates: readonly NotificationKind[];
  readonly settings: NotificationSettings;
  readonly follow: TaskFollowState | undefined;
  /** The project the event is of, by its id; nothing for an event of the workspace itself. */
  readonly projectId: string | undefined;
}): NotificationKind | undefined {
  const { candidates, settings, follow } = input;
  if (candidates.length === 0 || follow === "muted") {
    return undefined;
  }
  if (follow === "following") {
    return candidates[0];
  }
  if (input.projectId !== undefined && settings.projectsOff.includes(input.projectId)) {
    return undefined;
  }
  return candidates.find((kind) => settings.kinds[kind]);
}

/** How many notifications a listing answers at once, and at most. */
export const NOTIFICATIONS_PAGE = 50;
export const MAX_NOTIFICATIONS_PAGE = 200;
/** How many notifications one request marks as read by their ids. */
export const MAX_NOTIFICATIONS_READ = 200;
/** How many projects a member may turn off. */
export const MAX_NOTIFICATION_PROJECTS_OFF = 200;
/** For how many days a notification is kept (the record is the feed's; this is the member's list of it). */
export const NOTIFICATIONS_KEPT_DAYS = 90;
