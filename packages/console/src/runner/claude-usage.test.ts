import { describe, expect, it } from "vitest";
import { createClaudeDriver } from "./claude.js";
import type { Child, DriverEvent } from "./types.js";

// The `claude` driver and the product's allowance, against a product that is not there. The
// line that says how much of the allowance is used is in the shape the binary printed when a
// session was run for it (2.1.330), cut down, with every id and number invented. No stream of a
// limit reached was recorded, since that takes using an allowance up: those lines are written
// down from the product's own record of one and from the names its stream gives the same
// fields, which the product marks as its own and no contract.

const CONVERSATION = "0199c4d8-0000-7000-8000-0000000000c1";
/** 2026-11-10T06:30:00Z, as the product says a moment: in seconds. */
const RESETS = 1_794_292_200;
const WEEK = 1_794_700_800;

/** A product that writes the lines it is given, in order, and ends; with what it was written. */
function product(lines: readonly unknown[], messages = 1) {
  const sent: string[] = [];
  const child: Child = {
    write: async (line) => {
      sent.push(line);
    },
    end: () => undefined,
    lines: (async function* () {
      for (const line of lines) {
        yield typeof line === "string" ? line : JSON.stringify(line);
      }
    })(),
    errors: () => "",
    kill: () => undefined,
    exited: Promise.resolve({ code: 0, signal: null }),
  };
  let made = 0;
  const driver = createClaudeDriver({
    spawn: () => child,
    cwd: "/home/mira/desk",
    uuid: () => {
      made += 1;
      return `m${made}`;
    },
  });
  const session = driver.start({
    cwd: "/home/mira/desk",
    env: {},
    model: null,
    effort: null,
    resume: undefined,
  });
  return {
    sent,
    /** Everything the driver says of the lines, once the messages were written: m1, m2 and so on. */
    async events(): Promise<DriverEvent[]> {
      for (let index = 0; index < messages; index += 1) {
        await session.send({ text: `Message ${index + 1}.`, images: [], priority: "next" });
      }
      const all: DriverEvent[] = [];
      for await (const event of session.events) {
        all.push(event);
      }
      return all;
    },
  };
}

const INIT = {
  type: "system",
  subtype: "init",
  session_id: CONVERSATION,
  model: "claude-sonnet-5-5",
  permissionMode: "auto",
  claude_code_version: "2.1.330",
};
const replay = (uuid: string) => ({
  type: "user",
  uuid,
  isReplay: true,
  message: { role: "user", content: [{ type: "text", text: "Message." }] },
  parent_tool_use_id: null,
  session_id: CONVERSATION,
});
const says = (text: string, parent: string | null = null) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text }] },
  parent_tool_use_id: parent,
  session_id: CONVERSATION,
});
/** What the product says of the allowance after a request, as 2.1.330 printed it. */
const allowance = (over: Record<string, unknown> = {}) => ({
  type: "rate_limit_event",
  rate_limit_info: {
    status: "allowed",
    resetsAt: RESETS,
    rateLimitType: "five_hour",
    overageStatus: "rejected",
    overageDisabledReason: "org_level_disabled",
    isUsingOverage: false,
    unifiedWindows: {
      five_hour: { utilization: 0.13, resetsAt: RESETS, status: "allowed" },
      seven_day: { utilization: 0.19, resetsAt: WEEK, status: "allowed" },
    },
    ...over,
  },
  uuid: "0199c4d8-0000-7000-8000-00000000e101",
  session_id: CONVERSATION,
});
const RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  result: "ok",
  stop_reason: "end_turn",
  session_id: CONVERSATION,
};
const LIMIT_WORDS = "You've hit your 5-hour limit · resets 3:30pm (Asia/Seoul)";
/** The line the product writes in the model's place when the limit refused a request. */
const LIMIT_SAID = {
  type: "assistant",
  message: {
    model: "<synthetic>",
    role: "assistant",
    stop_reason: "stop_sequence",
    content: [{ type: "text", text: LIMIT_WORDS }],
  },
  parent_tool_use_id: null,
  session_id: CONVERSATION,
  error: "rate_limit",
  is_api_error_message: true,
  api_error_status: 429,
  api_error: "usage_limit_reached",
  api_error_params: {
    rate_limit_info: {
      status: "rejected",
      resetsAt: RESETS,
      rateLimitType: "five_hour",
      overageStatus: "rejected",
      isUsingOverage: false,
    },
  },
};
const LIMIT_RESULT = {
  type: "result",
  subtype: "success",
  is_error: true,
  result: LIMIT_WORDS,
  stop_reason: "stop_sequence",
  api_error_status: 429,
  session_id: CONVERSATION,
};

const words = (events: readonly DriverEvent[]) =>
  events.filter((event) => event.type !== "event" && event.type !== "running");
const shown = (events: readonly DriverEvent[]) =>
  events.flatMap((event) => (event.type === "event" ? [[event.kind, event.text]] : []));

describe("the claude driver and the product's allowance", () => {
  it("says how much of each window is used, as the product says it after a request", async () => {
    const events = await product([INIT, replay("m1"), says("ok"), allowance(), RESULT]).events();
    expect(events.filter((event) => event.type === "usage")).toEqual([
      {
        type: "usage",
        windows: [
          { name: "5-hour", used: 0.13, resetsAt: RESETS * 1000 },
          { name: "weekly", used: 0.19, resetsAt: WEEK * 1000 },
        ],
      },
    ]);
    // Nothing of it is the transcript's, and the turn ends as any does.
    expect(shown(events).map(([kind]) => kind)).toEqual(["status", "assistant"]);
    expect(events.at(-2)).toEqual({ type: "turn_completed" });
  });

  it("reads the lines as Claude Code 2.1.322 wrote them, and says the week of one model by the model the session runs", async () => {
    // Recorded from the product on Windows, a turn of one word: the two lines it wrote of the
    // allowance, with their ids left out. The week's window alone at first, then a second
    // one beside it at twice the share: the week of one model, which the product's own
    // description of the line calls a per-model bucket and names no model with.
    const first = {
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        resetsAt: 1795690800,
        rateLimitType: "seven_day",
        overageStatus: "rejected",
        overageDisabledReason: "org_level_disabled",
        isUsingOverage: false,
        unifiedWindows: {
          seven_day: { utilization: 0.13, resetsAt: 1795690800, status: "allowed" },
        },
      },
    };
    const second = {
      ...first,
      rate_limit_info: {
        ...first.rate_limit_info,
        unifiedWindows: {
          seven_day: { utilization: 0.13, resetsAt: 1795690800, status: "allowed" },
          seven_day_overage_included: {
            utilization: 0.26,
            resetsAt: 1795690800,
            status: "allowed",
          },
        },
      },
    };
    const events = await product([first, INIT, replay("m1"), says("ok"), second, RESULT]).events();
    const week = { name: "weekly", used: 0.13, resetsAt: 1795690800 * 1000 };
    // Named by the model the session runs, and kept apart: the agent is told nothing by it.
    const ofModel = {
      name: "weekly sonnet",
      used: 0.26,
      resetsAt: 1795690800 * 1000,
      apart: true,
    };
    expect(events.filter((event) => event.type === "usage")).toEqual([
      { type: "usage", windows: [week] },
      { type: "usage", windows: [week, ofModel] },
    ]);
    // By the family of whatever the product says it runs: an alias, or a name with more after it.
    for (const [model, name] of [
      ["claude-fable-5-2", "weekly fable"],
      ["opus[1m]", "weekly opus"],
      ["Claude-Haiku-5-5-20261101", "weekly haiku"],
    ] as const) {
      const said = await product([{ ...INIT, model }, replay("m1"), second, RESULT]).events();
      expect(said.find((event) => event.type === "usage")).toEqual({
        type: "usage",
        windows: [week, { ...ofModel, name }],
      });
    }
    // Before the product said which model it runs, or where that names none, it is of no
    // model the driver could say: left out until it is said again.
    const early = await product([second, INIT, replay("m1"), RESULT]).events();
    expect(early.filter((event) => event.type === "usage")).toEqual([
      { type: "usage", windows: [week] },
    ]);
    const unnamed = await product([{ ...INIT, model: "4.5" }, replay("m1"), second]).events();
    expect(unnamed.find((event) => event.type === "usage")).toEqual({
      type: "usage",
      windows: [week],
    });
    // A window of what is allowed beyond the subscription is no share of it, and says nothing.
    const alone = {
      ...first,
      rate_limit_info: {
        ...first.rate_limit_info,
        rateLimitType: "overage",
        utilization: 0.95,
        unifiedWindows: {
          overage: { utilization: 0.95, resetsAt: 1795690800 },
        },
      },
    };
    const none = await product([INIT, replay("m1"), says("ok"), alone, RESULT]).events();
    expect(none.filter((event) => event.type === "usage")).toEqual([]);
  });

  it("says a window the product itself calls near its limit, and one of a model by its name", async () => {
    const events = await product([
      INIT,
      allowance({
        status: "allowed_warning",
        unifiedWindows: {
          five_hour: { utilization: 0.91, resetsAt: RESETS, status: "allowed_warning" },
          seven_day_opus: { utilization: 0.4, resetsAt: WEEK },
        },
      }),
    ]).events();
    expect(events.find((event) => event.type === "usage")).toEqual({
      type: "usage",
      windows: [
        { name: "5-hour", used: 0.91, resetsAt: RESETS * 1000, near: true },
        { name: "weekly opus", used: 0.4, resetsAt: WEEK * 1000, apart: true },
      ],
    });
  });

  it("reads the one window a line is of where it names no others", async () => {
    const events = await product([
      INIT,
      allowance({ unifiedWindows: undefined, utilization: 0.82, rateLimitType: "seven_day" }),
    ]).events();
    expect(events.find((event) => event.type === "usage")).toEqual({
      type: "usage",
      windows: [{ name: "weekly", used: 0.82, resetsAt: RESETS * 1000 }],
    });
  });

  it("says nothing of an allowance the product says nothing readable of", async () => {
    for (const info of [
      undefined,
      null,
      "five_hour",
      [],
      { status: "allowed" },
      { unifiedWindows: "all of them" },
      { unifiedWindows: { five_hour: { utilization: "most" } } },
      { unifiedWindows: { five_hour: { utilization: Number.NaN, resetsAt: -1 } } },
      { unifiedWindows: { "five hour]\n[console": { utilization: 0.9 } } },
      { rateLimitType: "x".repeat(200), utilization: 0.9 },
    ]) {
      const events = await product([
        INIT,
        { type: "rate_limit_event", rate_limit_info: info },
        '{"type":"rate_limit_event","rate_limit_info":',
      ]).events();
      expect(
        events.some((event) => event.type === "usage"),
        JSON.stringify(info),
      ).toBe(false);
    }
  });

  it("bounds what it reads of the windows: so many, a share within one, a moment that is one", async () => {
    const many = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`window_${index}`, { utilization: 7 + index }]),
    );
    const events = await product([
      INIT,
      allowance({ unifiedWindows: { ...many, late: { utilization: 0.5, resetsAt: 9e99 } } }),
    ]).events();
    const usage = events.find((event) => event.type === "usage");
    expect(usage?.type === "usage" ? usage.windows.length : 0).toBe(8);
    // A window this driver does not know is no window of the plan's own: said, and kept apart.
    expect(usage?.type === "usage" ? usage.windows[0] : undefined).toEqual({
      name: "window 0",
      used: 1,
      resetsAt: undefined,
      apart: true,
    });
  });

  it("says that the agent cannot go on, and until when, where a turn ends on the usage limit", async () => {
    const events = await product([
      INIT,
      replay("m1"),
      LIMIT_SAID,
      allowance({ status: "rejected", unifiedWindows: undefined }),
      LIMIT_RESULT,
    ]).events();
    // The product's words once, as its error and never as what the agent said.
    expect(shown(events)).toEqual([
      ["status", "The product started."],
      ["error", LIMIT_WORDS],
    ]);
    expect(words(events)).toEqual([
      { type: "conversation", id: CONVERSATION },
      { type: "taken" },
      { type: "cannot_go_on", state: "failed", reason: "usage_limit", until: RESETS * 1000 },
      { type: "ended", how: "exited" },
    ]);
  });

  it("reads the limit from the result alone, by the product's typed word or by its words", async () => {
    const typed = await product([
      INIT,
      replay("m1"),
      { ...LIMIT_RESULT, result: "The request was refused.", api_error: "usage_limit_reached" },
    ]).events();
    expect(typed).toContainEqual({
      type: "cannot_go_on",
      state: "failed",
      reason: "usage_limit",
      until: undefined,
    });
    expect(shown(typed).at(-1)).toEqual(["error", "The request was refused."]);
    const worded = await product([INIT, replay("m1"), LIMIT_RESULT]).events();
    expect(worded).toContainEqual({
      type: "cannot_go_on",
      state: "failed",
      reason: "usage_limit",
      until: undefined,
    });
    expect(worded.some((event) => event.type === "turn_completed")).toBe(false);
  });

  it("takes the moment a refused request named where the limit's own line names none", async () => {
    const events = await product([
      INIT,
      replay("m1"),
      { ...LIMIT_SAID, api_error_params: undefined },
      allowance({ status: "rejected", resetsAt: WEEK, unifiedWindows: undefined }),
      LIMIT_RESULT,
    ]).events();
    expect(events).toContainEqual({
      type: "cannot_go_on",
      state: "failed",
      reason: "usage_limit",
      until: WEEK * 1000,
    });
  });

  it("takes no other error for the limit: a throttle, a turn that failed, what the agent wrote", async () => {
    for (const lines of [
      // The server throttled a request for a moment, and the turn ended on it.
      [
        {
          ...LIMIT_SAID,
          api_error: undefined,
          api_error_params: undefined,
          message: {
            role: "assistant",
            content: [{ type: "text", text: "API Error: Rate limit reached" }],
          },
        },
        { ...LIMIT_RESULT, result: "API Error: Rate limit reached" },
      ],
      // The agent's own words about a limit, in a turn that completed.
      [says("You've hit your 5-hour limit, the page said."), RESULT],
      // A turn that was stopped says it is an error, and is none.
      [{ ...LIMIT_RESULT, terminal_reason: "aborted_streaming" }],
    ]) {
      const events = await product([INIT, replay("m1"), ...lines]).events();
      expect(events.some((event) => event.type === "cannot_go_on")).toBe(false);
      expect(events).toContainEqual({ type: "turn_completed" });
    }
  });

  it("leaves a sub-agent's limit to the turn of the session, which ends on it too", async () => {
    const events = await product([
      INIT,
      replay("m1"),
      { ...LIMIT_SAID, parent_tool_use_id: "toolu_01" },
      LIMIT_SAID,
      LIMIT_RESULT,
    ]).events();
    expect(shown(events).slice(1)).toEqual([
      ["assistant", LIMIT_WORDS],
      ["error", LIMIT_WORDS],
    ]);
    expect(events.filter((event) => event.type === "cannot_go_on")).toHaveLength(1);
  });

  it("forgets a limit once its turn ended: the next turn's error is its own", async () => {
    const events = await product(
      [
        INIT,
        replay("m1"),
        LIMIT_SAID,
        LIMIT_RESULT,
        replay("m2"),
        says("Back."),
        { ...RESULT, is_error: true, result: "The turn ended with an error." },
      ],
      2,
    ).events();
    expect(events.filter((event) => event.type === "cannot_go_on")).toHaveLength(1);
    expect(events.at(-2)).toEqual({ type: "turn_completed" });
  });

  it("says a limit again for a message the product still had on its input", async () => {
    const events = await product(
      [INIT, replay("m1"), LIMIT_SAID, LIMIT_RESULT, replay("m2"), LIMIT_SAID, LIMIT_RESULT],
      2,
    ).events();
    expect(words(events).map((event) => event.type)).toEqual([
      "conversation",
      "taken",
      "cannot_go_on",
      "taken",
      "cannot_go_on",
      "ended",
    ]);
  });
});
