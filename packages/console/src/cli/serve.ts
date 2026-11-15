import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, join, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { FetchLike } from "../client.js";
import { isLfsPointer, MAX_LFS_POINTER_BYTES } from "../records.js";
import type { WebRoot } from "../web.js";

// A console of a person's own, served from their machine (ADR-0014): the files of a build, and
// everything under /api/ carried to the organization's console with the token the command
// keeps. The page and the API share one origin on the loopback, so the page needs no token and
// the organization's console no allowance: it sees a token's requests, as it sees the command's.
// Beside them, where the command is told of one, the records of a desk under /records/
// (ADR-0117): the files a desk keeps of what its member made, for the desk's pages to show.

/** Where the command listens when nothing is said: next to the api role's 11199 and the dev UI's 11198. */
export const DEFAULT_SERVE_PORT = 11197;

/** The one address the command listens on. */
export const LOOPBACK = "127.0.0.1";

export interface ServeOptions {
  /** The origin of the organization's console, where the API is. */
  readonly upstream: string;
  /** The token the requests are carried with: the person's standing, never given to the page. */
  readonly token: string;
  readonly fetch: FetchLike;
  /** The port the command listens on: what a request's host must name. */
  readonly port: number;
  /** The build to serve, or none: then only the API is here, for a development server to send it to. */
  readonly web?: WebRoot | undefined;
  /** The records of a desk to serve under `/records/`, or none: then nothing is there. */
  readonly records?: RecordsRoot | undefined;
}

export type ServeHandler = (request: Request) => Promise<Response>;

/** Headers that belong to one connection and never travel over the next. */
const HOP_BY_HOP: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * What of the browser's request does not go to the console as it came: the loopback's host,
 * anything of a session (the token is the credential), what names the page (a token's request
 * needs none, but for the referrer's origin, below), and the encodings the browser takes, since
 * what comes back is passed on decoded.
 */
const NOT_FORWARDED: ReadonlySet<string> = new Set([
  "host",
  "cookie",
  "authorization",
  "origin",
  "referer",
  "accept-encoding",
]);

/** What of the console's answer does not go to the browser: a cookie would be the loopback's, and the body arrives decoded. */
const NOT_ANSWERED: ReadonlySet<string> = new Set([
  "set-cookie",
  "content-encoding",
  "content-length",
]);

/** An origin on this machine: the loopback by any of its names, on any port. */
const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

/**
 * The origin of the page a request comes from, when that page is on this machine (ADR-0083): the
 * console reads it to know which page may embed a plugin's frame, and allows the loopback's.
 * Nothing else of the referrer travels, its path least of all, nor a page anywhere else.
 */
function loopbackReferrer(request: Request): string | undefined {
  const referer = request.headers.get("referer");
  if (referer === null || !URL.canParse(referer)) {
    return undefined;
  }
  const { origin } = new URL(referer);
  return LOOPBACK_ORIGIN.test(origin) ? `${origin}/` : undefined;
}

const json = (status: number, code: string, message: string): Response =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const plain = (status: number, message: string): Response =>
  new Response(`${message}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * Whether a request to the API comes from the console's own page, or from no page at all.
 * Browsers say which site a request comes from, and one from another site is that site's
 * request made with the person's standing: refused. A browser too old to say names the page's
 * origin on a request that changes something, which is compared instead. A request that says
 * nothing of either is not a browser's.
 */
function fromOwnPage(request: Request, origin: string): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) {
    return site === "same-origin" || site === "none";
  }
  const from = request.headers.get("origin");
  return from === null || from === origin;
}

async function forward(
  request: Request,
  url: URL,
  upstream: string,
  options: ServeOptions,
): Promise<Response> {
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name) && !NOT_FORWARDED.has(name) && !name.startsWith("sec-")) {
      headers.set(name, value);
    }
  });
  headers.set("authorization", `Bearer ${options.token}`);
  headers.set("accept-encoding", "identity");
  const referrer = loopbackReferrer(request);
  if (referrer !== undefined) {
    headers.set("referer", referrer);
  }
  const withBody = request.method !== "GET" && request.method !== "HEAD";
  let answer: Response;
  try {
    answer = await options.fetch(`${upstream}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: withBody ? request.body : undefined,
      redirect: "manual",
      signal: request.signal,
      // A streamed body has to be declared as such.
      ...(withBody ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch {
    return json(502, "network", "The console could not be reached.");
  }
  const out = new Headers();
  answer.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name) && !NOT_ANSWERED.has(name)) {
      out.set(name, value);
    }
  });
  return new Response(answer.body, { status: answer.status, headers: out });
}

/** What a desk's records are served under, beside the build and the API (ADR-0117). */
export const RECORDS_PREFIX = "/records";

/**
 * What a page shows in place, by its extension: the records' own JSON, a picture, a video, a
 * sound and a PDF, each under its own content type. An SVG is not among them: a picture that
 * may carry a script is answered as a picture and as a download at once, under a policy that
 * runs nothing, so that a page shows it and nothing opens it as a document of the pages'
 * origin. Anything else is handed over as a download.
 */
const SHOWN_IN_PLACE: Readonly<Record<string, string>> = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
};

export class RecordsRootError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "RecordsRootError";
  }
}

export interface RecordsRoot {
  /** Whether the directory is there now: a desk keeps nothing until its member asks (ADR-0122). */
  there(): Promise<boolean>;
  /** The file a request under `/records/` asks for, or the refusal that says why not. */
  respond(request: Request): Promise<Response>;
}

/** A file's name as a download is called by it, in the one spelling every browser reads. */
function downloadAs(name: string): string {
  const spelled = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${spelled}`;
}

/**
 * The part of a file a request asks for: one range of bytes, as a player asks for a video from
 * where it is looked at. Nothing for a request that names none, several, or another unit, which
 * is answered with the whole file; `null` for a range the file does not have.
 */
function rangeOf(
  header: string | null,
  size: number,
): { readonly start: number; readonly end: number } | undefined | null {
  const found = header === null ? null : /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (found === null) {
    return undefined;
  }
  const [, from = "", to = ""] = found;
  if (from === "") {
    // The last bytes of the file, as many as are asked for.
    const length = Number(to);
    if (to === "") {
      return undefined;
    }
    return length === 0 || size === 0 ? null : { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) {
    return null;
  }
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return end < start ? undefined : { start, end };
}

/**
 * The records of a desk, served to the desk's pages (ADR-0117): every file read when it is
 * asked for, so that a record an agent just wrote is what the page shows, and never kept by the
 * browser. `GET` alone. A path names a file under the directory and nothing else: no part of it
 * is empty, `.` or `..`, begins with a full stop, ends with one or with a space, or holds what
 * a file system reads as more than a name; a link that leads out of the directory leads
 * nowhere; a folder is not listed. A file that is a git LFS pointer is refused by name, since
 * what would be shown is not the file.
 *
 * A directory that is not there yet is no error (ADR-0122): a desk has its `records/` once it
 * keeps something, and its pages are served before that. Such a directory holds nothing, and
 * is looked for again at each request, so that the first thing kept is served with no restart.
 * What is there and is no directory is refused before anything is served.
 */
export async function loadRecordsRoot(directory: string): Promise<RecordsRoot> {
  /** The directory as it is now, links followed; nothing where it is not there yet. */
  const rootNow = async (): Promise<string | undefined> => {
    let root: string;
    try {
      root = await realpath(directory);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw new RecordsRootError(`${directory} cannot be read`, { cause: error });
    }
    if (!(await stat(root)).isDirectory()) {
      throw new RecordsRootError(`${directory} is there and is not a directory`);
    }
    return root;
  };
  // Said before anything is served: a file where the records are to be is a mistake to say now.
  await rootNow();
  /** The directory at the moment of a request: nothing where it is not one then, whatever it was. */
  const rootThen = (): Promise<string | undefined> => rootNow().catch(() => undefined);
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
  };
  const notFound = (): Response =>
    json(404, "records.not_found", "No file of the records is at this path.");

  const fileAt = async (root: string, pathname: string): Promise<string | undefined> => {
    const parts: string[] = [];
    for (const raw of pathname.slice(RECORDS_PREFIX.length + 1).split("/")) {
      let part: string;
      try {
        part = decodeURIComponent(raw);
      } catch {
        return undefined;
      }
      if (
        part.length === 0 ||
        part.startsWith(".") ||
        part.endsWith(".") ||
        part.trim() !== part ||
        /[\\/:*?"<>|]/.test(part) ||
        [...part].some((character) => (character.codePointAt(0) ?? 0) < 0x20)
      ) {
        return undefined;
      }
      parts.push(part);
    }
    try {
      // Where the path leads, links followed: a file inside the directory, or nothing.
      const file = await realpath(join(root, ...parts));
      return file.startsWith(`${root}${sep}`) ? file : undefined;
    } catch {
      return undefined;
    }
  };

  const respond = async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      const refused = json(405, "records.read_only", "The records are read here, and only read.");
      refused.headers.set("allow", "GET");
      return refused;
    }
    const { pathname } = new URL(request.url);
    const root = await rootThen();
    const file =
      root !== undefined && pathname.startsWith(`${RECORDS_PREFIX}/`)
        ? await fileAt(root, pathname)
        : undefined;
    if (file === undefined) {
      return notFound();
    }
    let size: number;
    try {
      const info = await stat(file);
      if (!info.isFile()) {
        return notFound();
      }
      size = info.size;
    } catch {
      return notFound();
    }
    if (size <= MAX_LFS_POINTER_BYTES && isLfsPointer(await readFile(file, "utf8"))) {
      return json(
        409,
        "records.not_fetched",
        "This file is a git LFS pointer: the file itself was not fetched on this machine. git lfs pull in the desk fetches it.",
      );
    }
    const kind = extname(file).toLowerCase();
    const shown = SHOWN_IN_PLACE[kind];
    const said: Record<string, string> = {
      ...headers,
      "accept-ranges": "bytes",
      ...(shown !== undefined
        ? { "content-type": shown }
        : kind === ".svg"
          ? {
              "content-type": "image/svg+xml",
              "content-disposition": downloadAs(basename(file)),
              "content-security-policy": "sandbox",
            }
          : {
              "content-type": "application/octet-stream",
              "content-disposition": downloadAs(basename(file)),
            }),
    };
    const range = rangeOf(request.headers.get("range"), size);
    if (range === null) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, "content-range": `bytes */${size}` },
      });
    }
    if (size === 0) {
      return new Response(null, { status: 200, headers: { ...said, "content-length": "0" } });
    }
    const { start, end } = range ?? { start: 0, end: size - 1 };
    return new Response(
      Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream,
      {
        status: range === undefined ? 200 : 206,
        headers: {
          ...said,
          "content-length": String(end - start + 1),
          ...(range === undefined ? {} : { "content-range": `bytes ${start}-${end}/${size}` }),
        },
      },
    );
  };
  return { there: async () => (await rootThen()) !== undefined, respond };
}

/**
 * What the command answers: the API carried to the console with the token, for the page's own
 * requests; a desk's records under `/records/`, for the same pages and no other site's; the
 * build's files and its page for everything else, when there is a build; and nothing to a
 * request whose host is not this loopback, which is a page elsewhere whose name was made to
 * resolve here.
 */
export function createServeHandler(options: ServeOptions): ServeHandler {
  const hosts = new Set([
    `${LOOPBACK}:${options.port}`,
    `localhost:${options.port}`,
    `[::1]:${options.port}`,
  ]);
  const upstream = new URL(options.upstream).origin;
  return async (request) => {
    const url = new URL(request.url);
    if (!hosts.has(url.host)) {
      return plain(421, "This address is not the console's.");
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (!fromOwnPage(request, `http://${url.host}`)) {
        return json(
          403,
          "auth.forbidden_origin",
          "This request must come from the console's own pages.",
        );
      }
      return forward(request, url, upstream, options);
    }
    // A desk's records, or the word that none are served: never the build's page, which a
    // page that asked for a file would take for one.
    if (url.pathname === RECORDS_PREFIX || url.pathname.startsWith(`${RECORDS_PREFIX}/`)) {
      if (!fromOwnPage(request, `http://${url.host}`)) {
        return json(
          403,
          "auth.forbidden_origin",
          "This request must come from the console's own pages.",
        );
      }
      return options.records === undefined
        ? json(
            404,
            "records.not_served",
            "No records are served here. console serve --records <dir> serves a desk's.",
          )
        : options.records.respond(request);
    }
    if (options.web !== undefined) {
      const answer = await options.web.respond(request);
      if (answer !== undefined) {
        return answer;
      }
    }
    return plain(
      404,
      options.web === undefined
        ? "Nothing is served here but the API, under /api/."
        : "Nothing here.",
    );
  };
}

export interface Listening {
  /** Where the command listens, for a person to open. */
  readonly url: string;
  /** Settled once the listener has closed. */
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

/** How the command listens: given the port it was bound, the handler to answer with. */
export type Listen = (
  handlerFor: (port: number) => ServeHandler,
  port: number,
) => Promise<Listening>;

async function answer(
  handler: ServeHandler,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // A browser that goes away takes its request with it, a stream of events included.
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) {
      controller.abort();
    }
  });
  const method = req.method ?? "GET";
  const withBody = method !== "GET" && method !== "HEAD";
  let request: Request;
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const each of value) {
          headers.append(name, each);
        }
      } else if (value !== undefined) {
        headers.set(name, value);
      }
    }
    request = new Request(`http://${req.headers.host ?? LOOPBACK}${req.url ?? "/"}`, {
      method,
      headers,
      body: withBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
      signal: controller.signal,
      ...(withBody ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("The request was not understood.\n");
    return;
  }
  let response: Response;
  try {
    response = await handler(request);
  } catch {
    response = plain(500, "Something went wrong.");
  }
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });
  if (response.body === null || method === "HEAD") {
    res.end();
    return;
  }
  try {
    await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), res);
  } catch {
    // The browser went away before the answer ended: nothing is owed to it.
    res.destroy();
  }
}

/** Listens on the loopback, and only there, and answers every request through the handler. */
export const listenOn: Listen = (handlerFor, port) =>
  new Promise((resolve, reject) => {
    let handler: ServeHandler | undefined;
    const server = createServer((req, res) => {
      void answer(handler ?? (() => Promise.resolve(plain(503, "Not ready."))), req, res);
    });
    server.once("error", reject);
    server.listen(port, LOOPBACK, () => {
      server.off("error", reject);
      const address = server.address();
      const bound = typeof address === "object" && address !== null ? address.port : port;
      handler = handlerFor(bound);
      const closed = new Promise<void>((done) => {
        server.once("close", () => done());
      });
      resolve({
        url: `http://${LOOPBACK}:${bound}/`,
        closed,
        close: () =>
          new Promise<void>((done, fail) => {
            server.closeAllConnections();
            server.close((error) => (error === undefined ? done() : fail(error)));
          }),
      });
    });
  });
