import type { RestRun, RestTaskBrief, RestWorkBrief, RunStatus, TaskState } from "./api.js";
import type { ProjectClient } from "./client.js";
import { addDays, dayOf, weekOf } from "./dates.js";

// The board's side of a desk's page (ADR-0116): what a member's own console shows of their own
// work on the board, across the projects they may see. Three views: what stands now, the
// figures, and the archive. Each is read from the console when it is looked at, a project at a
// time through the routes there are, and what one visit reads is bounded here. This module is
// the reading and the counting, with no React in it; the views are `components/desk.tsx` and
// the page that composes them, with the desk's records before them, is `desk-page.tsx`.

/** How many of a person's projects one visit reads: the rest are named as not read. */
export const DESK_PROJECTS = 12;
/** How many tasks of a listing a project gives one visit at once. */
export const DESK_TASKS = 100;
/** How many runs a project gives one visit at once: a run carries its reports, so fewer. */
export const DESK_RUNS = 30;
/** How many weeks the figures count back, this week among them. */
export const DESK_WEEKS = 8;
/** How many words a search of the archive takes; the rest are dropped. */
export const DESK_WORDS = 8;

/** A project as a row names it: what the plate says of one, which a project's own answer carries too. */
export type DeskProject = RestWorkBrief["tasks"][number]["project"];

/** A task of the person's with the project it is in. */
export interface DeskTask {
  readonly project: DeskProject;
  readonly task: RestTaskBrief;
}

/** A run of the person's with the project it is in and, where the visit read its task, the task's title. */
export interface DeskRun {
  readonly project: DeskProject;
  readonly run: RestRun;
  readonly title: string | undefined;
}

/** The states of open work, in the order a desk shows them: what is at hand first. */
export const DESK_STATES = [
  "in_progress",
  "in_review",
  "ready",
  "idea",
] as const satisfies readonly TaskState[];

/** The open tasks by state, in the desk's order, each group in the order the tasks came (the sooner due first). */
export function standingOf(tasks: readonly DeskTask[]): readonly {
  readonly state: (typeof DESK_STATES)[number];
  readonly tasks: readonly DeskTask[];
}[] {
  return DESK_STATES.map((state) => ({
    state,
    tasks: tasks.filter((item) => item.task.state === state),
  }));
}

/** How a run can have ended. */
export const DESK_ENDINGS = [
  "finished",
  "failed",
  "abandoned",
] as const satisfies readonly RunStatus[];
export type DeskEnding = (typeof DESK_ENDINGS)[number];

/** One week of the figures: its first and last day, and how many tasks were done in it. */
export interface DeskWeek {
  readonly start: string;
  readonly end: string;
  readonly done: number;
}

/** A category as a task carries it. */
export type DeskCategory = NonNullable<RestTaskBrief["category"]>;

export interface DeskFigures {
  /** The weeks counted, the oldest first; the last is the week of `today`. */
  readonly weeks: readonly DeskWeek[];
  /** The tasks done within those weeks, in all. */
  readonly done: number;
  /** The runs that ended within those weeks, by how they ended. */
  readonly runs: Readonly<Record<DeskEnding, number>>;
  /** The same by project, the most done first; a project with neither is left out. */
  readonly byProject: readonly {
    readonly project: DeskProject;
    readonly done: number;
    readonly runs: number;
  }[];
  /** The tasks done by category, the most first; those sorted into none last, under `null`. */
  readonly byCategory: readonly { readonly category: DeskCategory | null; readonly done: number }[];
}

/**
 * The figures of a stretch of weeks, counted from what a visit read: the tasks by the day they
 * were done, the runs by the day they ended, both as the browser's clock has the day. A task
 * that is not done, or a run still open, counts nowhere.
 */
export function figuresOf(input: {
  readonly tasks: readonly DeskTask[];
  readonly runs: readonly DeskRun[];
  readonly today: string;
  /** The weekday a week begins on: 1 for Monday, 7 for Sunday. */
  readonly firstDay?: number | undefined;
  readonly weeks?: number | undefined;
}): DeskFigures {
  const count = Math.max(1, input.weeks ?? DESK_WEEKS);
  const thisWeek = weekOf(input.today, input.firstDay ?? 1);
  const last = thisWeek[0] ?? input.today;
  const weeks = Array.from({ length: count }, (_, index) => {
    const start = addDays(last, (index - (count - 1)) * 7);
    return { start, end: addDays(start, 6), done: 0 };
  });
  const from = weeks[0]?.start ?? input.today;
  const until = weeks.at(-1)?.end ?? input.today;
  const within = (instant: string | null): string | undefined => {
    if (instant === null) {
      return undefined;
    }
    const date = new Date(instant);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    const day = dayOf(date);
    return day >= from && day <= until ? day : undefined;
  };
  const projects = new Map<string, { project: DeskProject; done: number; runs: number }>();
  const projectOf = (project: DeskProject) => {
    const found = projects.get(project.key) ?? { project, done: 0, runs: 0 };
    projects.set(project.key, found);
    return found;
  };
  const categories = new Map<string, { category: DeskCategory | null; done: number }>();
  let done = 0;
  const seen = new Set<string>();
  for (const { project, task } of input.tasks) {
    const day = task.state === "done" ? within(task.doneAt) : undefined;
    if (day === undefined || seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);
    const week = weeks.find((candidate) => day >= candidate.start && day <= candidate.end);
    if (week !== undefined) {
      week.done += 1;
    }
    done += 1;
    projectOf(project).done += 1;
    const key = task.category?.key ?? "";
    const category = categories.get(key) ?? { category: task.category, done: 0 };
    category.done += 1;
    categories.set(key, category);
  }
  const runs: Record<DeskEnding, number> = { finished: 0, failed: 0, abandoned: 0 };
  for (const { project, run } of input.runs) {
    const ending = DESK_ENDINGS.find((candidate) => candidate === run.status);
    if (ending === undefined || within(run.endedAt) === undefined || seen.has(run.id)) {
      continue;
    }
    seen.add(run.id);
    runs[ending] += 1;
    projectOf(project).runs += 1;
  }
  return {
    weeks,
    done,
    runs,
    byProject: [...projects.values()].sort(
      (a, b) => b.done - a.done || b.runs - a.runs || a.project.name.localeCompare(b.project.name),
    ),
    byCategory: [...categories.values()].sort(
      (a, b) =>
        Number(a.category === null) - Number(b.category === null) ||
        b.done - a.done ||
        (a.category?.name ?? "").localeCompare(b.category?.name ?? ""),
    ),
  };
}

/** The words of a search, as they are looked for: lowercased, without what is between them, `DESK_WORDS` at most. */
export function wordsOf(query: string): readonly string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, DESK_WORDS);
}

/** Whether a run is found by every word: in its task's title or number, or in what it said at its end. */
export function runHolds(run: DeskRun, words: readonly string[]): boolean {
  if (words.length === 0) {
    return true;
  }
  const text =
    `#${run.run.taskNumber} ${run.title ?? ""} ${run.run.summary ?? ""} ${run.run.agent}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/** When a task was closed, as the archive orders it: put away, else done, else last changed. */
function closedAt(task: RestTaskBrief): string {
  return task.archivedAt ?? task.doneAt ?? task.updatedAt;
}

/** What a desk reads of the console: a project at a time, its tasks and its runs. */
export interface DeskReader {
  project(key: string): Pick<ProjectClient, "tasks" | "runs">;
}

/** A page of a person's closed work: what one visit read, and whether the console has more. */
export interface DeskHistory {
  /** The tasks the person worked on that are done, dropped or put away, the last closed first. */
  readonly tasks: readonly DeskTask[];
  /** The person's runs that ended, the last ended first. */
  readonly runs: readonly DeskRun[];
  /** Whether a project has more of either than this page read. */
  readonly more: boolean;
  /** How many projects were read, and how many the person may see. */
  readonly read: number;
  readonly of: number;
}

/**
 * A page of the person's closed work, across their projects: from each of the first
 * `DESK_PROJECTS`, the closed tasks they worked on that are on the board, those put away, and
 * the runs that ended, of which theirs are kept. Three requests a project, each bounded;
 * `words` narrows the tasks at the console and the runs here; `page` is which page of each.
 */
export async function readHistory(
  reader: DeskReader,
  input: {
    readonly projects: readonly DeskProject[];
    readonly personId: string;
    readonly words?: string | undefined;
    readonly page?: number | undefined;
  },
  signal?: AbortSignal,
): Promise<DeskHistory> {
  const projects = input.projects.slice(0, DESK_PROJECTS);
  const page = Math.max(0, input.page ?? 0);
  const words = wordsOf(input.words ?? "");
  const q = words.length === 0 ? undefined : words.join(" ");
  const read = await Promise.all(
    projects.map(async (project) => {
      const client = reader.project(project.key);
      const filter = {
        worker: input.personId,
        q,
        limit: DESK_TASKS,
        offset: page * DESK_TASKS,
      };
      const [closed, away, ended] = await Promise.all([
        client.tasks({ ...filter, open: false }, signal),
        client.tasks({ ...filter, archived: true }, signal),
        client.runs({ open: false, limit: DESK_RUNS, offset: page * DESK_RUNS }, signal),
      ]);
      const tasks = [...closed.items, ...away.items];
      const titles = new Map(tasks.map((task) => [task.id, task.title]));
      return {
        tasks: tasks.map((task) => ({ project, task })),
        runs: ended.items
          .filter((run) => run.person.id === input.personId)
          .map((run) => ({ project, run, title: titles.get(run.taskId) }))
          .filter((run) => runHolds(run, words)),
        more: closed.more || away.more || ended.more,
      };
    }),
  );
  return {
    tasks: read
      .flatMap((one) => one.tasks)
      .sort((a, b) => closedAt(b.task).localeCompare(closedAt(a.task))),
    runs: read
      .flatMap((one) => one.runs)
      .sort((a, b) => (b.run.endedAt ?? "").localeCompare(a.run.endedAt ?? "")),
    more: read.some((one) => one.more),
    read: projects.length,
    of: input.projects.length,
  };
}

/** Two pages of a person's closed work as one: the later after the earlier, nothing twice, ordered anew. */
export function withHistory(earlier: DeskHistory, later: DeskHistory): DeskHistory {
  const tasks = new Map(
    [...earlier.tasks, ...later.tasks].map((item) => [item.task.id, item] as const),
  );
  const runs = new Map(
    [...earlier.runs, ...later.runs].map((item) => [item.run.id, item] as const),
  );
  return {
    tasks: [...tasks.values()].sort((a, b) => closedAt(b.task).localeCompare(closedAt(a.task))),
    runs: [...runs.values()].sort((a, b) =>
      (b.run.endedAt ?? "").localeCompare(a.run.endedAt ?? ""),
    ),
    more: later.more,
    read: later.read,
    of: later.of,
  };
}

/**
 * The person's runs that are open, in the projects where a task on their plate says one is:
 * one request a project, `DESK_PROJECTS` at most, each run with its task's title from the plate.
 */
export async function readOpenRuns(
  reader: DeskReader,
  input: { readonly tasks: readonly DeskTask[]; readonly personId: string },
  signal?: AbortSignal,
): Promise<readonly DeskRun[]> {
  const projects = new Map<string, DeskProject>();
  for (const { project, task } of input.tasks) {
    if (task.openRuns > 0 && !projects.has(project.key)) {
      projects.set(project.key, project);
    }
  }
  const titles = new Map(input.tasks.map(({ task }) => [task.id, task.title]));
  const read = await Promise.all(
    [...projects.values()].slice(0, DESK_PROJECTS).map(async (project) => {
      const open = await reader.project(project.key).runs({ open: true, limit: DESK_RUNS }, signal);
      return open.items
        .filter((run) => run.person.id === input.personId)
        .map((run) => ({ project, run, title: titles.get(run.taskId) }));
    }),
  );
  return read.flat().sort((a, b) => b.run.lastHeardAt.localeCompare(a.run.lastHeardAt));
}
