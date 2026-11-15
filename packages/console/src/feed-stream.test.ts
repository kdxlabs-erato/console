import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STREAM_RETRY_MOST_MS, STREAM_RETRY_MS } from "./agent-stream.js";
import type { RestEvent } from "./api.js";
import { followFeed } from "./feed-stream.js";

const PROJECT = "0199c4d8-0000-7000-8000-0000000000b1";

const event = (id: number): RestEvent => ({
  id,
  kind: "task.created",
  createdAt: `2026-11-14T03:00:${String(id % 60).padStart(2, "0")}.000Z`,
  projectId: PROJECT,
  taskId: null,
  runId: null,
  decisionId: null,
  documentId: null,
  goalId: null,
  actor: null,
  agent: null,
  plugin: null,
  data: {},
});

/** A stream as a browser has one, driven by the test: opened, sent an event, failed, closed for good. */
class FakeSource {
  static made: FakeSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readonly listeners = new Map<string, (message: { data: unknown }) => void>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSource.made.push(this);
  }
  addEventListener(name: string, listener: (message: { data: unknown }) => void): void {
    this.listeners.set(name, listener);
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
  opens(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  /** The browser lost the stream and is opening it again by itself. */
  drops(): void {
    this.readyState = 0;
    this.onerror?.();
  }
  /** The browser gave the stream up: an answer that is no stream, a 502 while the console restarts. */
  givesUp(): void {
    this.readyState = 2;
    this.onerror?.();
  }
  sends(name: string, data: unknown): void {
    this.listeners.get(name)?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
}

const latest = (): FakeSource => {
  const source = FakeSource.made.at(-1);
  if (source === undefined) {
    throw new Error("no stream was opened");
  }
  return source;
};

describe("the board's stream", () => {
  let events: number[];
  let live: boolean[];
  let stop: () => void;

  const follow = (after = 7) => {
    stop = followFeed({
      url: (from) => `/api/v1/projects/website/events/stream?after=${from}`,
      after,
      onEvent: (one) => events.push(one.id),
      onLive: (now) => live.push(now),
      EventSource: FakeSource,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSource.made = [];
    events = [];
    live = [];
    stop = () => undefined;
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("opens after the last event read, and hands over what arrives, once and in order", () => {
    follow(7);
    expect(FakeSource.made).toHaveLength(1);
    expect(latest().url).toBe("/api/v1/projects/website/events/stream?after=7");
    latest().opens();
    expect(live).toEqual([true]);
    latest().sends("task.created", event(8));
    latest().sends("task.created", event(9));
    // An event sent again, or one before the last, is not handed over twice.
    latest().sends("task.created", event(9));
    latest().sends("task.created", event(3));
    expect(events).toEqual([8, 9]);
  });

  it("leaves a stream the browser is opening again to the browser", () => {
    follow();
    latest().opens();
    latest().drops();
    expect(live).toEqual([true, false]);
    vi.advanceTimersByTime(STREAM_RETRY_MOST_MS * 2);
    expect(FakeSource.made).toHaveLength(1);
    latest().opens();
    expect(live).toEqual([true, false, true]);
  });

  it("opens the stream again, from the last event read, once the browser gave it up", () => {
    follow(7);
    latest().opens();
    latest().sends("task.created", event(8));
    // The console restarts: the gateway answers what is no stream, and the browser stops.
    const first = latest();
    first.givesUp();
    expect(live).toEqual([true, false]);
    expect(first.closed).toBe(true);
    vi.advanceTimersByTime(STREAM_RETRY_MS - 1);
    expect(FakeSource.made).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSource.made).toHaveLength(2);
    // From where it was, so that what happened while it was away arrives.
    expect(latest().url).toBe("/api/v1/projects/website/events/stream?after=8");
    latest().opens();
    latest().sends("task.created", event(9));
    expect(live).toEqual([true, false, true]);
    expect(events).toEqual([8, 9]);
  });

  it("tries further apart while the console does not answer, and as soon again once it did", () => {
    follow();
    latest().givesUp();
    vi.advanceTimersByTime(STREAM_RETRY_MS);
    expect(FakeSource.made).toHaveLength(2);
    latest().givesUp();
    vi.advanceTimersByTime(STREAM_RETRY_MS);
    expect(FakeSource.made).toHaveLength(2);
    vi.advanceTimersByTime(STREAM_RETRY_MS);
    expect(FakeSource.made).toHaveLength(3);
    // Never further apart than the longest wait.
    for (let tries = 0; tries < 8; tries += 1) {
      latest().givesUp();
      vi.advanceTimersByTime(STREAM_RETRY_MOST_MS);
    }
    expect(FakeSource.made).toHaveLength(11);
    latest().opens();
    latest().givesUp();
    vi.advanceTimersByTime(STREAM_RETRY_MS);
    expect(FakeSource.made).toHaveLength(12);
  });

  it("leaves out what does not read as an event", () => {
    follow(7);
    latest().opens();
    latest().sends("task.created", "{not json");
    latest().sends("task.created", { id: "nine" });
    latest().sends("task.created", { ...event(9), kind: "no.such.kind" });
    latest().sends("task.created", event(10));
    expect(events).toEqual([10]);
  });

  it("opens nothing again once it is stopped, and none where a browser has no stream", () => {
    follow();
    const first = latest();
    first.givesUp();
    stop();
    vi.advanceTimersByTime(STREAM_RETRY_MOST_MS * 2);
    expect(FakeSource.made).toHaveLength(1);
    expect(first.closed).toBe(true);

    FakeSource.made = [];
    const end = followFeed({
      url: () => "/stream",
      after: 0,
      onEvent: () => undefined,
      onLive: (now) => live.push(now),
      EventSource: undefined,
    });
    expect(FakeSource.made).toHaveLength(0);
    end();
  });
});
