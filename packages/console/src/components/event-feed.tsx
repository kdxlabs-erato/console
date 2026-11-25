import type { ReactNode } from "react";
import { agentLabel, type RestEvent } from "../api.js";
import { dayOf } from "../dates.js";
import { describeEvent } from "../feed-words.js";
import { useLanguage, useWords } from "../i18n/index.js";
import { ShowMore, usePaged } from "./paged.js";
import { formatInstant, PersonChip } from "./ui.js";

// The feed: one line per event, newest first, as a sentence a person reads at a glance: who,
// as which agent when through one, and what. It takes its data as props and nothing from the
// network; the sentence is the language's (ADR-0012), made in `feed-words.ts`, where the
// command reads it too, and still exported from here.

export { describeEvent };

export interface EventFeedProps {
  /** Oldest first, as the API hands them over; the feed shows them newest first. */
  readonly events: readonly RestEvent[];
  /** Where the line of an event leads, when it is about a task or a decision. */
  readonly href?: ((event: RestEvent) => string | undefined) | undefined;
  readonly empty?: ReactNode;
}

/** The day an event fell on, by this machine's clock, as the calendar spells a day. */
function dayOfEvent(event: RestEvent): string {
  const date = new Date(event.createdAt);
  return Number.isNaN(date.getTime()) ? event.createdAt : dayOf(date);
}

/** A day as the feed heads it: the weekday and the date, with the year where it is not this one. */
function formatFeedDay(day: string, language: string, now: Date = new Date()): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return day;
  }
  return date.toLocaleDateString(language, {
    weekday: "short",
    month: "long",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Whether two events were done by the same person as the same agent, so the name is said once. */
function sameHands(a: RestEvent, b: RestEvent): boolean {
  return (
    (a.actor?.id ?? null) === (b.actor?.id ?? null) &&
    a.agent === b.agent &&
    (a.via ?? null) === (b.via ?? null)
  );
}

/** The hour of an event, for a row whose day is in the heading above it. */
function formatClock(iso: string, language: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString(language, { hour: "numeric", minute: "2-digit" });
}

type FeedRun = { readonly actor: RestEvent; readonly events: RestEvent[] };
type FeedDay = { readonly day: string; readonly runs: FeedRun[] };

/** The events by the day they fell on, and within a day by runs of the same hands; newest first. */
function groupFeed(events: readonly RestEvent[]): FeedDay[] {
  const days: FeedDay[] = [];
  for (const event of events) {
    const day = dayOfEvent(event);
    let last = days[days.length - 1];
    if (last === undefined || last.day !== day) {
      last = { day, runs: [] };
      days.push(last);
    }
    const run = last.runs[last.runs.length - 1];
    if (run !== undefined && sameHands(run.actor, event)) {
      run.events.push(event);
    } else {
      last.runs.push({ actor: event, events: [event] });
    }
  }
  return days;
}

export function EventFeed(props: EventFeedProps) {
  const words = useWords();
  const { tag } = useLanguage();
  const newestFirst = [...props.events].reverse();
  const { shown, rest, more } = usePaged(newestFirst);
  if (props.events.length === 0) {
    // Named as the feed with events is, so that a feed with nothing in it is still found.
    return (
      <section className="sc-feed" aria-label={words.feed.list}>
        {props.empty ?? null}
      </section>
    );
  }
  return (
    <>
      <section className="sc-feed" aria-label={words.feed.list}>
        {groupFeed(shown).map((group) => (
          <section key={group.day} className="sc-feed-day">
            <h3 className="sc-feed-day-title">
              <time dateTime={group.day}>{formatFeedDay(group.day, tag)}</time>
            </h3>
            <ol className="sc-feed-day-list">
              {group.runs.map((run) => (
                <li key={run.actor.id} className="sc-feed-run">
                  <span className="sc-feed-actor">
                    {run.actor.actor === null ? (
                      <span className="sc-person-login">{words.feed.console}</span>
                    ) : (
                      <PersonChip person={run.actor.actor} />
                    )}
                    {run.actor.agent !== null && (
                      <span
                        className="sc-feed-agent"
                        title={
                          agentLabel(run.actor.agent) === run.actor.agent
                            ? words.feed.asTitle
                            : run.actor.agent
                        }
                      >
                        {words.feed.as(agentLabel(run.actor.agent))}
                      </span>
                    )}
                    {run.actor.via !== null && run.actor.via !== undefined && (
                      <span className="sc-feed-agent" title={words.feed.viaTitle}>
                        {words.feed.via(run.actor.via)}
                      </span>
                    )}
                  </span>
                  <ol className="sc-feed-run-list">
                    {run.events.map((event) => {
                      const href = props.href?.(event);
                      const said = describeEvent(event, words);
                      return (
                        <li key={event.id} className="sc-feed-item">
                          <time
                            className="sc-time sc-feed-clock"
                            dateTime={event.createdAt}
                            title={formatInstant(event.createdAt, tag)}
                          >
                            {formatClock(event.createdAt, tag)}
                          </time>
                          <span className="sc-feed-words">
                            {href === undefined ? said : <a href={href}>{said}</a>}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </section>
      <ShowMore rest={rest} onMore={more} />
    </>
  );
}
