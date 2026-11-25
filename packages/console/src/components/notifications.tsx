import { useId } from "react";
import {
  agentLabel,
  type RestNotification,
  type RestNotificationSettings,
  type RestNotificationSettingsInput,
  type RestTaskFollow,
} from "../api.js";
import { useWords } from "../i18n/index.js";
import { describeEvent } from "./event-feed.js";
import { Badge, Button, cx, PersonChip, Time } from "./ui.js";

// What a member is told of what happens on the board (ADR-0157): their notifications as rows,
// what they chose to be told of, and what they made of one task. Each takes its data as props
// and nothing from the network; what happened is said as the feed says it (ADR-0012).

/** The kinds of notification by what they are of, as the settings group them, in the order they are read. */
const KIND_GROUPS = [
  { group: "tasks", kinds: ["assigned", "ready", "commented", "moved", "changed", "archived"] },
  { group: "decisions", kinds: ["decision", "answered"] },
  { group: "agents", kinds: ["agent"] },
] as const;

/** How much of a comment a notification's row shows. */
const EXCERPT_SHOWN = 80;

type KnownKind = (typeof KIND_GROUPS)[number]["kinds"][number];

const KNOWN_KINDS: readonly string[] = KIND_GROUPS.flatMap((one) => [...one.kinds]);

const isKnownKind = (kind: string): kind is KnownKind => KNOWN_KINDS.includes(kind);

export interface NotificationListProps {
  readonly notifications: readonly RestNotification[];
  /** Where a notification leads: the task, the decision, the agent account's page; nothing where it leads nowhere the reader may go. */
  readonly href: (notification: RestNotification) => string | undefined;
  /** Called when a notification that was not read is opened. */
  readonly onOpen?: ((notification: RestNotification) => void) | undefined;
  readonly more?: boolean | undefined;
  readonly onMore?: (() => void) | undefined;
}

/**
 * A member's notifications, the newest first: who did what, as the feed says it, why the
 * member is told and where it happened under it, and when at the row's end. One not read
 * yet says so; one read is quieter.
 */
export function NotificationList(props: NotificationListProps) {
  const words = useWords();
  const said = words.notifications;
  const kinds: Readonly<Record<string, string>> = said.kinds;
  return (
    <>
      <ul className="sc-task-rows" aria-label={said.list}>
        {props.notifications.map((notification) => {
          const { event } = notification;
          const href = props.href(notification);
          // A comment's words are cut short here: the row says that there is one, and the
          // task says it whole.
          const excerpt = event.data.excerpt;
          const sentence = describeEvent(
            excerpt === undefined || excerpt.length <= EXCERPT_SHOWN
              ? event
              : {
                  ...event,
                  data: { ...event.data, excerpt: `${excerpt.slice(0, EXCERPT_SHOWN).trimEnd()}…` },
                },
            words,
          );
          const unread = notification.readAt === null;
          const why = [
            notification.followed
              ? said.followed
              : Object.hasOwn(kinds, notification.kind)
                ? kinds[notification.kind]
                : notification.kind,
            ...(notification.project === null ? [] : [notification.project.name]),
          ].join(" · ");
          return (
            <li key={notification.id} className={cx("sc-task-row", !unread && "sc-task-row-seen")}>
              <span className="sc-notification-line">
                {event.actor === null ? (
                  <span className="sc-person-login">{words.feed.console}</span>
                ) : (
                  <PersonChip person={event.actor} />
                )}
                {event.agent !== null && (
                  <span className="sc-feed-agent" title={event.agent}>
                    {words.feed.as(agentLabel(event.agent))}
                  </span>
                )}
                {href === undefined ? (
                  <span className="sc-task-row-title">{sentence}</span>
                ) : (
                  <a
                    className="sc-task-row-title"
                    href={href}
                    onClick={unread ? () => props.onOpen?.(notification) : undefined}
                  >
                    {sentence}
                  </a>
                )}
              </span>
              <span className="sc-task-row-project">{why}</span>
              <span className="sc-task-row-meta">
                {unread && <Badge tone="accent">{said.unread}</Badge>}
                <Time iso={notification.createdAt} precision="clock" />
              </span>
            </li>
          );
        })}
      </ul>
      {props.more === true && props.onMore !== undefined && (
        <div className="sc-show-more">
          <Button variant="secondary" size="sm" onClick={props.onMore}>
            {said.more}
          </Button>
        </div>
      )}
    </>
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
 * told nothing of, and whether what their own agents do as them counts. A choice is kept as it
 * is made: what the page shows is what holds.
 */
export function NotificationSettings(props: NotificationSettingsProps) {
  const words = useWords().notifications.settings;
  const kindWords = useWords().notifications.kinds;
  const { settings, busy } = props;
  const ownAgentsId = useId();
  const off = new Set(settings.projectsOff.map((project) => project.key));
  const changed = Object.keys(settings.kinds).some(
    (kind) => settings.kinds[kind] !== settings.defaults[kind],
  );
  const untouched = !changed && off.size === 0 && !settings.ownAgents;
  // A kind a newer console adds is offered under its own name, after the ones this page knows.
  const others = Object.keys(settings.kinds).filter((kind) => !isKnownKind(kind));
  const choice = (kind: string, label: string) => (
    <label key={kind} className="sc-toggle-chip">
      <input
        type="checkbox"
        checked={settings.kinds[kind] === true}
        disabled={busy === true}
        onChange={(event) => props.onChange({ kinds: { [kind]: event.target.checked } })}
      />
      {label}
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
              {kinds
                .filter((kind) => Object.hasOwn(settings.kinds, kind))
                .map((kind) => choice(kind, kindWords[kind]))}
              {group === "agents" && others.map((kind) => choice(kind, kind))}
            </fieldset>
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

export interface TaskFollowProps {
  /** What the reader made of the task: following it, muted, or neither. */
  readonly state: RestTaskFollow["state"];
  readonly busy?: boolean | undefined;
  readonly onChange: (state: RestTaskFollow["state"]) => void;
}

/**
 * What the reader is told of one task: as their settings say, everything that happens on it,
 * or nothing. One of three, the one that holds lit.
 */
export function TaskFollow(props: TaskFollowProps) {
  const words = useWords().notifications.task;
  const name = useId();
  const choices = [
    { state: null, label: words.settings, title: words.settingsHint },
    { state: "following", label: words.following, title: words.followingHint },
    { state: "muted", label: words.muted, title: words.mutedHint },
  ] as const;
  return (
    <fieldset className="sc-toggle-chips" aria-label={words.label}>
      {choices.map((choice) => (
        <label key={choice.state ?? "settings"} className="sc-toggle-chip" title={choice.title}>
          <input
            type="radio"
            name={name}
            checked={props.state === choice.state}
            disabled={props.busy === true}
            onChange={() => props.onChange(choice.state)}
          />
          {choice.label}
        </label>
      ))}
    </fieldset>
  );
}
