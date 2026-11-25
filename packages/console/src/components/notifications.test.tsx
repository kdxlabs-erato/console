import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RestEvent, RestNotification, RestNotificationSettings } from "../api.js";
import { KOREAN, LanguageContext } from "../i18n/index.js";
import { matchRoute, notificationsHref } from "../router.js";
import { NotificationList, NotificationSettings, TaskFollow } from "./notifications.js";

// What a member is told of (ADR-0157), as the pages show it: a notification a row, said as the
// feed says the event, what they chose to be told of, and what they made of one task.

const alice = {
  id: "0195c0de-0000-7000-8000-000000000001",
  kind: "person",
  login: "alice",
  name: "Alice Example",
  avatarUrl: null,
  handle: null,
  title: null,
  avatar: null,
} as unknown as NonNullable<RestEvent["actor"]>;

const event = (over: Partial<RestEvent>): RestEvent => ({
  id: 7,
  kind: "task.commented",
  actor: alice,
  agent: null,
  projectId: "0195c0de-0000-7000-8000-00000000000a",
  taskId: "0195c0de-0000-7000-8000-00000000000b",
  decisionId: null,
  runId: null,
  documentId: null,
  goalId: null,
  plugin: null,
  data: { number: 12, title: "Fix the import", excerpt: "Is this still due?" },
  createdAt: "2026-11-24T02:58:00.000Z",
  ...over,
});

const notification = (over: Partial<RestNotification> = {}): RestNotification => ({
  id: "0195c0de-0000-7000-8000-0000000000aa",
  kind: "commented",
  followed: false,
  readAt: null,
  createdAt: "2026-11-24T02:58:00.000Z",
  event: event({}),
  project: { key: "ops", name: "Operations", color: null, symbol: null, icon: null },
  ...over,
});

describe("a member's notifications", () => {
  const drawn = (items: readonly RestNotification[], href?: string) =>
    renderToStaticMarkup(
      <NotificationList notifications={items} href={() => href} more onMore={() => undefined} />,
    );

  it("says each as the feed says the event, with who did it, why the member is told and where", () => {
    const seen = drawn([notification()], "/projects/ops/tasks/12");
    expect(seen).toContain('<ul class="sc-task-rows" aria-label="Notifications">');
    expect(seen).toContain("Alice Example");
    expect(seen).toContain(
      '<a class="sc-task-row-title" href="/projects/ops/tasks/12">commented on #12 Fix the import: Is this still due?</a>',
    );
    expect(seen).toContain('<span class="sc-task-row-project">Comment · Operations</span>');
    expect(seen).toContain(">New</span>");
    expect(seen).toContain('dateTime="2026-11-24T02:58:00.000Z"');
    expect(seen).toContain("Show more");
  });

  it("draws one that was read quieter, and with no word that it is new", () => {
    const seen = drawn([notification({ readAt: "2026-11-24T03:00:00.000Z" })], "/somewhere");
    expect(seen).toContain('<li class="sc-task-row sc-task-row-seen">');
    expect(seen).not.toContain(">New</span>");
  });

  it("says a task the member follows as one, a kind it has no word for as it came, and an agent's doing as its own", () => {
    expect(drawn([notification({ followed: true })])).toContain(
      "A task you get everything of · Operations",
    );
    expect(drawn([notification({ kind: "mentioned", project: null })])).toContain(
      '<span class="sc-task-row-project">mentioned</span>',
    );
    // What every object has is no word of the pack.
    expect(drawn([notification({ kind: "constructor", project: null })])).toContain(
      '<span class="sc-task-row-project">constructor</span>',
    );
    const through = drawn([notification({ event: event({ agent: "Claude Code on a laptop" }) })]);
    expect(through).toContain("sc-feed-agent");
    // Where it leads nowhere the reader may go, it is words and no link.
    expect(drawn([notification()])).toContain(
      '<span class="sc-task-row-title">commented on #12 Fix the import: Is this still due?</span>',
    );
    // The console's own doing has nobody's name.
    expect(
      drawn([notification({ event: event({ actor: null, kind: "task.archived" }) })]),
    ).toContain("sc-person-login");
  });

  it("cuts a long comment short, and never a text as markup", () => {
    const long = "x".repeat(300);
    const seen = drawn([notification({ event: event({ data: { number: 1, excerpt: long } }) })]);
    expect(seen).toContain(`${"x".repeat(80)}…`);
    expect(seen).not.toContain("x".repeat(81));
    const hostile = drawn([
      notification({
        event: event({ data: { number: 1, title: "<b>bold</b>", excerpt: "<script>x</script>" } }),
      }),
    ]);
    expect(hostile).not.toContain("<b>bold</b>");
    expect(hostile).not.toContain("<script>");
  });

  it("reads in Korean", () => {
    const seen = renderToStaticMarkup(
      <LanguageContext.Provider value={KOREAN}>
        <NotificationList notifications={[notification()]} href={() => undefined} />
      </LanguageContext.Provider>,
    );
    expect(seen).toContain('aria-label="알림"');
    expect(seen).toContain("댓글 · Operations");
    expect(seen).toContain(">새 알림</span>");
  });
});

describe("what a member chose to be told of", () => {
  const settings = (over: Partial<RestNotificationSettings> = {}): RestNotificationSettings => {
    const defaults = {
      assigned: false,
      ready: false,
      moved: false,
      changed: false,
      commented: false,
      archived: false,
      decision: false,
      answered: false,
      agent: true,
    };
    return { kinds: defaults, defaults, projectsOff: [], ownAgents: false, ...over };
  };
  const projects = [
    { key: "ops", name: "Operations" },
    { key: "lab", name: "Lab" },
  ];
  const drawn = (value: RestNotificationSettings, agent = false) =>
    renderToStaticMarkup(
      <NotificationSettings
        settings={value}
        projects={projects}
        agent={agent}
        onChange={() => undefined}
      />,
    );
  const chip = (label: string, checked: boolean) =>
    `<label class="sc-toggle-chip"><input type="checkbox"${checked ? ' checked=""' : ""}/>${label}</label>`;

  it("offers each kind as a choice that is lit while on, by what it is of", () => {
    const seen = drawn(settings({ kinds: { ...settings().kinds, commented: true } }));
    expect(seen).toContain(chip("Comment", true));
    expect(seen).toContain(chip("Given to you", false));
    expect(seen).toContain(chip("Your agent account", true));
    expect(seen.indexOf("Tasks")).toBeLessThan(seen.indexOf("Decisions"));
    expect(seen.indexOf("Decisions")).toBeLessThan(seen.indexOf("Agent accounts"));
  });

  it("offers each project on unless it was turned off, and nothing to reset where nothing was chosen", () => {
    const untouched = drawn(settings());
    expect(untouched).toContain(chip("Operations", true));
    expect(untouched).toMatch(/<button[^>]*disabled=""[^>]*>Back to the defaults<\/button>/);
    const off = drawn(settings({ projectsOff: [{ key: "lab", name: "Lab" }] }));
    expect(off).toContain(chip("Lab", false));
    expect(off).not.toMatch(/<button[^>]*disabled=""[^>]*>Back to the defaults<\/button>/);
  });

  it("offers a kind a newer console adds under its own name, and an agent account no choice of its own agents", () => {
    const newer = drawn(settings({ kinds: { ...settings().kinds, mentioned: true } }));
    expect(newer).toContain(chip("mentioned", true));
    expect(drawn(settings())).toContain("Tell me of what my agents do as me");
    const account = drawn(settings(), true);
    expect(account).not.toContain("Tell me of what my agents do as me");
    expect(account).toContain("wakes the account");
  });
});

describe("what a member is told of one task", () => {
  it("offers the three, the one that holds lit", () => {
    for (const [state, label] of [
      [null, "By my settings"],
      ["following", "Everything"],
      ["muted", "Nothing"],
    ] as const) {
      const seen = renderToStaticMarkup(<TaskFollow state={state} onChange={() => undefined} />);
      expect(seen.split('type="radio"')).toHaveLength(4);
      expect(seen.split('checked=""')).toHaveLength(2);
      expect(seen).toMatch(new RegExp(`checked=""[^>]*/>${label}</label>`));
    }
    const korean = renderToStaticMarkup(
      <LanguageContext.Provider value={KOREAN}>
        <TaskFollow state="muted" onChange={() => undefined} />
      </LanguageContext.Provider>,
    );
    expect(korean).toContain('aria-label="알림"');
    expect(korean).toMatch(/checked=""[^>]*\/>받지 않기<\/label>/);
  });
});

describe("the address of a member's notifications", () => {
  it("is the page itself for all of them, and names the other views in its query", () => {
    expect(notificationsHref()).toBe("/notifications");
    expect(notificationsHref("unread")).toBe("/notifications?view=unread");
    expect(matchRoute("/notifications", "")).toEqual({ name: "notifications", view: "all" });
    expect(matchRoute("/notifications", "?view=settings")).toEqual({
      name: "notifications",
      view: "settings",
    });
    expect(matchRoute("/notifications", "?view=everything")).toMatchObject({ name: "not-found" });
  });
});
