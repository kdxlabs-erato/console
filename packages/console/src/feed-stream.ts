import { STREAM_RETRY_MOST_MS, STREAM_RETRY_MS, type StreamSource } from "./agent-stream.js";
import { ApiError, EVENT_KINDS, type RestEvent, restEventSchema } from "./api.js";

// How a project's page follows its board: the feed is read as it stands, and what happens
// after arrives by a stream, numbered, which the console begins after the event it is told. A
// browser opens a stream again by itself after it was cut, and gives it up for good once it is
// answered something that is no stream, a gateway's error while the console restarts say. The
// stream is then opened again here, after the last event read, so that a board a person keeps
// open does not stand still for good without a word; the console sends what happened while it
// was away. As an agent's conversation is followed (`agent-stream.ts`). No React here: the
// page hands in what it does with what arrives, and a test drives it with a stream of its own.

/** `EventSource.CLOSED`: the browser gave the stream up and opens it no more. */
const CLOSED = 2;

/** How long a read of the feed waits before it asks again, where the console could not say where the feed stands. */
export const FEED_UNSETTLED_RETRY_MS = 1_000;
/** How many times such a read asks before it gives the refusal to whoever asked. */
export const FEED_UNSETTLED_TRIES = 10;

/**
 * A read of the feed, asked again while the console answers that it cannot be read yet
 * (`feed.unsettled`, a 503): a process of the console that has not seen the feed settle since
 * it began, while a change is still under way, cannot say where the feed stands, and says so in
 * place of an empty page. An empty page would be a board on which nothing ever happened, and the
 * page's stream would go on from the beginning and be sent the whole history. It is over within a
 * moment: the change ends, or another process answers. Any other refusal is whoever asked's at
 * once, and so is this one after `FEED_UNSETTLED_TRIES`.
 */
export async function whileFeedSettles<T>(
  read: () => Promise<T>,
  options: {
    readonly signal?: AbortSignal | undefined;
    /** How a wait is made: a timer where left out. */
    readonly sleep?: ((milliseconds: number) => Promise<void>) | undefined;
  } = {},
): Promise<T> {
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let asked = 1; ; asked += 1) {
    try {
      return await read();
    } catch (failure) {
      const unsettled = failure instanceof ApiError && failure.code === "feed.unsettled";
      if (!unsettled || asked >= FEED_UNSETTLED_TRIES || options.signal?.aborted === true) {
        throw failure;
      }
    }
    await sleep(FEED_UNSETTLED_RETRY_MS);
  }
}

export interface FollowFeedOptions {
  /** Where the stream is, for what happens after an event's number. */
  readonly url: (after: number) => string;
  /** The number of the last event read: the stream begins after it. */
  readonly after: number;
  /** An event not handed over before, in the order they were numbered. */
  readonly onEvent: (event: RestEvent) => void;
  /** Whether the stream is open, said each time it opens and each time it is lost. */
  readonly onLive: (live: boolean) => void;
  /** What opens a stream: the browser's `EventSource` where left out, and no stream where there is none. */
  readonly EventSource?: (new (url: string) => StreamSource) | undefined;
}

/**
 * Follows a project's feed until the function it answers is called: opens the stream after the
 * last event read, and opens it again from there whenever the browser gave it up, a few seconds
 * later and further apart while the console does not answer.
 */
export function followFeed(options: FollowFeedOptions): () => void {
  const Source =
    options.EventSource ??
    (typeof EventSource === "undefined"
      ? undefined
      : (EventSource as unknown as new (
          url: string,
        ) => StreamSource));
  if (Source === undefined) {
    return () => undefined;
  }
  let stopped = false;
  let last = options.after;
  let source: StreamSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let wait = STREAM_RETRY_MS;

  const arrived = (message: { readonly data: unknown }): void => {
    let parsed: ReturnType<typeof restEventSchema.safeParse>;
    try {
      parsed = restEventSchema.safeParse(JSON.parse(String(message.data)));
    } catch {
      // What does not read as an event is left out.
      return;
    }
    if (!parsed.success || parsed.data.id <= last) {
      return;
    }
    last = parsed.data.id;
    options.onEvent(parsed.data);
  };
  const open = (): void => {
    const stream = new Source(options.url(last));
    source = stream;
    stream.onopen = () => {
      if (stopped || source !== stream) {
        return;
      }
      wait = STREAM_RETRY_MS;
      options.onLive(true);
    };
    stream.onerror = () => {
      if (stopped || source !== stream) {
        return;
      }
      options.onLive(false);
      if (stream.readyState !== CLOSED) {
        // The browser is opening it again by itself, and says where it was.
        return;
      }
      // The browser opens it no more: it is opened again here, after the last event read.
      stream.close();
      source = undefined;
      retry = setTimeout(() => {
        retry = undefined;
        if (!stopped) {
          open();
        }
      }, wait);
      wait = Math.min(wait * 2, STREAM_RETRY_MOST_MS);
    };
    for (const kind of EVENT_KINDS) {
      stream.addEventListener(kind, arrived);
    }
  };
  open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    source?.close();
    source = undefined;
  };
}
