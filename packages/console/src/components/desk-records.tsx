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
import { weekLabel } from "./desk.js";
import { ShowMore, usePaged } from "./paged.js";
import { Badge, Callout, Day, EmptyState } from "./ui.js";

// The records' views of a desk's pages (ADR-0117): the collections a desk keeps, one collection
// with its items, one item with its files, where it was used and how it did, and a collection's
// results. Each takes what was read as props and nothing from the network, and is built from
// the console's parts alone. Everything a record says was written by an agent and is shown as
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
 * One item: its preview and its files, its note, where it was used and how it did by day, and
 * beside them what it says of itself: the day it was made, its status, its fields, its links,
 * and the task it names, where it names one.
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
          {metrics.length > 0 && (
            <section className="sc-task-section" aria-label={words.results}>
              <h3 className="sc-section-title">{words.results}</h3>
              {results.days.length === 0 ? (
                <p className="sc-muted">{words.noRows}</p>
              ) : (
                <>
                  <Figures metrics={results.metrics} ratios={results.ratios} />
                  <section className="sc-panel" aria-label={words.byDay}>
                    <h4 className="sc-eyebrow">{words.byDay}</h4>
                    <dl className="sc-facts sc-facts-plain">
                      {days.shown.map((row) => (
                        <div key={row.on}>
                          <dt>
                            <Day day={row.on} />
                          </dt>
                          <dd>
                            {metrics
                              .filter((metric) => row.values[metric.key] !== undefined)
                              .map(
                                (metric) =>
                                  `${metric.label} ${metricWords({ unit: metric.unit, total: row.values[metric.key] }, tag, words)}`,
                              )
                              .join(" · ")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <ShowMore rest={days.rest} onMore={days.more} />
                  </section>
                </>
              )}
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

/** The figures of some rows: each metric's total and each ratio, a name over a number. */
function Figures(props: {
  readonly metrics: readonly MetricFigure[];
  readonly ratios: readonly RatioFigure[];
}) {
  const words = useWords().desk.records;
  const { tag } = useLanguage();
  return (
    <dl className="sc-facts">
      {props.metrics.map((metric) => (
        <div key={metric.key}>
          <dt>{metric.label}</dt>
          <dd>{metricWords(metric, tag, words)}</dd>
        </div>
      ))}
      {props.ratios.map((ratio) => (
        <div key={`ratio ${ratio.key}`}>
          <dt>{ratio.label}</dt>
          <dd>{ratioWords(ratio, tag, words)}</dd>
        </div>
      ))}
    </dl>
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
 * How a collection did: each metric's total and each ratio over everything, the metrics by
 * week, and the items that did best by a metric the person picks.
 */
export function DeskCollectionResults(props: DeskCollectionResultsProps) {
  const words = useWords().desk.records;
  const { tag } = useLanguage();
  const { collection, results, best } = props;
  const metrics = collection?.metrics ?? [];
  if (metrics.length === 0) {
    return <p className="sc-muted">{words.noMetrics}</p>;
  }
  return (
    <div className="sc-desk-figures">
      <section className="sc-task-section" aria-label={words.inAll}>
        <h3 className="sc-section-title">{words.inAll}</h3>
        <Figures metrics={results.metrics} ratios={results.ratios} />
      </section>
      <section className="sc-task-section" aria-label={words.byWeek}>
        <h3 className="sc-section-title">{words.byWeek}</h3>
        <dl className="sc-facts">
          {results.weeks.map((week) => (
            <div key={week.start}>
              <dt>{weekLabel(week.start, week.end, tag)}</dt>
              {week.metrics.every((metric) => metric.total === undefined) ? (
                <dd>{words.noValue}</dd>
              ) : (
                week.metrics.map((metric) => (
                  <dd key={metric.key}>
                    {metric.label} {metricWords(metric, tag, words)}
                  </dd>
                ))
              )}
            </div>
          ))}
        </dl>
      </section>
      <section className="sc-task-section" aria-label={words.best}>
        <h3 className="sc-section-title">{words.best}</h3>
        <div className="sc-filters">
          <label className="sc-field sc-field-inline">
            <span className="sc-visually-hidden">{words.bestBy}</span>
            <select
              className="sc-input"
              value={best.metric?.key ?? ""}
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
        {best.metric === undefined || best.items.length === 0 ? (
          <p className="sc-muted">{words.noRows}</p>
        ) : (
          <ol className="sc-task-rows" aria-label={words.best}>
            {best.items.map(({ item, total }) => (
              <li key={item.id} className="sc-task-row">
                <a className="sc-task-row-title" href={props.itemHref(item.id)}>
                  {item.title}
                </a>
                <span className="sc-task-row-meta">
                  <StatusBadge collection={collection} status={item.status} />
                  <span className="sc-card-number">
                    {best.metric !== undefined &&
                      metricWords({ unit: best.metric.unit, total }, tag, words)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
