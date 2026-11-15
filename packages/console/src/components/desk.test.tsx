import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RestDecision, RestPerson, RestRun, RestTask } from "../api.js";
import { type DeskProject, type DeskRun, figuresOf } from "../desk.js";
import { DESK_PAGE_KEY, deskHref, deskPage, deskViewOf } from "../desk-page.js";
import { KOREAN, LanguageContext } from "../i18n/index.js";
import { matchRoute } from "../router.js";
import {
  DESK_COMMAND,
  DeskArchive,
  DeskCommand,
  DeskFiguresView,
  DeskStanding,
  DeskViews,
  weekLabel,
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

const web: DeskProject = { key: "web", name: "The web app", color: null, symbol: null, icon: null };
const docs: DeskProject = {
  key: "docs",
  name: "The docs",
  color: "green",
  symbol: "D",
  icon: null,
};

let made = 0;
const id = (): string => {
  made += 1;
  return `0199c4d8-0000-7000-8000-${String(made).padStart(12, "0")}`;
};

const task = (overrides: Partial<RestTask> = {}): RestTask => ({
  id: id(),
  number: 7,
  title: "Ship the release <b>now</b>",
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
  agent: "Claude Code <on> the laptop",
  status: "running",
  startedAt: "2026-10-13T12:00:00.000Z",
  endedAt: null,
  lastHeardAt: "2026-10-13T12:30:00.000Z",
  summary: null,
  reports: [],
  artifacts: [],
  waitingFor: null,
  ...overrides,
});

const decision: RestDecision = {
  id: "0199c4d8-0000-7000-8000-0000000000d1",
  question: "Which <i>one</i>?",
  body: "",
  options: [
    { id: "1", label: "The first" },
    { id: "2", label: "The second" },
  ],
  taskId: null,
  taskNumber: null,
  raisedBy: alice,
  decider: alice,
  run: null,
  answer: null,
  outcome: null,
  createdAt: "2026-10-09T10:00:00.000Z",
  updatedAt: "2026-10-09T10:00:00.000Z",
};

const hrefs = {
  taskHref: (key: string, number: number) => `/projects/${key}/tasks/${number}`,
  decisionHref: (key: string, decisionId: string) => `/projects/${key}/decisions/${decisionId}`,
};

const TODAY = "2026-10-14";

describe("a desk's views", () => {
  it("are tabs with an address each, the current one marked", () => {
    const html = renderToStaticMarkup(
      <DeskViews view="figures" viewHref={(view) => deskHref("/pages/desk", view)} />,
    );
    expect(html).toContain('class="sc-subtabs sc-desk-views"');
    // The records the desk keeps first, at the page's own address; then the board's views,
    // each named for the board, so that its figures are not taken for a collection's results.
    expect(
      [...html.matchAll(/<a class="sc-tab[^"]*" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(
        (match) => [match[1], match[2]],
      ),
    ).toEqual([
      ["/pages/desk", "Records"],
      ["/pages/desk?view=now", "On the board"],
      ["/pages/desk?view=figures", "Board figures"],
      ["/pages/desk?view=archive", "Board archive"],
    ]);
    expect(html).toContain(
      '<a class="sc-tab sc-tab-current" href="/pages/desk?view=figures" aria-current="page">Board figures</a>',
    );
    const korean = renderToStaticMarkup(
      <LanguageContext.Provider value={KOREAN}>
        <DeskViews view="records" viewHref={(view) => deskHref("/pages/desk", view)} />
      </LanguageContext.Provider>,
    );
    expect([...korean.matchAll(/>([^<]+)<\/a>/g)].map((match) => match[1])).toEqual([
      "기록",
      "보드 현황",
      "보드 통계",
      "보드 아카이브",
    ]);
  });

  it("are read from the address, and the board's archive's words with them", () => {
    // The page's own address is the records' view, and so is what names a collection of them.
    expect(deskViewOf("")).toEqual({ view: "records", words: "" });
    expect(deskViewOf("?collection=ad-creatives&item=hook-1")).toEqual({
      view: "records",
      words: "",
    });
    expect(deskViewOf("?view=now")).toEqual({ view: "now", words: "" });
    expect(deskViewOf("?view=figures")).toEqual({ view: "figures", words: "" });
    expect(deskViewOf("?view=archive&q=%20the+parser ")).toEqual({
      view: "archive",
      words: "the parser",
    });
    // A view the desk has not is the first; the words are the archive's alone.
    expect(deskViewOf("?view=nonsense")).toEqual({ view: "records", words: "" });
    expect(deskHref("/pages/desk", "records")).toBe("/pages/desk");
    expect(deskHref("/pages/desk", "now")).toBe("/pages/desk?view=now");
    expect(deskHref("/pages/desk", "archive", "the parser")).toBe(
      "/pages/desk?view=archive&q=the+parser",
    );
    expect(deskHref("/pages/desk", "figures", "the parser")).toBe("/pages/desk?view=figures");
    // A view's address is the page's own with a query: a link to it is followed in place.
    expect(matchRoute("/pages/desk", "?view=archive&q=the+parser")).toEqual({
      name: "custom",
      level: "workspace",
      page: "desk",
    });
  });

  it("are one page of a console of one's own, with its tab's word in each language", () => {
    const page = deskPage();
    expect(page.key).toBe(DESK_PAGE_KEY);
    expect(page.level).toBe("workspace");
    expect(page.label).toEqual({ en: "Desk", ko: "데스크" });
    expect(deskPage({ key: "mine" }).key).toBe("mine");
  });
});

describe("what stands now", () => {
  it("lists the decisions that wait, the open runs and the open tasks by state, in that order", () => {
    const working = task({ state: "in_progress", number: 3, title: "At work", openRuns: 1 });
    const html = renderToStaticMarkup(
      <DeskStanding
        tasks={[
          { project: web, task: working },
          { project: docs, task: task({ state: "ready", number: 9, dueOn: "2026-10-10" }) },
        ]}
        decisions={[{ project: web, decision }]}
        runs={[
          { project: web, run: run({ taskId: working.id, taskNumber: 3 }), title: "At work" },
          { project: docs, run: run({ taskNumber: 12, status: "waiting" }), title: undefined },
        ]}
        today={TODAY}
        {...hrefs}
      />,
    );
    // The states in the desk's order, a state with nothing in it left out, after what waits.
    const sections = [...html.matchAll(/<section class="sc-task-section" aria-label="([^"]+)"/g)];
    // What waits for the person first, then what is under way, then the tasks by state.
    expect(sections.map((match) => match[1])).toEqual([
      "Decisions waiting for you",
      "Open runs",
      "In progress",
      "Ready",
    ]);
    expect(html).toContain('href="/projects/web/tasks/3"');
    expect(html).toContain('href="/projects/docs/tasks/9"');
    expect(html).toContain("sc-mark-sm sc-category-green");
    // What people wrote is text.
    expect(html).toContain("Ship the release &lt;b&gt;now&lt;/b&gt;");
    expect(html).toContain("Which &lt;i&gt;one&lt;/i&gt;?");
    expect(html).toContain(`href="/projects/web/decisions/${decision.id}"`);
    // A run names its task where the plate carries it, and the agent alone where it does not.
    expect(html).toMatch(
      /href="\/projects\/web\/tasks\/3"><span class="sc-card-number">#3<\/span> At work/,
    );
    expect(html).toMatch(
      /href="\/projects\/docs\/tasks\/12"><span class="sc-card-number">#12<\/span> Claude Code &lt;on&gt; the laptop/,
    );
    expect(html).toContain("Waiting for a decision");
    expect(html).toContain("last heard");
  });

  it("says so where no decision waits and no run is open", () => {
    const html = renderToStaticMarkup(
      <DeskStanding
        tasks={[{ project: web, task: task({ state: "idea" }) }]}
        decisions={[]}
        runs={[]}
        today={TODAY}
        {...hrefs}
      />,
    );
    expect(html).toContain("No decision waits for your answer.");
    expect(html).toContain("No run of yours is open.");
    expect(html).not.toContain("sc-desk-empty");
  });
});

describe("the figures", () => {
  const engineering = { key: "engineering", name: "Engineering", color: "blue" } as const;
  const figures = figuresOf({
    today: TODAY,
    weeks: 2,
    tasks: [
      {
        project: web,
        task: task({ state: "done", doneAt: "2026-10-13T12:00:00.000Z", category: engineering }),
      },
      { project: docs, task: task({ state: "done", doneAt: "2026-10-06T12:00:00.000Z" }) },
    ],
    runs: [
      {
        project: web,
        run: run({ status: "finished", endedAt: "2026-10-13T12:00:00.000Z" }),
        title: "a",
      },
      {
        project: web,
        run: run({ status: "failed", endedAt: "2026-10-13T12:00:00.000Z" }),
        title: "b",
      },
    ],
  });

  it("are facts in the console's parts: by week, by ending, by project and by category", () => {
    const html = renderToStaticMarkup(<DeskFiguresView figures={figures} />);
    for (const section of ["Done by week", "How runs ended", "By project", "By category"]) {
      expect(html).toContain(`aria-label="${section}"`);
    }
    expect(html.match(/<dl class="sc-facts"/g)).toHaveLength(2);
    expect(html.match(/<dl class="sc-facts sc-facts-plain"/g)).toHaveLength(2);
    expect(html).toContain("<dt>Finished</dt><dd>1 run</dd>");
    expect(html).toContain("<dt>Failed</dt><dd>1 run</dd>");
    expect(html).toContain("<dt>Abandoned</dt><dd>0 runs</dd>");
    expect(html).toContain("1 done · 2 runs");
    expect(html).toContain("1 done · 0 runs");
    expect(html).toContain("Engineering");
    expect(html).toContain("No category");
    // No look of its own: nothing is drawn by a style.
    expect(html).not.toContain("style=");
    expect(html).not.toContain("Counted from");
  });

  it("name a week by its days, without the year", () => {
    expect(weekLabel("2026-10-05", "2026-10-11", "en")).toMatch(/^Oct 5\s.\s11$/);
    expect(weekLabel("2026-09-28", "2026-10-04", "en")).toMatch(/^Sep 28\s.\sOct 4$/);
    expect(weekLabel("nonsense", "2026-10-04", "en")).toBe("nonsense - 2026-10-04");
  });

  it("say what they were counted from where a project had more", () => {
    const html = renderToStaticMarkup(
      <DeskFiguresView figures={figures} partial={{ tasks: 100, runs: 30 }} />,
    );
    expect(html).toContain("Counted from the latest 100 tasks and 30 runs of each project.");
  });

  it("say so in a pane with nothing in it", () => {
    const html = renderToStaticMarkup(
      <DeskFiguresView figures={figuresOf({ today: TODAY, tasks: [], runs: [] })} />,
    );
    expect(html.match(/Nothing in these weeks\./g)).toHaveLength(2);
  });

  it("speak Korean from the pack", () => {
    const html = renderToStaticMarkup(
      <LanguageContext.Provider value={KOREAN}>
        <DeskFiguresView figures={figures} />
      </LanguageContext.Provider>,
    );
    expect(html).toContain("주별 완료");
    expect(html).toContain("완료 1개 · 런 2개");
  });
});

describe("the archive", () => {
  const closed = task({
    state: "done",
    number: 4,
    title: "Closed <b>work</b>",
    doneAt: "2026-10-13T12:00:00.000Z",
  });
  const away = task({
    state: "dropped",
    number: 5,
    title: "Put away",
    archivedAt: "2026-10-14T12:00:00.000Z",
  });
  const ended: DeskRun = {
    project: web,
    run: run({
      taskId: closed.id,
      taskNumber: 4,
      status: "finished",
      endedAt: "2026-10-13T12:00:00.000Z",
    }),
    title: "Closed <b>work</b>",
  };

  it("lists the closed tasks and the ended runs, with the words they are found by", () => {
    const html = renderToStaticMarkup(
      <DeskArchive
        tasks={[
          { project: docs, task: away },
          { project: web, task: closed },
        ]}
        runs={[ended]}
        query="closed"
        onSearch={() => undefined}
        more
        onMore={() => undefined}
        taskHref={hrefs.taskHref}
      />,
    );
    expect(html).toContain('<form class="sc-desk-search" aria-label="Find in the archive"');
    expect(html).toContain('value="closed"');
    expect(html).toContain('href="/projects/docs/tasks/5"');
    expect(html).toContain("Closed &lt;b&gt;work&lt;/b&gt;");
    expect(html).toMatch(/Put away<\/a>[\s\S]*?Dropped[\s\S]*?Put away<\/span>/);
    expect(html).toContain("Finished");
    expect(html).toContain("Read older ones");
  });

  it("says so where nothing is closed yet, and where the words find nothing", () => {
    const empty = renderToStaticMarkup(
      <DeskArchive tasks={[]} runs={[]} onSearch={() => undefined} taskHref={hrefs.taskHref} />,
    );
    expect(empty).toContain("Nothing is closed yet");
    expect(empty).not.toContain("Read older ones");
    const none = renderToStaticMarkup(
      <DeskArchive
        tasks={[]}
        runs={[]}
        query="nothing"
        onSearch={() => undefined}
        taskHref={hrefs.taskHref}
      />,
    );
    expect(none).toContain("Nothing found by these words.");
  });
});

describe("a desk of one's own, on the Agents page", () => {
  it("is one command shown to be copied, in the part the invitation's line is shown in", () => {
    const html = renderToStaticMarkup(<DeskCommand />);
    expect(DESK_COMMAND).toBe("console desk");
    expect(html).toContain('aria-label="A desk of your own"');
    expect(html).toContain('<div class="sc-copyable"><pre class="sc-code">console desk</pre>');
    const korean = renderToStaticMarkup(
      <LanguageContext.Provider value={KOREAN}>
        <DeskCommand />
      </LanguageContext.Provider>,
    );
    expect(korean).toContain("console desk");
    expect(korean).toContain("내 데스크");
  });
});
