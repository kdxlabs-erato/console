import { useState } from "react";
import { MAX_SEARCH_LENGTH, type RestWorkBrief } from "../api.js";
import { dateOf } from "../dates.js";
import {
  DESK_ENDINGS,
  type DeskFigures,
  type DeskProject,
  type DeskRun,
  type DeskTask,
  standingOf,
} from "../desk.js";
import { useLanguage, useWords } from "../i18n/index.js";
import { BarList, Chart } from "./charts.js";
import { ShowMore, usePaged } from "./paged.js";
import { ProjectMark } from "./projects.js";
import { RunStatusBadge } from "./runs.js";
import { TaskList } from "./task-list.js";
import {
  Badge,
  Button,
  CategoryBadge,
  CopyButton,
  cx,
  PersonChip,
  StateBadge,
  Time,
} from "./ui.js";

// The board's views of a desk's page (ADR-0116): what stands on the board now, the board's
// figures and the board's archive of one member's own work across their projects, beside the
// records' views (`desk-records.tsx`). Each takes its data as props and nothing from the
// network, and is built from the console's parts alone: rows, panes, badges, and the charts
// for the figures (ADR-0123). What people wrote is shown as text, never as HTML.

/**
 * The views of a desk's page, in the order its tabs stand: the records the desk keeps, then the
 * member's work on the board, what stands there now, its figures and its archive.
 */
export const DESK_VIEWS = ["records", "now", "figures", "archive"] as const;
export type DeskView = (typeof DESK_VIEWS)[number];

/** The tabs of a desk: one per view, the current one marked. */
export function DeskViews(props: {
  readonly view: DeskView;
  readonly viewHref: (view: DeskView) => string;
}) {
  const words = useWords().desk;
  return (
    <nav className="sc-subtabs sc-desk-views" aria-label={words.views.aria}>
      {DESK_VIEWS.map((view) => (
        <a
          key={view}
          className={cx("sc-tab", view === props.view && "sc-tab-current")}
          href={props.viewHref(view)}
          aria-current={view === props.view ? "page" : undefined}
        >
          {words.views[view]}
        </a>
      ))}
    </nav>
  );
}

/**
 * A week as a figure names it: from its first day to its last, without the year, which eight
 * weeks in a row would say eight times.
 */
export function weekLabel(start: string, end: string, language?: string): string {
  const from = dateOf(start);
  const to = dateOf(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return `${start} - ${end}`;
  }
  const format = new Intl.DateTimeFormat(language, { month: "short", day: "numeric" });
  return typeof format.formatRange === "function"
    ? format.formatRange(from, to)
    : `${format.format(from)} - ${format.format(to)}`;
}

/**
 * A week as a point of a chart names it: by its first day, short enough to stand under a
 * column. The table beside the chart, or the heading over it, says that the points are weeks.
 */
export function weekStartLabel(start: string, language?: string): string {
  const from = dateOf(start);
  return Number.isNaN(from.getTime())
    ? start
    : new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(from);
}

/** A project as a row says it: its mark and its name. */
function ProjectName(props: { readonly project: DeskProject }) {
  return (
    <>
      <ProjectMark project={props.project} size="sm" /> {props.project.name}
    </>
  );
}

/** A run as a row: the task it is on, the project and the agent, how it stands and since when. */
function RunRow(props: {
  readonly run: DeskRun;
  readonly href: string;
  /** Which moment the row says: when an open run was last heard from, or when one ended. */
  readonly moment: "heard" | "ended";
}) {
  const words = useWords();
  const { project, run, title } = props.run;
  return (
    <li className="sc-task-row">
      <a className="sc-task-row-title" href={props.href}>
        <span className="sc-card-number">#{run.taskNumber}</span> {title ?? run.agent}
      </a>
      <span className="sc-task-row-project">
        <ProjectName project={project} />
        {title !== undefined && <> · {run.agent}</>}
      </span>
      <span className="sc-task-row-meta">
        <RunStatusBadge status={run.status} />
        {props.moment === "heard" ? (
          <span className="sc-muted">
            {words.runs.lastHeard} <Time iso={run.lastHeardAt} precision="clock" />
          </span>
        ) : (
          run.endedAt !== null && <Time iso={run.endedAt} precision="day" />
        )}
      </span>
    </li>
  );
}

export interface DeskStandingProps {
  /** The open tasks the person works on, the sooner due first, as the plate answers them. */
  readonly tasks: readonly DeskTask[];
  /** The decisions that wait for the person's answer. */
  readonly decisions: RestWorkBrief["decisions"];
  /** The person's runs that are open. */
  readonly runs: readonly DeskRun[];
  /** The day to count due days from; the browser's today when left out. */
  readonly today?: string | undefined;
  readonly taskHref: (projectKey: string, taskNumber: number) => string;
  readonly decisionHref: (projectKey: string, decisionId: string) => string;
}

/**
 * What stands on the board now, what holds something up first: the decisions that wait for
 * the person, since a run waits on each; then the runs that are open; then the open tasks by state.
 */
export function DeskStanding(props: DeskStandingProps) {
  const words = useWords();
  const desk = words.desk;
  const projectOf = new Map(props.tasks.map((item) => [item.task.id, item.project]));
  const groups = standingOf(props.tasks).filter((group) => group.tasks.length > 0);
  return (
    <div className="sc-desk-lists">
      <section className="sc-task-section" aria-label={desk.now.decisions}>
        <h2 className="sc-section-title">
          {desk.now.decisions} <span className="sc-column-count">{props.decisions.length}</span>
        </h2>
        {props.decisions.length === 0 ? (
          <p className="sc-muted">{words.work.noDecisions}</p>
        ) : (
          <ul className="sc-task-rows" aria-label={desk.now.decisions}>
            {props.decisions.map(({ project, decision }) => (
              <li key={decision.id} className="sc-task-row">
                <a
                  className="sc-task-row-title"
                  href={props.decisionHref(project.key, decision.id)}
                >
                  {decision.question}
                </a>
                <span className="sc-task-row-project">
                  <ProjectName project={project} />
                </span>
                <span className="sc-task-row-meta">
                  <PersonChip person={decision.raisedBy} />
                  <Time iso={decision.createdAt} precision="day" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="sc-task-section" aria-label={desk.now.runs}>
        <h2 className="sc-section-title">
          {desk.now.runs} <span className="sc-column-count">{props.runs.length}</span>
        </h2>
        {props.runs.length === 0 ? (
          <p className="sc-muted">{desk.now.noRuns}</p>
        ) : (
          <ul className="sc-task-rows" aria-label={desk.now.runs}>
            {props.runs.map((run) => (
              <RunRow
                key={run.run.id}
                run={run}
                href={props.taskHref(run.project.key, run.run.taskNumber)}
                moment="heard"
              />
            ))}
          </ul>
        )}
      </section>
      {groups.map((group) => (
        <section
          key={group.state}
          className="sc-task-section"
          aria-label={words.vocabulary.state[group.state]}
        >
          <h2 className="sc-section-title">
            {words.vocabulary.state[group.state]}{" "}
            <span className="sc-column-count">{group.tasks.length}</span>
          </h2>
          <TaskList
            tasks={group.tasks.map((item) => item.task)}
            taskHref={(task) => props.taskHref(projectOf.get(task.id)?.key ?? "", task.number)}
            projectOf={(task) => {
              const project = projectOf.get(task.id);
              return project === undefined ? undefined : <ProjectName project={project} />;
            }}
            today={props.today}
          />
        </section>
      ))}
    </div>
  );
}

export interface DeskFiguresViewProps {
  readonly figures: DeskFigures;
  /**
   * Where a project had more than a visit reads: how many tasks and runs of each were counted,
   * said under the figures so that nobody reads them as the whole.
   */
  readonly partial?: { readonly tasks: number; readonly runs: number } | undefined;
}

/**
 * The figures: what was done by week, as columns; how the runs ended, and what was done by
 * project and by category, each as bars with its figure in words beside it.
 */
export function DeskFiguresView(props: DeskFiguresViewProps) {
  const words = useWords();
  const figures = words.desk.figures;
  const { tag } = useLanguage();
  const { weeks, runs, byProject, byCategory, done } = props.figures;
  const ended = DESK_ENDINGS.reduce((sum, ending) => sum + runs[ending], 0);
  return (
    <div className="sc-desk-figures">
      <section className="sc-task-section" aria-label={figures.weeks}>
        <h2 className="sc-section-title">
          {figures.weeks} <span className="sc-column-count">{done}</span>
        </h2>
        <Chart
          title={figures.weeks}
          language={tag}
          points={weeks.map((week) => weekStartLabel(week.start, tag))}
          series={[{ name: words.vocabulary.state.done, values: weeks.map((week) => week.done) }]}
        />
      </section>
      <section className="sc-task-section" aria-label={figures.runs}>
        <h2 className="sc-section-title">
          {figures.runs} <span className="sc-column-count">{ended}</span>
        </h2>
        {/* The endings are told apart by their names: a colour each would say good and bad
            where the tones already do. */}
        <BarList
          label={figures.runs}
          language={tag}
          rows={DESK_ENDINGS.map((ending) => ({
            id: ending,
            label: words.vocabulary.runStatus[ending],
            value: runs[ending],
            words: figures.runsCount(runs[ending]),
          }))}
        />
      </section>
      <div className="sc-desk-pair">
        <section className="sc-panel" aria-label={figures.byProject}>
          <h2 className="sc-section-title">{figures.byProject}</h2>
          {byProject.length === 0 ? (
            <p className="sc-muted">{figures.none}</p>
          ) : (
            <BarList
              label={figures.byProject}
              language={tag}
              rows={byProject.map((row) => ({
                id: row.project.key,
                label: <ProjectName project={row.project} />,
                value: row.done,
                words: `${figures.done(row.done)} · ${figures.runsCount(row.runs)}`,
              }))}
            />
          )}
        </section>
        <section className="sc-panel" aria-label={figures.byCategory}>
          <h2 className="sc-section-title">{figures.byCategory}</h2>
          {byCategory.length === 0 ? (
            <p className="sc-muted">{figures.none}</p>
          ) : (
            <BarList
              label={figures.byCategory}
              language={tag}
              rows={byCategory.map((row) => ({
                id: row.category?.key ?? "",
                label:
                  row.category === null ? (
                    figures.noCategory
                  ) : (
                    <CategoryBadge category={row.category} />
                  ),
                value: row.done,
                words: figures.done(row.done),
              }))}
            />
          )}
        </section>
      </div>
      {props.partial !== undefined && (
        <p className="sc-muted">{figures.partial(props.partial.tasks, props.partial.runs)}</p>
      )}
    </div>
  );
}

export interface DeskArchiveProps {
  /** The tasks the person worked on that are done, dropped or put away, the last closed first. */
  readonly tasks: readonly DeskTask[];
  /** The person's runs that ended, the last ended first. */
  readonly runs: readonly DeskRun[];
  /** The words the lists were found by; none for everything. */
  readonly query?: string | undefined;
  readonly busy?: boolean | undefined;
  readonly onSearch: (words: string) => void;
  /** Whether the console has more than was read, and the way to read the next page of it. */
  readonly more?: boolean | undefined;
  readonly onMore?: (() => void) | undefined;
  readonly taskHref: (projectKey: string, taskNumber: number) => string;
}

/** The archive: the person's closed tasks and ended runs, found by words, a page at a time. */
export function DeskArchive(props: DeskArchiveProps) {
  const words = useWords();
  const archive = words.desk.archive;
  const [query, setQuery] = useState(props.query ?? "");
  const tasks = usePaged(props.tasks);
  const runs = usePaged(props.runs);
  const found = props.query !== undefined && props.query.length > 0;
  return (
    <div className="sc-desk-archive">
      <form
        className="sc-desk-search"
        aria-label={archive.search}
        onSubmit={(event) => {
          event.preventDefault();
          props.onSearch(query.trim());
        }}
      >
        <input
          className="sc-input"
          type="search"
          placeholder={archive.placeholder}
          aria-label={archive.search}
          maxLength={MAX_SEARCH_LENGTH}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={props.busy === true}>
          {archive.find}
        </Button>
      </form>
      {props.tasks.length === 0 && props.runs.length === 0 ? (
        <p className="sc-muted">{found ? archive.nothingFound : archive.nothing}</p>
      ) : (
        <div className="sc-desk-lists">
          <section className="sc-task-section" aria-label={archive.tasks}>
            <h2 className="sc-section-title">
              {archive.tasks} <span className="sc-column-count">{props.tasks.length}</span>
            </h2>
            <ul className="sc-task-rows" aria-label={archive.tasks}>
              {tasks.shown.map(({ project, task }) => (
                <li key={task.id} className="sc-task-row">
                  <a className="sc-task-row-title" href={props.taskHref(project.key, task.number)}>
                    <span className="sc-card-number">#{task.number}</span> {task.title}
                  </a>
                  <span className="sc-task-row-project">
                    <ProjectName project={project} />
                  </span>
                  <span className="sc-task-row-meta">
                    {task.category !== null && <CategoryBadge category={task.category} />}
                    <StateBadge state={task.state} />
                    {task.archivedAt !== null && <Badge>{archive.putAway}</Badge>}
                    <Time iso={task.archivedAt ?? task.doneAt ?? task.updatedAt} precision="day" />
                  </span>
                </li>
              ))}
            </ul>
            <ShowMore rest={tasks.rest} onMore={tasks.more} />
          </section>
          <section className="sc-task-section" aria-label={archive.runs}>
            <h2 className="sc-section-title">
              {archive.runs} <span className="sc-column-count">{props.runs.length}</span>
            </h2>
            <ul className="sc-task-rows" aria-label={archive.runs}>
              {runs.shown.map((run) => (
                <RunRow
                  key={run.run.id}
                  run={run}
                  href={props.taskHref(run.project.key, run.run.taskNumber)}
                  moment="ended"
                />
              ))}
            </ul>
            <ShowMore rest={runs.rest} onMore={runs.more} />
          </section>
        </div>
      )}
      {props.more === true && props.onMore !== undefined && (
        <div className="sc-show-more">
          <Button
            variant="secondary"
            size="sm"
            disabled={props.busy === true}
            onClick={props.onMore}
          >
            {archive.older}
          </Button>
        </div>
      )}
    </div>
  );
}

export interface DeskWordsProps {
  /** The console's origin, which the words name for the agent to connect to. */
  readonly origin: string;
}

/**
 * A desk of a person's own, on the Agents page (ADR-0121): what it is in a line, and what to
 * tell an agent for one, from installing the command to making the desk, copied whole as the
 * words for connecting an agent are above it.
 */
export function DeskWords(props: DeskWordsProps) {
  const words = useWords().desk.command;
  const quote = words.quote(props.origin);
  return (
    <section className="sc-panel sc-desk-command" aria-label={words.title}>
      <h2 className="sc-section-title">{words.title}</h2>
      <p>{words.gives}</p>
      <p>{words.tellYourAgent}</p>
      <div className="sc-copyable">
        <pre className="sc-code">{quote}</pre>
        <CopyButton text={quote} size="sm" />
      </div>
      <p>{words.doesTheRest}</p>
    </section>
  );
}
