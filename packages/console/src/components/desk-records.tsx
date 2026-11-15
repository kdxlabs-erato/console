import { type ReactNode, useState } from "react";
import {
  type CollectionResults,
  type CollectionSummary,
  type FieldValue,
  fieldsOf,
  httpsLink,
  type MetricFigure,
  previewSrc,
  type RatioFigure,
  RECORDS_BASE,
  type RecordFileState,
  type RecordProblem,
  statusCounts,
} from "../desk-records.js";
import { type Messages, useLanguage, useWords } from "../i18n/index.js";
import type { RecordsCollection, RecordsItem, RecordsMetricRow, RecordsUse } from "../records.js";
import { BarList, Chart, FigureTable, Stat, Stats } from "./charts.js";
import { weekStartLabel } from "./desk.js";
import { ShowMore, usePaged } from "./paged.js";
import { Badge, Callout, Day, EmptyState } from "./ui.js";

// The records' views of a desk's pages (ADR-0117): the collections a desk keeps, one collection
// with its items, one item with its files, where it was used and how it did, and a collection's
// results. Each takes what was read as props and nothing from the network, and is built from
// the console's parts alone, the figures from the charts (ADR-0123). Everything a record says was written by an agent and is shown as
// text; a link is followed only where it is https and opens apart; a file is shown by the kind
// the server says it is, and nothing an agent wrote is ever a page.

/** A number as a language writes one, with no more than `digits` after its point. */
function amount(value: number, tag: string, digits = 2): string {
  return value.toLocaleString(tag, { maximumFractionDigits: digits });
}

/** A metric's figure as words: its number in its unit, or that there is none. */
export function metricWords(
  figure: Pick<MetricFigure, "unit"> & { readonly total: number | undefined },
  tag: string,
  words: Messages["desk"]["records"],
): string {
  if (figure.total === undefined) {
    return words.noValue;
  }
  return figure.unit === "percent"
    ? words.percent(amount(figure.total, tag, 1))
    : figure.unit === "seconds"
      ? words.seconds(amount(figure.total, tag, 1))
      : amount(figure.total, tag);
}

/** A ratio's figure as words: a share of a hundred or a plain number, or that there is none. */
export function ratioWords(
  figure: Pick<RatioFigure, "as" | "value">,
  tag: string,
  words: Messages["desk"]["records"],
): string {
  if (figure.value === undefined) {
    return words.noValue;
  }
  return figure.as === "percent"
    ? words.percent(amount(figure.value * 100, tag))
    : amount(figure.value, tag);
}

/** What is wrong with the records' files, a line each, over what could be read. */
export function DeskRecordProblems(props: { readonly problems: readonly RecordProblem[] }) {
  const words = useWords().desk.records.problems;
  if (props.problems.length === 0) {
    return null;
  }
  return (
    <Callout tone="warning" title={words.title}>
      {props.problems.map((problem) => (
        <p key={`${problem.file} ${problem.kind}`}>
          {problem.kind === "unreadable"
            ? words.unreadable(problem.file)
            : problem.kind === "too_large"
              ? words.tooLarge(problem.file)
              : problem.kind === "not_json"
                ? words.notJson(problem.file)
                : words.notAsFormat(problem.file, problem.at ?? "")}
          {problem.left !== undefined && <> {words.left(problem.left)}</>}
        </p>
      ))}
      <p>{words.check}</p>
    </Callout>
  );
}

/** Where no records are served: what a record is, and where the first comes from. */
export function DeskNoRecords() {
  const words = useWords().desk.records;
  return <EmptyState title={words.none.title} body={words.none.body} />;
}

/** The way down to where the records' view is: the records, a collection, an item. */
export function DeskRecordCrumbs(props: {
  /** Each step by its name; all but the last with where it is. */
  readonly steps: readonly { readonly label: string; readonly href?: string | undefined }[];
}) {
  const words = useWords().desk.records;
  return (
    <nav className="sc-doc-crumbs" aria-label={words.crumb}>
      {props.steps.map((step, index) => (
        <span key={`${step.href ?? ""} ${step.label}`}>
          {index > 0 && (
            <span className="sc-crumb-separator" aria-hidden="true">
              /
            </span>
          )}
          {step.href === undefined ? step.label : <a href={step.href}>{step.label}</a>}
        </span>
      ))}
    </nav>
  );
}

/** The items of a collection counted by status, as badges. */
function StatusCounts(props: { readonly counts: CollectionSummary["statuses"] }) {
  return (
    <>
      {props.counts
        .filter((status) => status.count > 0)
        .map((status) => (
          <Badge key={status.key} kind="count">
            {status.label} {status.count}
          </Badge>
        ))}
    </>
  );
}

export interface DeskCollectionsProps {
  readonly collections: readonly CollectionSummary[];
  readonly collectionHref: (key: string) => string;
}

/** The collections a desk keeps: a row each, with how many items it holds by status and when the last was made. */
export function DeskCollections(props: DeskCollectionsProps) {
  const words = useWords().desk.records;
  if (props.collections.length === 0) {
    return <p className="sc-muted">{words.noCollections}</p>;
  }
  return (
    <ul className="sc-task-rows" aria-label={words.collections}>
      {props.collections.map((collection) => (
        <li key={collection.key} className="sc-task-row">
          <a className="sc-task-row-title" href={props.collectionHref(collection.key)}>
            {collection.title}
          </a>
          {collection.description !== undefined && collection.description.length > 0 && (
            <span className="sc-task-row-project">{collection.description}</span>
          )}
          <span className="sc-task-row-meta">
            <StatusCounts counts={collection.statuses} />
            <span className="sc-muted">{words.items(collection.items)}</span>
            {collection.lastMadeOn !== undefined && (
              <span className="sc-muted">
                {words.lastMade} <Day day={collection.lastMadeOn} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** An item's status as a badge: its label where the collection names the status, the word itself where it does not. */
function StatusBadge(props: {
  readonly collection: Pick<RecordsCollection, "statuses"> | undefined;
  readonly status: string | undefined;
}) {
  if (props.status === undefined) {
    return null;
  }
  const named = props.collection?.statuses?.find((status) => status.key === props.status);
  return <Badge kind="state">{named?.label ?? props.status}</Badge>;
}

/** What an item says for one field, as its kind has it shown. */
function FieldWords(props: { readonly value: FieldValue }): ReactNode {
  const { tag } = useLanguage();
  const { value } = props;
  if (value.kind === "day") {
    return <Day day={value.day} />;
  }
  if (value.kind === "link") {
    return (
      <a href={value.href} target="_blank" rel="noopener noreferrer">
        {value.href}
      </a>
    );
  }
  return value.kind === "number" ? amount(value.value, tag) : value.text;
}

/** A preview, where the file is there: taken out of the page again where it will not load. */
function Preview(props: {
  readonly src: string;
  readonly alt: string;
  readonly className: string;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? null : (
    <img
      className={props.className}
      src={props.src}
      alt={props.alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export interface DeskCollectionViewProps {
  /** The collection's key, by which its files are read. */
  readonly collectionKey: string;
  readonly collection: RecordsCollection | undefined;
  /** The collection's items, the last made first. */
  readonly items: readonly RecordsItem[];
  /** The status the items are narrowed to, by its key. */
  readonly status?: string | undefined;
  readonly onStatus: (status: string | undefined) => void;
  readonly itemHref: (id: string) => string;
  /** Where the records are served; the usual place where left out. */
  readonly base?: string | undefined;
}

/**
 * One collection: its items narrowed by status, as cards where any of them has a preview and
 * as rows where none has, each with its title, its status, the day it was made and its fields.
 */
export function DeskCollectionView(props: DeskCollectionViewProps) {
  const words = useWords().desk.records;
  const { collection, items } = props;
  const base = props.base ?? RECORDS_BASE;
  const counts = statusCounts(collection, items);
  const narrowed =
    props.status === undefined ? items : items.filter((item) => item.status === props.status);
  const { shown, rest, more } = usePaged(narrowed);
  const pictured = items.some(
    (item) => previewSrc(props.collectionKey, item.preview, base) !== undefined,
  );
  return (
    <>
      {counts.length > 0 && (
        <div className="sc-filters">
          <label className="sc-field sc-field-inline">
            <span className="sc-visually-hidden">{words.narrow}</span>
            <select
              className="sc-input"
              value={props.status ?? ""}
              onChange={(event) =>
                props.onStatus(event.target.value === "" ? undefined : event.target.value)
              }
            >
              <option value="">{words.everyStatus}</option>
              {counts.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label} ({status.count})
                </option>
              ))}
            </select>
          </label>
          <span className="sc-filters-count sc-muted">
            {words.shown(narrowed.length, items.length)}
          </span>
        </div>
      )}
      {narrowed.length === 0 ? (
        <p className="sc-muted">{items.length === 0 ? words.noItems : words.noneOfStatus}</p>
      ) : pictured ? (
        <ul className="sc-desk-cards" aria-label={words.showItems}>
          {shown.map((item) => {
            const src = previewSrc(props.collectionKey, item.preview, base);
            const fields = fieldsOf(collection, item);
            return (
              <li key={item.id} className="sc-panel sc-desk-card">
                {src !== undefined && <Preview className="sc-desk-card-picture" src={src} alt="" />}
                <a className="sc-task-row-title" href={props.itemHref(item.id)}>
                  {item.title}
                </a>
                <div className="sc-task-badges">
                  <StatusBadge collection={collection} status={item.status} />
                  <Day day={item.madeOn} />
                </div>
                {fields.length > 0 && (
                  <dl className="sc-facts-row">
                    {fields.map((field) => (
                      <div key={field.key}>
                        <dt>{field.label}</dt>
                        <dd>
                          <FieldWords value={field.value} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="sc-task-rows" aria-label={words.showItems}>
          {shown.map((item) => (
            <li key={item.id} className="sc-task-row">
              <a className="sc-task-row-title" href={props.itemHref(item.id)}>
                {item.title}
              </a>
              <span className="sc-task-row-project">
                {fieldsOf(collection, item).map((field, index) => (
                  <span key={field.key}>
                    {index > 0 && " · "}
                    {field.label}: <FieldWords value={field.value} />
                  </span>
                ))}
              </span>
              <span className="sc-task-row-meta">
                <StatusBadge collection={collection} status={item.status} />
                <Day day={item.madeOn} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <ShowMore rest={rest} onMore={more} />
    </>
  );
}

/** One file of an item as its page shows it: what it is called, where it is read, and how it stands. */
export interface DeskFile {
  readonly label: string;
  /** Where the file is read from, on the page's own origin; nothing where it is no file of the collection. */
  readonly src: string | undefined;
  readonly state: RecordFileState;
}

/** A file of an item: shown in place where its kind can be, handed over where it cannot, or said to be missing. */
function FileRow(props: { readonly file: DeskFile }) {
  const words = useWords().desk.records;
  const { label, src, state } = props.file;
  const shown =
    src !== undefined &&
    (state.kind === "picture" ||
      state.kind === "video" ||
      state.kind === "sound" ||
      state.kind === "pdf" ||
      state.kind === "other");
  return (
    <li>
      <span>{label}</span>
      {state.kind === "reading" && <span className="sc-muted">{words.reading}</span>}
      {state.kind === "not_fetched" && <span className="sc-muted">{words.notFetched}</span>}
      {state.kind === "refused" && <span className="sc-muted">{words.refused}</span>}
      {state.kind === "unreadable" && <span className="sc-muted">{words.unreadable}</span>}
      {(state.kind === "not_fetched" || state.kind === "refused") && state.words !== undefined && (
        <span className="sc-muted">{state.words}</span>
      )}
      {shown && state.kind === "pdf" && (
        <a href={src} target="_blank" rel="noopener noreferrer">
          {words.open}
        </a>
      )}
      {shown && (
        <a href={src} download>
          {words.download}
        </a>
      )}
      {shown && state.kind === "picture" && (
        <img className="sc-desk-file-media" src={src} alt={label} loading="lazy" decoding="async" />
      )}
      {shown && state.kind === "video" && (
        // biome-ignore lint/a11y/useMediaCaption: what was made is shown as it is; a record carries no captions
        <video className="sc-desk-file-media" src={src} controls preload="metadata" />
      )}
      {shown && state.kind === "sound" && (
        // biome-ignore lint/a11y/useMediaCaption: what was made is played as it is; a record carries no captions
        <audio className="sc-desk-file-media" src={src} controls preload="none" />
      )}
      {shown && state.kind === "pdf" && state.framed && (
        <div className="sc-plugin-frame-box sc-desk-file-frame">
          <iframe className="sc-plugin-frame" src={src} title={label} loading="lazy" />
        </div>
      )}
    </li>
  );
}

export interface DeskItemViewProps {
  readonly collectionKey: string;
  readonly collection: RecordsCollection | undefined;
  readonly item: RecordsItem;
  /** Where the item was used, the last first. */
  readonly uses: readonly RecordsUse[];
  /** How the item did: its rows by day, the last first, and its figures over all of them. */
  readonly results: {
    readonly days: readonly RecordsMetricRow[];
    readonly metrics: readonly MetricFigure[];
    readonly ratios: readonly RatioFigure[];
  };
  /** The item's files, each as the server answered for it. */
  readonly files: readonly DeskFile[];
  /** Where a task of the board is, for an item that names one. */
  readonly taskHref: (projectKey: string, taskNumber: number) => string;
  readonly base?: string | undefined;
}

/**
 * One item, what it is before what it holds: its preview and its note, how it did as figures
 * with the run each came by, where it was used, its files, and last its figures day by day,
 * to be read exactly; beside them what it says of itself: the day it was made, its status, its
 * fields, its links, and the task it names, where it names one.
 */
export function DeskItemView(props: DeskItemViewProps) {
  const words = useWords().desk.records;
  const { tag } = useLanguage();
  const { collection, item, uses, results, files } = props;
  const src = previewSrc(props.collectionKey, item.preview, props.base ?? RECORDS_BASE);
  const fields = fieldsOf(collection, item);
  const links = (item.links ?? []).flatMap((link) => {
    const href = httpsLink(link.url);
    return href === undefined ? [] : [{ label: link.label, href }];
  });
  const metrics = collection?.metrics ?? [];
  const days = usePaged(results.days);
  // The run each metric came by, day by day, the latest last.
  const trends = Object.fromEntries(
    metrics.map((metric) => [
      metric.key,
      results.days.map((row) => row.values[metric.key]).reverse(),
    ]),
  );
  return (
    <div className="sc-desk-item">
      <header className="sc-task-header">
        <h2 className="sc-task-title">{item.title}</h2>
        <div className="sc-task-badges">
          <StatusBadge collection={collection} status={item.status} />
        </div>
      </header>
      <div className="sc-task-body">
        <div className="sc-task-main">
          {src !== undefined && <Preview className="sc-desk-item-picture" src={src} alt="" />}
          {item.note !== undefined && item.note.length > 0 && (
            <section className="sc-task-section" aria-label={words.note}>
              <h3 className="sc-section-title">{words.note}</h3>
              <p className="sc-desk-words">{item.note}</p>
            </section>
          )}
          {metrics.length > 0 && (
            <section className="sc-task-section" aria-label={words.results}>
              <h3 className="sc-section-title">{words.results}</h3>
              {results.days.length === 0 ? (
                <p className="sc-muted">{words.noRows}</p>
              ) : (
                <Figures
                  label={words.results}
                  metrics={results.metrics}
                  ratios={results.ratios}
                  trends={trends}
                />
              )}
            </section>
          )}
          <section className="sc-task-section" aria-label={words.uses}>
            <h3 className="sc-section-title">
              {words.uses} <span className="sc-column-count">{uses.length}</span>
            </h3>
            {uses.length === 0 ? (
              <p className="sc-muted">{words.noUses}</p>
            ) : (
              <ul className="sc-link-list">
                {uses.map((use) => (
                  <li key={`${use.on} ${use.where} ${use.note ?? ""}`}>
                    <Day day={use.on} />
                    <span>{use.where}</span>
                    {use.note !== undefined && use.note.length > 0 && (
                      <span className="sc-muted">{use.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {files.length > 0 && (
            <section className="sc-task-section" aria-label={words.files}>
              <h3 className="sc-section-title">{words.files}</h3>
              <ul className="sc-link-list">
                {files.map((file) => (
                  <FileRow key={`${file.src ?? ""} ${file.label}`} file={file} />
                ))}
              </ul>
            </section>
          )}
          {metrics.length > 0 && results.days.length > 0 && (
            <section className="sc-task-section" aria-label={words.byDay}>
              <h3 className="sc-section-title">{words.byDay}</h3>
              <FigureTable
                caption={words.byDay}
                language={tag}
                columns={[words.day, ...metrics.map((metric) => metric.label)]}
                rows={days.shown.map((row) => ({
                  id: row.on,
                  label: <Day day={row.on} />,
                  values: metrics.map((metric) => {
                    const total = row.values[metric.key];
                    return total === undefined
                      ? undefined
                      : metricWords({ unit: metric.unit, total }, tag, words);
                  }),
                }))}
              />
              <ShowMore rest={days.rest} onMore={days.more} />
            </section>
          )}
        </div>
        <aside className="sc-task-aside" aria-label={words.about}>
          <dl className="sc-facts">
            <div>
              <dt>{words.madeOn}</dt>
              <dd>
                <Day day={item.madeOn} />
              </dd>
            </div>
            {fields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>
                  <FieldWords value={field.value} />
                </dd>
              </div>
            ))}
            {item.task !== undefined && (
              <div>
                <dt>{words.task}</dt>
                <dd>
                  <a href={props.taskHref(item.task.project, item.task.number)}>
                    {words.taskOf(item.task.project, item.task.number)}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          {links.length > 0 && (
            <section className="sc-task-section" aria-label={words.links}>
              <h3 className="sc-section-title">{words.links}</h3>
              <ul className="sc-link-list">
                {links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} target="_blank" rel="noopener noreferrer">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * The figures of some rows: each metric's total and each ratio, a number under its name, and
 * the run each metric came by, where it is one: two amounts or more.
 */
function Figures(props: {
  /** What the figures are of, for a reader who cannot see the heading over them. */
  readonly label: string;
  readonly metrics: readonly MetricFigure[];
  readonly ratios: readonly RatioFigure[];
  /** Each metric's amounts in order, by week or by day, the latest last, by the metric's key. */
  readonly trends?: Readonly<Record<string, readonly (number | undefined)[]>> | undefined;
}) {
  const words = useWords().desk.records;
  const { tag } = useLanguage();
  /** A metric's run, where it has amounts enough to be one: a single amount is the figure itself. */
  const runOf = (key: string): readonly (number | undefined)[] | undefined => {
    const run = props.trends?.[key];
    return run !== undefined && run.filter((value) => value !== undefined).length > 1
      ? run
      : undefined;
  };
  return (
    <Stats label={props.label}>
      {props.metrics.map((metric) => (
        <Stat
          key={metric.key}
          label={metric.label}
          value={metricWords(metric, tag, words)}
          trend={runOf(metric.key)}
        />
      ))}
      {props.ratios.map((ratio) => (
        <Stat
          key={`ratio ${ratio.key}`}
          label={ratio.label}
          value={ratioWords(ratio, tag, words)}
        />
      ))}
    </Stats>
  );
}

export interface DeskCollectionResultsProps {
  readonly collection: RecordsCollection | undefined;
  readonly results: CollectionResults;
  /** The items that did best by the metric picked, the most first. */
  readonly best: {
    readonly metric: NonNullable<RecordsCollection["metrics"]>[number] | undefined;
    readonly items: readonly { readonly item: RecordsItem; readonly total: number }[];
  };
  readonly onBy: (metric: string) => void;
  readonly itemHref: (id: string) => string;
}

/**
 * How a collection did, the figures that matter first: each metric's total and each ratio over
 * everything, a number each with the run it came by; then one metric, the one the person
 * picks, looked at closer: by week as one chart on its own scale, and the items that did best
 * by it as bars. No figure stands twice: the weeks' exact figures are the chart's own, said to
 * the pointer and, as a table, to a reader who cannot see it.
 */
export function DeskCollectionResults(props: DeskCollectionResultsProps) {
  const words = useWords().desk.records;
  const { tag } = useLanguage();
  const { collection, results, best } = props;
  const metrics = collection?.metrics ?? [];
  const picked = best.metric;
  if (metrics.length === 0 || picked === undefined) {
    return <p className="sc-muted">{words.noMetrics}</p>;
  }
  if (results.metrics.every((metric) => metric.total === undefined)) {
    // Nothing recorded yet: what would fill the view, and no axis drawn over nothing.
    return <EmptyState title={words.noFigures.title} body={words.noFigures.body} />;
  }
  /** A metric's totals by week, the latest last; nothing for a week with no row of it. */
  const byWeek = (key: string): readonly (number | undefined)[] =>
    results.weeks.map((week) => week.metrics.find((metric) => metric.key === key)?.total);
  return (
    <div className="sc-desk-figures">
      <section className="sc-task-section" aria-label={words.inAll}>
        <h3 className="sc-section-title">{words.inAll}</h3>
        <Figures
          label={words.inAll}
          metrics={results.metrics}
          ratios={results.ratios}
          trends={Object.fromEntries(metrics.map((metric) => [metric.key, byWeek(metric.key)]))}
        />
      </section>
      <section className="sc-task-section" aria-label={picked.label}>
        {metrics.length > 1 ? (
          <div className="sc-filters">
            <label className="sc-field sc-field-inline">
              <span className="sc-visually-hidden">{words.bestBy}</span>
              <select
                className="sc-input"
                value={picked.key}
                onChange={(event) => props.onBy(event.target.value)}
              >
                {metrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {words.bestBy} {metric.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <h3 className="sc-section-title">{picked.label}</h3>
        )}
        <div className="sc-desk-pair">
          <section className="sc-panel" aria-label={words.byWeek}>
            <h4 className="sc-section-title">{words.byWeek}</h4>
            <Chart
              title={`${picked.label} · ${words.byWeek}`}
              // What is counted in a week stands as a column; a share, which is followed
              // from week to week, as a line.
              kind={picked.unit === "percent" ? "line" : "columns"}
              language={tag}
              points={results.weeks.map((week) => weekStartLabel(week.start, tag))}
              series={[{ name: picked.label, values: byWeek(picked.key) }]}
              // A count is written as the language writes a number, short on the scale; a
              // share and a time carry their unit.
              format={
                picked.unit === "percent" || picked.unit === "seconds"
                  ? (value) => metricWords({ unit: picked.unit, total: value }, tag, words)
                  : undefined
              }
              empty={words.noRows}
            />
          </section>
          <section className="sc-panel" aria-label={words.best}>
            <h4 className="sc-section-title">{words.best}</h4>
            {best.items.length === 0 ? (
              <p className="sc-muted">{words.noRows}</p>
            ) : (
              <BarList
                label={words.best}
                ranked
                language={tag}
                rows={best.items.map(({ item, total }) => ({
                  id: item.id,
                  label: item.title,
                  href: props.itemHref(item.id),
                  note:
                    item.status === undefined ? undefined : (
                      <StatusBadge collection={collection} status={item.status} />
                    ),
                  value: total,
                  words: metricWords({ unit: picked.unit, total }, tag, words),
                }))}
              />
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
