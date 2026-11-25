import { useEffect, useMemo, useState } from "react";
import type { RestWorkBrief } from "./api.js";
import type { ConsoleClient } from "./client.js";
import {
  DESK_VIEWS,
  DeskArchive,
  DeskFiguresView,
  DeskStanding,
  type DeskView,
  DeskViews,
} from "./components/desk.js";
import { Callout, EmptyState, Spinner } from "./components/ui.js";
import type { CustomPage } from "./console.js";
import type { ConsoleData } from "./data.js";
import { deviceLanguage, firstDayOfWeek, today as todayOf } from "./dates.js";
import {
  DESK_RUNS,
  DESK_TASKS,
  type DeskHistory,
  type DeskProject,
  type DeskRun,
  figuresOf,
  readHistory,
  readOpenRuns,
  withHistory,
} from "./desk.js";
import type { RecordsReader } from "./desk-records.js";
import { DeskRecords } from "./desk-records-page.js";
import { DEFAULT_LANGUAGES, useLanguage, useWords } from "./i18n/index.js";
import { customPageHref, decisionHref, type Navigation, taskHref } from "./router.js";
import { errorWords } from "./use-action.js";

// The page of a desk (ADR-0116, ADR-0117): one page of a console of a member's own, the
// member's own extension of the console's pages. It comes with the records' view, what the
// member made and what became of it, read from the desk's own files; beside it stand three
// views of the member's work on the board, read through the client when one is looked at: what
// stands now from the plate and the open runs, the figures and the archive from a bounded page
// of each project's closed tasks and ended runs. The address says which view, and what it
// shows (ADR-0010).

/** What the address of a desk's page says: its view, the records' where it names none, and the words the board's archive is found by. */
export function deskViewOf(search: string): { readonly view: DeskView; readonly words: string } {
  const params = new URLSearchParams(search);
  const named = params.get("view");
  return {
    view: DESK_VIEWS.find((view) => view === named) ?? "records",
    words: (params.get("q") ?? "").trim(),
  };
}

/** Where a view of a desk's page is, from the page's own address; the board's archive with the words it is found by. */
export function deskHref(base: string, view: DeskView, words = ""): string {
  const params = new URLSearchParams();
  if (view !== "records") {
    params.set("view", view);
  }
  if (view === "archive" && words.length > 0) {
    params.set("q", words);
  }
  const query = params.toString();
  return query.length === 0 ? base : `${base}?${query}`;
}

export interface DeskPageProps {
  readonly client: ConsoleClient;
  /** The workspace as the console keeps it current: who looks, and the projects they may see. */
  readonly data: Pick<ConsoleData, "me" | "projects">;
  /** The query of the address the page is at. */
  readonly search: string;
  /** The page's own address, without a query. */
  readonly href: string;
  readonly navigation: Navigation;
  /** What reads the desk's records; the page's own `fetch` at `/records` where left out. */
  readonly records?: RecordsReader | undefined;
}

/** What stands now, as one visit read it. */
interface Standing {
  readonly work: RestWorkBrief;
  readonly runs: readonly DeskRun[];
}

/** The closed work read so far for some words: the pages of it as one. */
interface Read {
  readonly words: string;
  readonly pages: number;
  readonly history: DeskHistory;
}

export function DeskPage(props: DeskPageProps) {
  const pack = useWords();
  const words = pack.desk;
  const { tag } = useLanguage();
  const { client, data, search, href, navigation } = props;
  const { view, words: query } = deskViewOf(search);
  const personId = data.me?.person?.id;
  const weekStart = data.me?.workspace.weekStart;
  // The projects by what a row says of each: a list read again that says the same is the same
  // list here, so that nothing is read from the console a second time for it.
  const listed = JSON.stringify(
    data.projects.map((project) => [
      project.key,
      project.name,
      project.color,
      project.symbol,
      project.icon ?? null,
    ]),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: the list is held by what it says, not by the array that holds it
  const projects = useMemo<readonly DeskProject[]>(
    () =>
      data.projects.map((project) => ({
        key: project.key,
        name: project.name,
        color: project.color,
        symbol: project.symbol,
        icon: project.icon ?? null,
      })),
    [listed],
  );
  const [standing, setStanding] = useState<Standing | undefined>(undefined);
  // Everything closed, which the figures count and the archive lists; and what words found.
  const [whole, setWhole] = useState<Read | undefined>(undefined);
  const [found, setFound] = useState<Read | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const couldNotLoad = words.couldNotLoad;

  // What stands now is read each time the view is come to: the plate, then the open runs of
  // the projects where a task of the plate says one is.
  useEffect(() => {
    if (view !== "now" || personId === undefined) {
      return;
    }
    const controller = new AbortController();
    setProblem(undefined);
    client
      .plate(controller.signal)
      .then(async (work) => ({
        work,
        runs: await readOpenRuns(client, { tasks: work.tasks, personId }, controller.signal),
      }))
      .then((read) => {
        if (!controller.signal.aborted) {
          setStanding(read);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setProblem(errorWords(failure, couldNotLoad, pack));
        }
      });
    return () => controller.abort();
  }, [client, view, personId, couldNotLoad, pack]);

  // The closed work is read each time a view that shows it is come to, or its words change:
  // the first page of each project, for the figures everything, for the archive what the
  // words find.
  const wanted = view === "archive" ? query : "";
  const reads = view === "figures" || view === "archive";
  useEffect(() => {
    if (!reads || personId === undefined) {
      return;
    }
    const controller = new AbortController();
    setProblem(undefined);
    setBusy(true);
    readHistory(client, { projects, personId, words: wanted }, controller.signal)
      .then((history) => {
        if (!controller.signal.aborted) {
          (wanted.length === 0 ? setWhole : setFound)({ words: wanted, pages: 1, history });
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setProblem(errorWords(failure, couldNotLoad, pack));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [client, reads, wanted, personId, projects, couldNotLoad, pack]);

  if (personId === undefined) {
    return null;
  }
  const shown = wanted.length === 0 ? whole : found?.words === wanted ? found : undefined;
  /** The next page of what is shown, joined to what was read. */
  const onMore = () => {
    if (shown === undefined || busy) {
      return;
    }
    setBusy(true);
    readHistory(client, { projects, personId, words: shown.words, page: shown.pages })
      .then((history) => {
        const next = {
          words: shown.words,
          pages: shown.pages + 1,
          history: withHistory(shown.history, history),
        };
        (shown.words.length === 0 ? setWhole : setFound)(next);
      })
      .catch((failure: unknown) => setProblem(errorWords(failure, couldNotLoad, pack)))
      .finally(() => setBusy(false));
  };
  // A run that ended on a task still open has its title on the plate, where the plate was read.
  const open = new Map((standing?.work.tasks ?? []).map(({ task }) => [task.id, task.title]));
  const named = (runs: readonly DeskRun[]): readonly DeskRun[] =>
    runs.map((run) =>
      run.title === undefined ? { ...run, title: open.get(run.run.taskId) } : run,
    );
  const now = todayOf();
  const loading = (
    <div className="sc-loading">
      <Spinner label={words.loading} />
    </div>
  );
  const narrowed =
    shown !== undefined && shown.history.of > shown.history.read ? (
      <p className="sc-muted">{words.projectsRead(shown.history.read, shown.history.of)}</p>
    ) : null;
  return (
    <>
      <div className="sc-page-head">
        <h1 className="sc-page-title">{words.title}</h1>
        <p className="sc-page-lead">{words.lead}</p>
      </div>
      <DeskViews view={view} viewHref={(one) => deskHref(href, one)} />
      {problem !== undefined && view !== "records" && <Callout tone="danger">{problem}</Callout>}
      {view === "records" ? (
        <DeskRecords
          search={search}
          href={href}
          navigation={navigation}
          reader={props.records}
          weekStart={weekStart}
          taskHref={taskHref}
        />
      ) : view === "now" ? (
        standing === undefined ? (
          problem === undefined && loading
        ) : standing.work.tasks.length === 0 &&
          standing.work.decisions.length === 0 &&
          standing.runs.length === 0 ? (
          <EmptyState title={words.now.empty.title} body={words.now.empty.body} />
        ) : (
          <DeskStanding
            tasks={standing.work.tasks}
            decisions={standing.work.decisions}
            runs={standing.runs}
            today={now}
            taskHref={taskHref}
            decisionHref={decisionHref}
          />
        )
      ) : view === "figures" ? (
        shown === undefined ? (
          problem === undefined && loading
        ) : (
          <>
            <DeskFiguresView
              figures={figuresOf({
                tasks: shown.history.tasks,
                runs: shown.history.runs,
                today: now,
                firstDay: firstDayOfWeek(deviceLanguage(tag), weekStart),
              })}
              partial={
                shown.history.more
                  ? { tasks: shown.pages * DESK_TASKS, runs: shown.pages * DESK_RUNS }
                  : undefined
              }
            />
            {narrowed}
          </>
        )
      ) : shown === undefined ? (
        problem === undefined && loading
      ) : (
        <>
          <DeskArchive
            // Keyed by the words, so that the field says the words the address does.
            key={shown.words}
            tasks={shown.history.tasks}
            runs={named(shown.history.runs)}
            query={shown.words}
            busy={busy}
            onSearch={(next) => navigation.go(deskHref(href, "archive", next))}
            more={shown.history.more}
            onMore={onMore}
            taskHref={taskHref}
          />
          {narrowed}
        </>
      )}
    </>
  );
}

/** The key a desk's page has unless a console names another: its address is `/pages/desk`. */
export const DESK_PAGE_KEY = "desk";

/**
 * A desk's page for a console of one's own: `createConsole({ pages: [deskPage()] })` adds it as
 * a tab among the workspace's, at `/pages/<key>`. `records` says what reads the desk's records,
 * where that is not the page's own `fetch` at `/records`.
 */
export function deskPage(
  options: { readonly key?: string | undefined; readonly records?: RecordsReader | undefined } = {},
): CustomPage {
  const key = options.key ?? DESK_PAGE_KEY;
  return {
    key,
    label: Object.fromEntries(
      DEFAULT_LANGUAGES.map((language) => [language.tag, language.messages.desk.tab]),
    ),
    level: "workspace",
    render: (context) => (
      <DeskPage
        client={context.client}
        data={context.data}
        search={context.search}
        href={customPageHref(key)}
        navigation={context.navigation}
        records={options.records}
      />
    ),
  };
}
