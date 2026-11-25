import { type MouseEvent as ReactMouseEvent, useEffect, useId, useRef } from "react";
import {
  agentLabel,
  type RestEvent,
  type RestNotification,
  type RestNotificationSettings,
  type RestNotificationSettingsInput,
} from "../api.js";
import { useWords } from "../i18n/index.js";
import { describeEvent } from "./event-feed.js";
import { Icon } from "./icon.js";
import { isPlainClick } from "./shell.js";
import { Avatar, Button, cx, personName, Spinner, Time } from "./ui.js";

// What a member is told of what happens on the board (ADR-0157): their notifications as a list
// that opens under a bell in the page's head, what they chose to be told of, and whether one
// task tells them anything. Each takes its data as props and nothing from the network; what
// happened is said as the feed says it (ADR-0012).

/** The kinds of notification by what they are of, as the settings group them, in the order they are read. */
const KIND_GROUPS = [
  { group: "tasks", kinds: ["assigned", "ready", "commented", "moved", "changed", "archived"] },
  { group: "decisions", kinds: ["decision", "answered"] },
  { group: "agents", kinds: ["agent"] },
] as const;

/**
 * How much of what an event names a row of the list shows: the row says that something
 * happened and to what, in two lines, and the page it leads to says it whole. A title is cut
 * shorter than a comment or a question, since the sentence goes on after it.
 */
const TITLE_SHOWN = 44;
const EXCERPT_SHOWN = 72;
const QUESTION_SHOWN = 72;

type KnownKind = (typeof KIND_GROUPS)[number]["kinds"][number];

const KNOWN_KINDS: readonly string[] = KIND_GROUPS.flatMap((one) => [...one.kinds]);

const isKnownKind = (kind: string): kind is KnownKind => KNOWN_KINDS.includes(kind);

/** A text cut to so many characters, never in the middle of a letter of two, with what says it was cut. */
function cut(text: string | undefined, most: number): string | undefined {
  if (text === undefined || text.length <= most) {
    return text;
  }
  const last = text.charCodeAt(most - 1);
  return `${text.slice(0, last >= 0xd800 && last <= 0xdbff ? most - 1 : most).trimEnd()}…`;
}

/** An event with what it names cut to what a row of the list shows. */
function shortened(event: RestEvent): RestEvent {
  const { data } = event;
  const title = cut(data.title, TITLE_SHOWN);
  const excerpt = cut(data.excerpt, EXCERPT_SHOWN);
  const question = cut(data.question, QUESTION_SHOWN);
  return {
    ...event,
    data: {
      ...data,
      ...(title === undefined ? {} : { title }),
      ...(excerpt === undefined ? {} : { excerpt }),
      ...(question === undefined ? {} : { question }),
    },
  };
}

export interface NotificationsMenuProps {
  /** How many notifications the reader has not read: the bell is marked where there are any. */
  readonly unread: number;
  /** The notifications read so far, the newest first; nothing while the first of them are on their way. */
  readonly notifications: readonly RestNotification[] | undefined;
  /**
   * The moment the list was read at when it opened: a notification read at that moment or
   * after, or not read yet, was new to the reader until now, and is shown so.
   */
  readonly since?: string | undefined;
  readonly problem?: string | undefined;
  /** Where a notification leads: the task, the decision, the agent account's page; nothing where it leads nowhere the reader may go. */
  readonly href: (notification: RestNotification) => string | undefined;
  /** Where what the reader is told of is chosen. */
  readonly settingsHref: string;
  readonly more?: boolean | undefined;
  readonly onMore?: (() => void) | undefined;
  /** Called as the list opens: it is read then, and all of it counts as read from then on. */
  readonly onOpen: () => void;
  /** Follows a link inside the app without loading a document. */
  readonly onNavigate: (href: string) => void;
}

/**
 * A member's notifications, under a bell in the page's head: the bell is marked while there is
 * something they have not read, and the list opens under it, the newest first. A row says who
 * did what in two lines at most, and why and where the reader is told under them; one that was
 * new when the list opened is marked. Opening the list reads all of it: nothing is read one by
 * one.
 */
export function NotificationsMenu(props: NotificationsMenuProps) {
  const words = useWords();
  const said = words.notifications;
  const kinds: Readonly<Record<string, string>> = said.kinds;
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (details.current !== null) {
      details.current.open = false;
    }
  };
  // A click elsewhere, or the escape key, closes it, as a menu is expected to.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const element = details.current;
      if (
        element?.open === true &&
        !(event.target instanceof Node && element.contains(event.target))
      ) {
        element.open = false;
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.current !== null) {
        details.current.open = false;
      }
    };
    // A click in a plugin's frame is a click elsewhere the page never sees: the window loses the focus.
    const onBlur = () => {
      if (details.current !== null) {
        details.current.open = false;
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  const follow = (href: string) => (event: ReactMouseEvent) => {
    if (isPlainClick(event)) {
      event.preventDefault();
      close();
      props.onNavigate(href);
    }
  };
  const since = props.since === undefined ? undefined : Date.parse(props.since);
  const fresh = (notification: RestNotification): boolean =>
    notification.readAt === null ||
    (since !== undefined && Date.parse(notification.readAt) >= since);
  const { notifications } = props;
  return (
    <details
      className="sc-menu"
      ref={details}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          props.onOpen();
        }
      }}
    >
      <summary
        className="sc-menu-summary sc-menu-summary-glyph"
        aria-label={props.unread > 0 ? said.openNew(props.unread) : said.open}
        title={said.open}
      >
        <Icon name="bell" size="md" />
        {props.unread > 0 && <span className="sc-nav-dot" aria-hidden="true" />}
      </summary>
      <div className="sc-menu-panel sc-menu-panel-list">
        <div className="sc-menu-head">
          <span className="sc-menu-title">{said.title}</span>
          <a
            className="sc-menu-head-link"
            href={props.settingsHref}
            onClick={follow(props.settingsHref)}
          >
            {said.settingsLink}
          </a>
        </div>
        {props.problem !== undefined ? (
          <p className="sc-menu-note" role="alert">
            {props.problem}
          </p>
        ) : notifications === undefined ? (
          <div className="sc-menu-note">
            <Spinner label={said.loading} />
          </div>
        ) : notifications.length === 0 ? (
          <div className="sc-menu-note">
            <p className="sc-menu-title">{said.empty.title}</p>
            <p>{said.empty.body}</p>
          </div>
        ) : (
          <ul className="sc-menu-rows" aria-label={said.list}>
            {notifications.map((notification) => {
              const { event } = notification;
              const href = props.href(notification);
              const sentence = describeEvent(shortened(event), words);
              const why = notification.followed
                ? said.followed
                : Object.hasOwn(kinds, notification.kind)
                  ? kinds[notification.kind]
                  : notification.kind;
              const isNew = fresh(notification);
              const row = (
                <>
                  {event.actor === null ? (
                    <span className="sc-menu-row-glyph">
                      <Icon name="bell" size="md" className="sc-icon-plain" />
                    </span>
                  ) : (
                    <Avatar person={event.actor} size="sm" />
                  )}
                  <span className="sc-menu-row-text">
                    <span className="sc-menu-row-title" title={describeEvent(event, words)}>
                      <span className="sc-menu-row-who">
                        {event.actor === null ? words.feed.console : personName(event.actor)}
                      </span>
                      {event.agent !== null && (
                        <span className="sc-feed-agent" title={event.agent}>
                          {" "}
                          {words.feed.as(agentLabel(event.agent))}
                        </span>
                      )}{" "}
                      {sentence}
                    </span>
                    <span className="sc-menu-row-facts">
                      <span className="sc-menu-row-why">
                        {why}
                        {notification.project !== null && ` · ${notification.project.name}`}
                      </span>
                      <Time iso={notification.createdAt} precision="clock" />
                    </span>
                  </span>
                  {isNew && <span className="sc-nav-dot" role="img" aria-label={said.fresh} />}
                </>
              );
              return (
                <li key={notification.id}>
                  {href === undefined ? (
                    <span className={cx("sc-menu-row", isNew && "sc-menu-row-new")}>{row}</span>
                  ) : (
                    <a
                      className={cx("sc-menu-row", isNew && "sc-menu-row-new")}
                      href={href}
                      onClick={follow(href)}
                    >
                      {row}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {props.more === true && props.onMore !== undefined && (
          <div className="sc-menu-foot">
            <button type="button" className="sc-menu-link" onClick={props.onMore}>
              {said.more}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

export interface NotificationSettingsProps {
  readonly settings: RestNotificationSettings;
  /** The projects the member may see, to turn one off or on again. */
  readonly projects: readonly { readonly key: string; readonly name: string }[];
  /** Whether the member is an agent account: a notification is then what wakes it, and the page says so. */
  readonly agent?: boolean | undefined;
  readonly busy?: boolean | undefined;
  readonly onChange: (input: RestNotificationSettingsInput) => void;
}

/**
 * What a member is told of: each kind a choice that is lit while on, the projects they are
 * told nothing of, whether what their own agents do as them counts, and, for each plugin that
 * carries notifications elsewhere, which of the kinds they have on it sends them too. A choice
 * is kept as it is made: what the page shows is what holds.
 */
export function NotificationSettings(props: NotificationSettingsProps) {
  const words = useWords().notifications.settings;
  const kindWords: Readonly<Record<string, string>> = useWords().notifications.kinds;
  const { settings, busy } = props;
  const ownAgentsId = useId();
  const off = new Set(settings.projectsOff.map((project) => project.key));
  const changed = Object.keys(settings.kinds).some(
    (kind) => settings.kinds[kind] !== settings.defaults[kind],
  );
  const untouched =
    !changed &&
    off.size === 0 &&
    !settings.ownAgents &&
    settings.carriers.every((carrier) => carrier.off.length === 0);
  // A kind a newer console adds is offered under its own name, after the ones this page knows.
  const others = Object.keys(settings.kinds).filter((kind) => !isKnownKind(kind));
  const nameOf = (kind: string): string =>
    Object.hasOwn(kindWords, kind) ? (kindWords[kind] ?? kind) : kind;
  // The kinds that are on, in the order the page reads them: what there is for a plugin to carry.
  const on = [...KNOWN_KINDS, ...others].filter((kind) => settings.kinds[kind] === true);
  const choice = (kind: string) => (
    <label key={kind} className="sc-toggle-chip">
      <input
        type="checkbox"
        checked={settings.kinds[kind] === true}
        disabled={busy === true}
        onChange={(event) => props.onChange({ kinds: { [kind]: event.target.checked } })}
      />
      {nameOf(kind)}
    </label>
  );
  return (
    <div className="sc-settings-form">
      <p className="sc-lead">{props.agent === true ? words.introAgent : words.intro}</p>
      {KIND_GROUPS.map(({ group, kinds }) => (
        <div key={group} className="sc-settings-row">
          <div>
            <span className="sc-settings-label">{words.groups[group]}</span>
            <p className="sc-settings-hint">{words.hints[group]}</p>
          </div>
          <div className="sc-settings-control">
            <fieldset className="sc-toggle-chips" aria-label={words.groups[group]}>
              {kinds.filter((kind) => Object.hasOwn(settings.kinds, kind)).map(choice)}
              {group === "agents" && others.map(choice)}
            </fieldset>
          </div>
        </div>
      ))}
      {settings.carriers.map((carrier) => (
        <div key={carrier.key} className="sc-settings-row">
          <div>
            <span className="sc-settings-label">{words.carrier.label(carrier.name)}</span>
            <p className="sc-settings-hint">{words.carrier.hint(carrier.name)}</p>
          </div>
          <div className="sc-settings-control">
            {on.length === 0 ? (
              <p className="sc-muted">{words.carrier.none}</p>
            ) : (
              <fieldset className="sc-toggle-chips" aria-label={words.carrier.label(carrier.name)}>
                {on.map((kind) => (
                  <label key={kind} className="sc-toggle-chip">
                    <input
                      type="checkbox"
                      checked={!carrier.off.includes(kind)}
                      disabled={busy === true}
                      onChange={(event) =>
                        props.onChange({
                          carriers: { [carrier.key]: { [kind]: event.target.checked } },
                        })
                      }
                    />
                    {nameOf(kind)}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </div>
      ))}
      {props.projects.length > 0 && (
        <div className="sc-settings-row">
          <div>
            <span className="sc-settings-label">{words.projects}</span>
            <p className="sc-settings-hint">{words.projectsHint}</p>
          </div>
          <div className="sc-settings-control">
            <fieldset className="sc-toggle-chips" aria-label={words.projects}>
              {props.projects.map((project) => (
                <label key={project.key} className="sc-toggle-chip">
                  <input
                    type="checkbox"
                    checked={!off.has(project.key)}
                    disabled={busy === true}
                    onChange={(event) =>
                      props.onChange({
                        projectsOff: event.target.checked
                          ? [...off].filter((key) => key !== project.key)
                          : [...off, project.key],
                      })
                    }
                  />
                  {project.name}
                </label>
              ))}
            </fieldset>
          </div>
        </div>
      )}
      {props.agent !== true && (
        <div className="sc-settings-row">
          <div>
            <label className="sc-settings-label" htmlFor={ownAgentsId}>
              {words.ownAgents}
            </label>
            <p className="sc-settings-hint">{words.ownAgentsHint}</p>
          </div>
          <div className="sc-settings-control">
            <label className="sc-check">
              <input
                id={ownAgentsId}
                type="checkbox"
                checked={settings.ownAgents}
                disabled={busy === true}
                onChange={(event) => props.onChange({ ownAgents: event.target.checked })}
              />
              {words.ownAgentsOn}
            </label>
          </div>
        </div>
      )}
      <div className="sc-form-actions">
        <Button
          variant="ghost"
          disabled={busy === true || untouched}
          onClick={() => props.onChange({ reset: true })}
        >
          {words.reset}
        </Button>
      </div>
    </div>
  );
}

export interface TaskBellProps {
  /** Whether the task tells the reader anything, as it stands. */
  readonly on: boolean;
  readonly busy?: boolean | undefined;
  /** Called with what the reader turns it to. */
  readonly onChange: (on: boolean) => void;
}

/**
 * Whether one task tells the reader anything, as a bell that is pressed to turn it: lit while
 * what happens on the task reaches them, struck through while it does not. On to begin with
 * for a task their settings tell them of, and off for any other.
 */
export function TaskBell(props: TaskBellProps) {
  const words = useWords().notifications.task;
  return (
    <Button
      variant="ghost"
      className="sc-button-glyph"
      aria-pressed={props.on}
      aria-label={props.on ? words.turnOff : words.turnOn}
      title={props.on ? words.on : words.off}
      disabled={props.busy === true}
      onClick={() => props.onChange(!props.on)}
    >
      <Icon name={props.on ? "bell" : "bell-off"} size="md" />
    </Button>
  );
}
