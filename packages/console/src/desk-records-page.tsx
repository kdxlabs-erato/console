import { useEffect, useMemo, useState } from "react";
import type { WeekStart } from "./api.js";
import {
  DeskCollectionResults,
  DeskCollections,
  DeskCollectionView,
  type DeskFile,
  DeskItemView,
  DeskNoRecords,
  DeskRecordCrumbs,
  DeskRecordProblems,
} from "./components/desk-records.js";
import { EmptyState, LinkButton, Spinner } from "./components/ui.js";
import { deviceLanguage, firstDayOfWeek, today as todayOf } from "./dates.js";
import {
  bestItems,
  type CollectionRecords,
  fileSrc,
  itemResults,
  probeFile,
  RECORDS_BASE,
  type RecordFileState,
  type RecordsAddress,
  type RecordsOverview,
  type RecordsReader,
  readCollection,
  readRecords,
  recordsAddressOf,
  recordsQuery,
  resultsOf,
} from "./desk-records.js";
import { useLanguage, useWords } from "./i18n/index.js";
import type { Navigation } from "./router.js";

// The records' view of a desk's page (ADR-0117): what the desk's member made and what became
// of it, read from the files the desk keeps under `records/`, which the server that serves the
// pages serves beside them. The address says what is shown (ADR-0010): the collections, one
// collection with its items narrowed by status, one item, or a collection's results. Every
// file is read again each time its view is come to, so that what an agent just wrote is there.

/** The reader of a page in a browser: the page's own `fetch`, at the place the records are served. */
function ownReader(): RecordsReader {
  return { fetch: (path, init) => globalThis.fetch(path, init) };
}

export interface DeskRecordsProps {
  /** The query of the address the page is at. */
  readonly search: string;
  /** The page's own address, without a query. */
  readonly href: string;
  readonly navigation: Navigation;
  /** What reads the records; the page's own `fetch` at `/records` where left out. */
  readonly reader?: RecordsReader | undefined;
  /** The day the week begins on, as the workspace says. */
  readonly weekStart?: WeekStart | undefined;
  /** Where a task of the board is, for an item that names one. */
  readonly taskHref: (projectKey: string, taskNumber: number) => string;
}

export function DeskRecords(props: DeskRecordsProps) {
  const words = useWords().desk.records;
  const { tag } = useLanguage();
  const { search, href, navigation } = props;
  const address = recordsAddressOf(search);
  const key = address.collection;
  const given = props.reader;
  const reader = useMemo(() => given ?? ownReader(), [given]);
  const base = reader.base ?? RECORDS_BASE;
  const at = (next: RecordsAddress): string => {
    const query = recordsQuery(next);
    return query.length === 0 ? href : `${href}?${query}`;
  };

  const [overview, setOverview] = useState<RecordsOverview | undefined>(undefined);
  const [records, setRecords] = useState<CollectionRecords | undefined>(undefined);
  const [probed, setProbed] = useState<
    { readonly of: string; readonly states: readonly RecordFileState[] } | undefined
  >(undefined);

  // The collections, read each time the list is come to.
  useEffect(() => {
    if (key !== undefined) {
      return;
    }
    const controller = new AbortController();
    readRecords(reader, controller.signal)
      .then((read) => {
        if (!controller.signal.aborted) {
          setOverview(read);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [reader, key]);

  // One collection, read each time it is come to: its items, its uses and its metrics.
  useEffect(() => {
    if (key === undefined) {
      return;
    }
    const controller = new AbortController();
    setRecords((held) => (held?.key === key ? held : undefined));
    readCollection(reader, key, controller.signal)
      .then((read) => {
        if (!controller.signal.aborted) {
          setRecords(read);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [reader, key]);

  const held = records?.key === key ? records : undefined;
  const item =
    address.item === undefined ? undefined : held?.items.find((one) => one.id === address.item);
  const named = item?.files;
  const itemId = item?.id;

  // The files of the item shown: each asked of the server for what it is, by its first bytes.
  useEffect(() => {
    if (key === undefined || itemId === undefined || named === undefined || named.length === 0) {
      return;
    }
    const of = `${key}/${itemId}`;
    const controller = new AbortController();
    Promise.all(named.map((file) => probeFile(reader, key, file.path, controller.signal)))
      .then((states) => {
        if (!controller.signal.aborted) {
          setProbed({ of, states });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [reader, key, itemId, named]);

  const loading = (
    <div className="sc-loading">
      <Spinner label={words.loading} />
    </div>
  );

  if (key === undefined) {
    if (overview === undefined) {
      return loading;
    }
    if (overview.kind === "none") {
      return <DeskNoRecords />;
    }
    return (
      <div className="sc-desk-records">
        <DeskRecordProblems problems={overview.problems} />
        <DeskCollections
          collections={overview.collections}
          collectionHref={(collection) => at({ collection })}
        />
      </div>
    );
  }

  if (held === undefined) {
    return loading;
  }
  const title = held.collection?.title ?? key;
  if (!held.found) {
    return (
      <div className="sc-desk-records">
        <DeskRecordCrumbs steps={[{ label: words.crumb, href: at({}) }, { label: key }]} />
        <EmptyState title={words.noSuchCollection.title} body={words.noSuchCollection.body} />
      </div>
    );
  }
  if (address.item !== undefined) {
    const states = probed?.of === `${key}/${address.item}` ? probed.states : undefined;
    const files: readonly DeskFile[] = (item?.files ?? []).map((file, index) => ({
      label: file.label,
      src: fileSrc(key, file.path, base),
      state: states?.[index] ?? { kind: "reading" },
    }));
    return (
      <div className="sc-desk-records">
        <DeskRecordCrumbs
          steps={[
            { label: words.crumb, href: at({}) },
            { label: title, href: at({ collection: key }) },
            { label: item?.title ?? address.item },
          ]}
        />
        <DeskRecordProblems problems={held.problems} />
        {item === undefined ? (
          <EmptyState title={words.noSuchItem.title} body={words.noSuchItem.body} />
        ) : (
          <DeskItemView
            collectionKey={key}
            collection={held.collection}
            item={item}
            uses={held.uses.filter((use) => use.item === item.id)}
            results={itemResults(held.collection, held.metrics, item.id)}
            files={files}
            taskHref={props.taskHref}
            base={base}
          />
        )}
      </div>
    );
  }
  const results = address.results === true;
  const figured = (held.collection?.metrics ?? []).length > 0;
  return (
    <div className="sc-desk-records">
      <DeskRecordCrumbs steps={[{ label: words.crumb, href: at({}) }, { label: title }]} />
      <div className="sc-section-head">
        <h2 className="sc-section-title">{title}</h2>
        {figured && (
          <LinkButton href={at(results ? { collection: key } : { collection: key, results: true })}>
            {results ? words.showItems : words.showResults}
          </LinkButton>
        )}
      </div>
      {held.collection?.description !== undefined && held.collection.description.length > 0 && (
        <p className="sc-lead">{held.collection.description}</p>
      )}
      <DeskRecordProblems problems={held.problems} />
      {results ? (
        <DeskCollectionResults
          collection={held.collection}
          results={resultsOf({
            collection: held.collection,
            rows: held.metrics,
            today: todayOf(),
            firstDay: firstDayOfWeek(deviceLanguage(tag), props.weekStart),
          })}
          best={bestItems({
            collection: held.collection,
            items: held.items,
            rows: held.metrics,
            by: address.by,
          })}
          onBy={(by) => navigation.go(at({ collection: key, results: true, by }))}
          itemHref={(id) => at({ collection: key, item: id })}
        />
      ) : (
        <DeskCollectionView
          // Keyed by how the items are narrowed, so that a list narrowed anew starts at its first page.
          key={address.status ?? ""}
          collectionKey={key}
          collection={held.collection}
          items={held.items}
          status={address.status}
          onStatus={(status) => navigation.go(at({ collection: key, status }))}
          itemHref={(id) => at({ collection: key, item: id })}
          base={base}
        />
      )}
    </div>
  );
}
