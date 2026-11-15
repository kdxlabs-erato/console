import { describe, expect, it } from "vitest";
import type { RestPerson, RestRun, RestRuns, RestTask, RestTasks } from "./api.js";
import type { TaskFilter } from "./client.js";
import {
  DESK_PROJECTS,
  DESK_RUNS,
  DESK_TASKS,
  DESK_WORDS,
  type DeskProject,
  type DeskReader,
  type DeskRun,
  type DeskTask,
  figuresOf,
  readHistory,
  readOpenRuns,
  runHolds,
  standingOf,
  withHistory,
  wordsOf,
} from "./desk.js";

const alice: RestPerson = {
  id: "0199c4d8-0000-7000-8000-000000000001",
  login: "alice",
  name: "Alice Example",
  avatar: null,
  role: "admin",
  status: "active",
  source: "listed",
  deactivatedAt: null,
};
const bob: RestPerson = { ...alice, id: "0199c4d8-0000-7000-8000-000000000002", login: "bob" };

const web: DeskProject = { key: "web", name: "The web app", color: null, symbol: null, icon: null };
const docs: DeskProject = {
  key: "docs",
  name: "The docs",
  color: "green",
  symbol: "D",
  icon: null,
};

let made = 0;
/** An id of the shape the API gives, a new one each time. */
const id = (): string => {
  made += 1;
  return `0199c4d8-0000-7000-8000-${String(made).padStart(12, "0")}`;
};

const task = (overrides: Partial<RestTask> = {}): RestTask => ({
  id: id(),
  number: 7,
  title: "Ship the release",
  body: "",
  state: "ready",
  priority: "normal",
  owner: alice,
  workers: [alice],
  parentId: null,
  category: null,
  goalId: null,
  startsOn: null,
  dueOn: null,
  startedAt: null,
  doneAt: null,
  archivedAt: null,
  links: [],
  openDecisions: 0,
  openRuns: 0,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
  ...overrides,
});

const run = (overrides: Partial<RestRun> = {}): RestRun => ({
  id: id(),
  taskId: id(),
  taskNumber: 7,
  person: alice,
  agent: "Claude Code",
  status: "finished",
  startedAt: "2026-10-05T12:00:00.000Z",
  endedAt: "2026-10-06T12:00:00.000Z",
  lastHeardAt: "2026-10-06T12:00:00.000Z",
  summary: null,
  reports: [],
  artifacts: [],
  waitingFor: null,
  ...overrides,
});

const engineering = { key: "engineering", name: "Engineering", color: "blue" } as const;
const design = { key: "design", name: "Design", color: "pink" } as const;

/** Midday of a day, in UTC: the same day by any clock within eleven hours of it. */
const noon = (day: string): string => `${day}T12:00:00.000Z`;

describe("what stands now", () => {
  it("groups the open tasks by state, what is at hand first, each in the order it came", () => {
    const items: DeskTask[] = [
      { project: web, task: task({ state: "ready", title: "second" }) },
      { project: web, task: task({ state: "in_progress", title: "first" }) },
      { project: docs, task: task({ state: "ready", title: "third" }) },
      { project: docs, task: task({ state: "in_review", title: "reviewed" }) },
    ];
    const groups = standingOf(items);
    expect(groups.map((group) => group.state)).toEqual([
      "in_progress",
      "in_review",
      "ready",
      "idea",
    ]);
    expect(groups.map((group) => group.tasks.map((item) => item.task.title))).toEqual([
      ["first"],
      ["reviewed"],
      ["second", "third"],
      [],
    ]);
  });
});

describe("the figures", () => {
  // 2026-10-14 is a Wednesday: its week begins on Monday the 12th, or on Sunday the 11th.
  const today = "2026-10-14";

  it("counts back the weeks, the last being this one, as the week begins", () => {
    const figures = figuresOf({ tasks: [], runs: [], today, weeks: 3 });
    expect(figures.weeks).toEqual([
      { start: "2026-09-28", end: "2026-10-04", done: 0 },
      { start: "2026-10-05", end: "2026-10-11", done: 0 },
      { start: "2026-10-12", end: "2026-10-18", done: 0 },
    ]);
    const sundays = figuresOf({ tasks: [], runs: [], today, weeks: 2, firstDay: 7 });
    expect(sundays.weeks.map((week) => week.start)).toEqual(["2026-10-04", "2026-10-11"]);
    expect(figuresOf({ tasks: [], runs: [], today }).weeks).toHaveLength(8);
  });

  it("counts a task in the week it was done, once, and only when it is done", () => {
    const twice = task({ state: "done", doneAt: noon("2026-10-13"), category: engineering });
    const figures = figuresOf({
      today,
      weeks: 2,
      tasks: [
        { project: web, task: twice },
        // The same task from the archive's listing: counted once.
        { project: web, task: twice },
        { project: web, task: task({ state: "done", doneAt: noon("2026-10-06") }) },
        { project: docs, task: task({ state: "done", doneAt: noon("2026-10-12") }) },
        // Before the weeks counted, dropped, and open: nowhere.
        { project: docs, task: task({ state: "done", doneAt: noon("2026-09-01") }) },
        { project: docs, task: task({ state: "dropped", doneAt: null }) },
        { project: docs, task: task({ state: "in_progress" }) },
      ],
      runs: [],
    });
    expect(figures.weeks.map((week) => week.done)).toEqual([1, 2]);
    expect(figures.done).toBe(3);
    expect(figures.byProject.map((row) => [row.project.key, row.done])).toEqual([
      ["web", 2],
      ["docs", 1],
    ]);
    // The categories by how much was done, those sorted into none last.
    expect(figures.byCategory.map((row) => [row.category?.key ?? null, row.done])).toEqual([
      ["engineering", 1],
      [null, 2],
    ]);
  });

  it("counts a run by how it ended, within the weeks, and an open one nowhere", () => {
    const figures = figuresOf({
      today,
      weeks: 2,
      tasks: [],
      runs: [
        { project: web, run: run({ status: "finished", endedAt: noon("2026-10-13") }), title: "a" },
        { project: web, run: run({ status: "failed", endedAt: noon("2026-10-07") }), title: "b" },
        {
          project: docs,
          run: run({ status: "abandoned", endedAt: noon("2026-10-12") }),
          title: undefined,
        },
        {
          project: docs,
          run: run({ status: "finished", endedAt: noon("2026-08-01") }),
          title: "c",
        },
        { project: docs, run: run({ status: "running", endedAt: null }), title: "d" },
        { project: docs, run: run({ status: "waiting", endedAt: null }), title: "e" },
      ],
    });
    expect(figures.runs).toEqual({ finished: 1, failed: 1, abandoned: 1 });
    expect(figures.byProject.map((row) => [row.project.key, row.runs])).toEqual([
      ["web", 2],
      ["docs", 1],
    ]);
  });

  it("orders the categories by what was done in each", () => {
    const figures = figuresOf({
      today,
      tasks: [
        { project: web, task: task({ state: "done", doneAt: noon(today), category: design }) },
        { project: web, task: task({ state: "done", doneAt: noon(today), category: engineering }) },
        { project: web, task: task({ state: "done", doneAt: noon(today), category: engineering }) },
      ],
      runs: [],
    });
    expect(figures.byCategory.map((row) => row.category?.key)).toEqual(["engineering", "design"]);
  });
});

describe("the words of a search", () => {
  it("are lowercased, parted at the spaces, and bounded", () => {
    expect(wordsOf("  Ship   the RELEASE ")).toEqual(["ship", "the", "release"]);
    expect(wordsOf("")).toEqual([]);
    expect(wordsOf(Array.from({ length: 40 }, (_, index) => `w${index}`).join(" "))).toHaveLength(
      DESK_WORDS,
    );
  });

  it("find a run by its task's title, its number, or what it said at its end", () => {
    const found: DeskRun = {
      project: web,
      run: run({ taskNumber: 12, summary: "Refused the EMPTY file." }),
      title: "The import parser",
    };
    expect(runHolds(found, [])).toBe(true);
    expect(runHolds(found, ["parser", "empty"])).toBe(true);
    expect(runHolds(found, ["#12"])).toBe(true);
    expect(runHolds(found, ["parser", "missing"])).toBe(false);
    expect(runHolds({ ...found, title: undefined }, ["parser"])).toBe(false);
  });
});

/** A reader that answers from what it is given and keeps what it was asked: a desk asks for the brief form of both. */
function readerOf(answers: {
  readonly tasks?: (key: string, filter: TaskFilter) => RestTasks;
  readonly runs?: (
    key: string,
    filter: { readonly open?: boolean; readonly limit?: number; readonly offset?: number },
  ) => RestRuns;
}): {
  readonly reader: DeskReader;
  readonly asked: { readonly key: string; readonly what: string; readonly filter: unknown }[];
} {
  const asked: { key: string; what: string; filter: unknown }[] = [];
  return {
    asked,
    reader: {
      project: (key) => ({
        taskBriefs: async (filter = {}) => {
          asked.push({ key, what: "tasks", filter });
          return answers.tasks?.(key, filter) ?? { items: [], more: false };
        },
        runBriefs: async (filter = {}) => {
          asked.push({ key, what: "runs", filter });
          return answers.runs?.(key, filter) ?? { items: [], more: false };
        },
      }),
    },
  };
}

describe("reading a person's closed work", () => {
  it("asks each project three bounded questions, and keeps the person's own runs", async () => {
    const closed = task({
      state: "done",
      doneAt: noon("2026-10-13"),
      title: "Closed on the board",
    });
    const away = task({
      state: "done",
      doneAt: noon("2026-10-01"),
      archivedAt: noon("2026-10-14"),
      title: "Put away",
    });
    const mine = run({ taskId: closed.id, endedAt: noon("2026-10-13") });
    const theirs = run({ person: bob, endedAt: noon("2026-10-14") });
    const { reader, asked } = readerOf({
      tasks: (key, filter) =>
        key !== "web"
          ? { items: [], more: false }
          : filter.archived === true
            ? { items: [away], more: true }
            : { items: [closed], more: false },
      runs: (key) =>
        key === "web" ? { items: [theirs, mine], more: false } : { items: [], more: false },
    });
    const history = await readHistory(reader, { projects: [web, docs], personId: alice.id });
    expect(asked).toHaveLength(6);
    expect(asked.filter((one) => one.key === "web")).toEqual([
      {
        key: "web",
        what: "tasks",
        filter: { worker: alice.id, q: undefined, limit: DESK_TASKS, offset: 0, open: false },
      },
      {
        key: "web",
        what: "tasks",
        filter: { worker: alice.id, q: undefined, limit: DESK_TASKS, offset: 0, archived: true },
      },
      { key: "web", what: "runs", filter: { open: false, limit: DESK_RUNS, offset: 0 } },
    ]);
    // The last closed first: put away on the 14th, then done on the 13th.
    expect(history.tasks.map((item) => item.task.title)).toEqual([
      "Put away",
      "Closed on the board",
    ]);
    expect(history.runs.map((item) => item.run.id)).toEqual([mine.id]);
    expect(history.runs[0]?.title).toBe("Closed on the board");
    expect(history.more).toBe(true);
    expect([history.read, history.of]).toEqual([2, 2]);
  });

  it("narrows the tasks at the console and the runs here, and reads the page asked for", async () => {
    const found = task({ state: "done", title: "The import parser" });
    const { reader, asked } = readerOf({
      tasks: (_key, filter) =>
        filter.archived === true ? { items: [], more: false } : { items: [found], more: false },
      runs: () => ({
        items: [
          run({ taskId: found.id, summary: "Refused an empty file." }),
          run({ summary: "Something else." }),
        ],
        more: false,
      }),
    });
    const history = await readHistory(reader, {
      projects: [web],
      personId: alice.id,
      words: " Import  PARSER ",
      page: 2,
    });
    expect(asked[0]?.filter).toMatchObject({ q: "import parser", offset: 2 * DESK_TASKS });
    expect(asked[2]?.filter).toMatchObject({ offset: 2 * DESK_RUNS });
    expect(history.runs).toHaveLength(1);
    expect(history.runs[0]?.title).toBe("The import parser");
  });

  it("reads no more projects than a visit may, and says how many there are", async () => {
    const many = Array.from({ length: DESK_PROJECTS + 5 }, (_, index) => ({
      ...web,
      key: `p${index}`,
    }));
    const { reader, asked } = readerOf({});
    const history = await readHistory(reader, { projects: many, personId: alice.id });
    expect(new Set(asked.map((one) => one.key)).size).toBe(DESK_PROJECTS);
    expect([history.read, history.of]).toEqual([DESK_PROJECTS, DESK_PROJECTS + 5]);
    expect(history.more).toBe(false);
  });

  it("joins a later page to an earlier one, nothing twice", () => {
    const first = task({ state: "done", doneAt: noon("2026-10-13"), title: "first" });
    const second = task({ state: "done", doneAt: noon("2026-10-01"), title: "second" });
    const ended = run({ endedAt: noon("2026-10-02") });
    const joined = withHistory(
      { tasks: [{ project: web, task: first }], runs: [], more: true, read: 1, of: 1 },
      {
        tasks: [
          { project: web, task: second },
          { project: web, task: first },
        ],
        runs: [{ project: web, run: ended, title: undefined }],
        more: false,
        read: 1,
        of: 1,
      },
    );
    expect(joined.tasks.map((item) => item.task.title)).toEqual(["first", "second"]);
    expect(joined.runs).toHaveLength(1);
    expect(joined.more).toBe(false);
  });
});

describe("reading a person's open runs", () => {
  it("asks only the projects where a task of the plate says a run is open", async () => {
    const working = task({ state: "in_progress", openRuns: 1, title: "At work" });
    const quiet = task({ state: "ready", openRuns: 0 });
    const mine = run({
      taskId: working.id,
      status: "running",
      endedAt: null,
      lastHeardAt: noon("2026-10-13"),
    });
    const waiting = run({ status: "waiting", endedAt: null, lastHeardAt: noon("2026-10-14") });
    const theirs = run({ person: bob, status: "running", endedAt: null });
    const { reader, asked } = readerOf({
      runs: () => ({ items: [mine, theirs, waiting], more: false }),
    });
    const runs = await readOpenRuns(reader, {
      tasks: [
        { project: web, task: working },
        { project: docs, task: quiet },
      ],
      personId: alice.id,
    });
    expect(asked).toEqual([{ key: "web", what: "runs", filter: { open: true, limit: DESK_RUNS } }]);
    // The last heard from first; another person's run on the same task is not the person's.
    expect(runs.map((item) => item.run.id)).toEqual([waiting.id, mine.id]);
    expect(runs.map((item) => item.title)).toEqual([undefined, "At work"]);
  });
});
