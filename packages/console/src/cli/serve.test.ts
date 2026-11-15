import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FetchLike } from "../client.js";
import { loadWebRoot, type WebRoot } from "../web.js";
import {
  createServeHandler,
  listenOn,
  loadRecordsRoot,
  type RecordsRoot,
  RecordsRootError,
  type ServeHandler,
} from "./serve.js";

const UPSTREAM = "https://console.test";
const TOKEN = "cns_t_secret";
const PORT = 11197;
const AT = `http://127.0.0.1:${PORT}`;
const ME = { workspace: { name: "Acme" }, person: { login: "alice" }, agent: "my console" };

let dir: string;
let web: WebRoot;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "console-serve-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Mine</title><div id=root></div>");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "index-abc123.js"), "console.log(1)");
  web = await loadWebRoot(dir);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
  readonly headers: Headers;
  readonly body: string;
}

/** The organization's console, as far as the command sees it: what was asked, and a few answers. */
function fakeConsole() {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const body = init?.body === undefined ? "" : await new Response(init.body as BodyInit).text();
    calls.push({ url, init, headers: new Headers(init?.headers), body });
    const path = new URL(url).pathname;
    if (path === "/api/v1/me") {
      return new Response(JSON.stringify(ME), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    if (path.endsWith("/events/stream")) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("event: hello\n\n"));
          controller.enqueue(encoder.encode("data: 1\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream", "content-encoding": "gzip" },
      });
    }
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ got: JSON.parse(body) }), {
        status: 201,
        headers: { "content-type": "application/json", "set-cookie": "nope=1" },
      });
    }
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Nothing." } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch, calls };
}

function handlerWith(fetch: FetchLike, withBuild = true): ServeHandler {
  return createServeHandler({
    upstream: `${UPSTREAM}/`,
    token: TOKEN,
    fetch,
    port: PORT,
    web: withBuild ? web : undefined,
  });
}

const fromPage = { "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" };

describe("console serve", () => {
  it("carries the API to the console with the token, and nothing of the browser's session", async () => {
    const { fetch, calls } = fakeConsole();
    const handler = handlerWith(fetch);
    const answer = await handler(
      new Request(`${AT}/api/v1/me?x=1`, {
        headers: {
          ...fromPage,
          cookie: "console_session=cns_s_browser",
          authorization: "Bearer cns_t_wrong",
          referer: `${AT}/projects/web`,
          accept: "application/json",
          "accept-encoding": "gzip, br",
          "accept-language": "ko",
        },
      }),
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual(ME);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe(`${UPSTREAM}/api/v1/me?x=1`);
    expect(call?.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(call?.headers.get("accept-encoding")).toBe("identity");
    expect(call?.headers.get("accept")).toBe("application/json");
    expect(call?.headers.get("accept-language")).toBe("ko");
    for (const name of ["cookie", "sec-fetch-site", "sec-fetch-mode", "host"]) {
      expect(call?.headers.get(name), name).toBeNull();
    }
    // Of the referrer, the page's origin alone: the console reads it for a plugin's frame.
    expect(call?.headers.get("referer")).toBe(`${AT}/`);
  });

  it("names the page a plugin's frame is embedded in by its origin on this machine, and no page elsewhere (ADR-0083)", async () => {
    const { fetch, calls } = fakeConsole();
    const handler = handlerWith(fetch);
    const frame = "/api/v1/plugins/hr/frame?widget=balance";
    const sent = async (referer: string) => {
      await handler(new Request(`${AT}${frame}`, { headers: { ...fromPage, referer } }));
      return calls.at(-1)?.headers.get("referer") ?? null;
    };
    // The command's own page, and a development server's on this machine sending it the API.
    expect(await sent(`${AT}/`)).toBe(`${AT}/`);
    expect(await sent("http://localhost:11198/projects?x=1#y")).toBe("http://localhost:11198/");
    expect(await sent("http://[::1]:5173/")).toBe("http://[::1]:5173/");
    // Anywhere else, or not an address: nothing.
    expect(await sent("https://console.test/")).toBeNull();
    expect(await sent("http://localhost.evil.example/")).toBeNull();
    expect(await sent("not an address")).toBeNull();
  });

  it("passes a body through, and an answer as it streams, without the loopback's cookies", async () => {
    const { fetch, calls } = fakeConsole();
    const handler = handlerWith(fetch);
    const made = await handler(
      new Request(`${AT}/api/v1/projects/web/tasks`, {
        method: "POST",
        headers: { ...fromPage, "content-type": "application/json" },
        body: JSON.stringify({ title: "From my own console" }),
      }),
    );
    expect(made.status).toBe(201);
    expect(await made.json()).toEqual({ got: { title: "From my own console" } });
    expect(made.headers.get("set-cookie")).toBeNull();
    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.init?.method).toBe("POST");

    const stream = await handler(
      new Request(`${AT}/api/v1/projects/web/events/stream?after=0`, { headers: fromPage }),
    );
    expect(stream.headers.get("content-type")).toBe("text/event-stream");
    expect(stream.headers.get("content-encoding")).toBeNull();
    expect(await stream.text()).toBe("event: hello\n\ndata: 1\n\n");
  });

  it("refuses another site's page, and another name for this machine", async () => {
    const { fetch, calls } = fakeConsole();
    const handler = handlerWith(fetch);
    const refused = async (init: RequestInit, host = `127.0.0.1:${PORT}`) =>
      handler(new Request(`http://${host}/api/v1/me`, init));
    // A page of another site, with the person's standing: no.
    expect((await refused({ headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect(
      (await refused({ headers: { "sec-fetch-site": "same-site" }, method: "POST" })).status,
    ).toBe(403);
    // A browser too old to say which site, naming another origin: no.
    expect((await refused({ headers: { origin: "http://evil.example" } })).status).toBe(403);
    // A name made to resolve here: no, whatever it asks.
    const elsewhere = await refused({ headers: fromPage }, `evil.example:${PORT}`);
    expect(elsewhere.status).toBe(421);
    expect(calls).toHaveLength(0);
    // The person's own page, a request typed into the browser, a program with no page at all,
    // and the loopback by its other name: yes.
    expect((await refused({ headers: fromPage })).status).toBe(200);
    expect((await refused({ headers: { "sec-fetch-site": "none" } })).status).toBe(200);
    expect((await refused({})).status).toBe(200);
    expect((await refused({ headers: fromPage }, `localhost:${PORT}`)).status).toBe(200);
    expect(calls).toHaveLength(4);
  });

  it("serves the build's page and files beside the API, and nothing without a build", async () => {
    const { fetch } = fakeConsole();
    const handler = handlerWith(fetch);
    const page = await handler(new Request(`${AT}/projects/web/tasks/7`));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("content-security-policy")).toContain("connect-src 'self'");
    expect(await page.text()).toContain("<title>Mine</title>");
    const script = await handler(new Request(`${AT}/assets/index-abc123.js`));
    expect(script.status).toBe(200);
    expect(script.headers.get("cache-control")).toContain("immutable");
    // Signing in is the organization's console's, not here.
    expect((await handler(new Request(`${AT}/auth/gh/login`))).status).toBe(404);

    const bare = handlerWith(fetch, false);
    const nothing = await bare(new Request(`${AT}/`));
    expect(nothing.status).toBe(404);
    expect(await nothing.text()).toContain("Nothing is served here but the API");
    expect((await bare(new Request(`${AT}/api/v1/me`, { headers: fromPage }))).status).toBe(200);
  });

  it("listens on the loopback, and answers over HTTP what the handler answers", async () => {
    const { fetch, calls } = fakeConsole();
    const listening = await listenOn(
      (port) => createServeHandler({ upstream: UPSTREAM, token: TOKEN, fetch, port, web }),
      0,
    );
    try {
      expect(listening.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      const page = await globalThis.fetch(listening.url);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("<title>Mine</title>");
      const me = await globalThis.fetch(`${listening.url}api/v1/me`);
      expect(me.status).toBe(200);
      expect(await me.json()).toEqual(ME);
      expect(calls[0]?.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
      const made = await globalThis.fetch(`${listening.url}api/v1/projects/web/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Over the wire" }),
      });
      expect(made.status).toBe(201);
      expect(await made.json()).toEqual({ got: { title: "Over the wire" } });
      const head = await globalThis.fetch(listening.url, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      // A name made to resolve here, as a browser would send it: refused on the wire too.
      const elsewhere = await new Promise<number>((resolve, reject) => {
        const url = new URL(`${listening.url}api/v1/me`);
        const sent = request(
          {
            host: url.hostname,
            port: url.port,
            path: url.pathname,
            headers: { host: "evil.example" },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        sent.on("error", reject);
        sent.end();
      });
      expect(elsewhere).toBe(421);
    } finally {
      await listening.close();
    }
    await listening.closed;
  });
});

describe("a desk's records, served beside the build (ADR-0117)", () => {
  const POINTER =
    "version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 480000000\n";
  /** A video's worth of bytes, each its place in the file, so that a part read back says where it is from. */
  const VIDEO = Uint8Array.from({ length: 100_000 }, (_, index) => index % 251);
  const KOREAN = `${String.fromCodePoint(0xad11, 0xace0)} (v2).pdf`;
  let desk: string;
  let records: RecordsRoot;
  let linked = false;

  beforeAll(async () => {
    desk = mkdtempSync(join(tmpdir(), "console-records-"));
    const root = join(desk, "records");
    const files = join(root, "ad-creatives", "files");
    mkdirSync(files, { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      '{"collections":[{"key":"ad-creatives","title":"Ad creatives"}]}',
    );
    writeFileSync(join(root, ".hidden.json"), "{}");
    writeFileSync(join(root, "README.md"), "# The records of this desk\n");
    writeFileSync(join(root, "ad-creatives", "items.json"), "[]");
    writeFileSync(join(root, "ad-creatives", ".keep"), "");
    writeFileSync(join(files, "c-001.png"), Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(files, "c-001.mp4"), VIDEO);
    writeFileSync(join(files, "voice.mp3"), "ID3");
    writeFileSync(join(files, "brief.pdf"), "%PDF-1.7");
    writeFileSync(join(files, KOREAN), "%PDF-1.7");
    writeFileSync(
      join(files, "mark.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    writeFileSync(join(files, "page.html"), "<script>alert(1)</script>");
    writeFileSync(join(files, "notes.txt"), "plain");
    writeFileSync(join(files, "empty.json"), "");
    writeFileSync(join(files, "big.mov"), POINTER);
    // What is beside the records is not the records': a file of the desk, and a way to it.
    writeFileSync(join(desk, "secret.json"), '{"secret":true}');
    mkdirSync(join(desk, "elsewhere"));
    writeFileSync(join(desk, "elsewhere", "secret.json"), '{"secret":true}');
    try {
      // A junction where the system has them, which asks no leave; a link elsewhere.
      symlinkSync(join(desk, "elsewhere"), join(root, "link"), "junction");
      linked = true;
    } catch {
      linked = false;
    }
    records = await loadRecordsRoot(root);
  });

  afterAll(() => {
    rmSync(desk, { recursive: true, force: true });
  });

  const served = (withRecords = true): ServeHandler =>
    createServeHandler({
      upstream: `${UPSTREAM}/`,
      token: TOKEN,
      fetch: fakeConsole().fetch,
      port: PORT,
      web,
      records: withRecords ? records : undefined,
    });
  const get = (path: string, headers: Record<string, string> = {}) =>
    served()(new Request(`${AT}${path}`, { headers: { ...fromPage, ...headers } }));

  it("reads a file when it is asked for, and has no browser keep it", async () => {
    const first = await get("/records/index.json");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(first.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(first.headers.get("content-disposition")).toBeNull();
    expect(await first.json()).toEqual({
      collections: [{ key: "ad-creatives", title: "Ad creatives" }],
    });
    // What an agent wrote a moment ago is what the page is shown.
    writeFileSync(join(desk, "records", "ad-creatives", "items.json"), '[{"id":"c-001"}]');
    expect(await (await get("/records/ad-creatives/items.json")).json()).toEqual([{ id: "c-001" }]);
    writeFileSync(join(desk, "records", "ad-creatives", "items.json"), "[]");
    expect(await (await get("/records/ad-creatives/items.json")).json()).toEqual([]);
    // A file that holds nothing is answered as it is.
    const empty = await get("/records/ad-creatives/files/empty.json");
    expect(empty.status).toBe(200);
    expect(empty.headers.get("content-length")).toBe("0");
    expect(await empty.text()).toBe("");
  });

  it("shows a picture, a video, a sound and a PDF in place by their kinds, and hands the rest over as a download", async () => {
    for (const [name, type] of [
      ["c-001.png", "image/png"],
      ["c-001.mp4", "video/mp4"],
      ["voice.mp3", "audio/mpeg"],
      ["brief.pdf", "application/pdf"],
    ] as const) {
      const answer = await get(`/records/ad-creatives/files/${name}`);
      expect(answer.status, name).toBe(200);
      expect(answer.headers.get("content-type"), name).toBe(type);
      expect(answer.headers.get("content-disposition"), name).toBeNull();
      expect(answer.headers.get("accept-ranges"), name).toBe("bytes");
      await answer.arrayBuffer();
    }
    // A name in any script, as an address spells it.
    const korean = await get(`/records/ad-creatives/files/${encodeURIComponent(KOREAN)}`);
    expect(korean.status).toBe(200);
    expect(korean.headers.get("content-type")).toBe("application/pdf");
    await korean.arrayBuffer();
    // A picture that may carry a script is a picture to a page and a download to whoever opens
    // it by itself, under a policy that runs nothing.
    const svg = await get("/records/ad-creatives/files/mark.svg");
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(svg.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''mark.svg");
    expect(svg.headers.get("content-security-policy")).toBe("sandbox");
    await svg.arrayBuffer();
    // Nothing a browser would run or lay out is answered as what it is.
    for (const name of ["page.html", "notes.txt"]) {
      const answer = await get(`/records/ad-creatives/files/${name}`);
      expect(answer.status, name).toBe(200);
      expect(answer.headers.get("content-type"), name).toBe("application/octet-stream");
      expect(answer.headers.get("content-disposition"), name).toBe(
        `attachment; filename*=UTF-8''${name}`,
      );
      expect(answer.headers.get("x-content-type-options"), name).toBe("nosniff");
      await answer.arrayBuffer();
    }
    const readme = await get("/records/README.md");
    expect(readme.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''README.md",
    );
    await readme.arrayBuffer();
  });

  it("answers a part of a file, so that a video plays from where it is looked at", async () => {
    const video = "/records/ad-creatives/files/c-001.mp4";
    const whole = await get(video);
    expect(whole.headers.get("content-length")).toBe(String(VIDEO.length));
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(VIDEO);
    const part = await get(video, { range: "bytes=1000-1999" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 1000-1999/${VIDEO.length}`);
    expect(part.headers.get("content-length")).toBe("1000");
    expect(part.headers.get("content-type")).toBe("video/mp4");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(VIDEO.slice(1000, 2000));
    // From a byte to the end, the last bytes, and an end past the file's.
    const rest = await get(video, { range: "bytes=99990-" });
    expect(rest.headers.get("content-range")).toBe(`bytes 99990-99999/${VIDEO.length}`);
    expect(new Uint8Array(await rest.arrayBuffer())).toEqual(VIDEO.slice(99_990));
    const last = await get(video, { range: "bytes=-5" });
    expect(last.headers.get("content-range")).toBe(`bytes 99995-99999/${VIDEO.length}`);
    expect(new Uint8Array(await last.arrayBuffer())).toEqual(VIDEO.slice(-5));
    const past = await get(video, { range: "bytes=99998-200000" });
    expect(past.headers.get("content-range")).toBe(`bytes 99998-99999/${VIDEO.length}`);
    await past.arrayBuffer();
    // A range the file does not have is said so; one the command does not read is the whole file.
    for (const none of ["bytes=100000-", "bytes=-0", "bytes=999999999999999999999-"]) {
      const refused = await get(video, { range: none });
      expect(refused.status, none).toBe(416);
      expect(refused.headers.get("content-range"), none).toBe(`bytes */${VIDEO.length}`);
    }
    for (const unread of ["bytes=0-9,20-29", "lines=1-2", "bytes=9-1", "bytes=-", "bytes=a-b"]) {
      const answer = await get(video, { range: unread });
      expect(answer.status, unread).toBe(200);
      expect(answer.headers.get("content-length"), unread).toBe(String(VIDEO.length));
      await answer.arrayBuffer();
    }
  });

  it("serves nothing outside the directory, no file whose name begins with a full stop, and lists nothing", async () => {
    for (const path of [
      "/records",
      "/records/",
      "/records/ad-creatives",
      "/records/ad-creatives/",
      "/records/ad-creatives/files",
      "/records/gone.json",
      "/records/.hidden.json",
      "/records/ad-creatives/.keep",
      "/records/..%2Fsecret.json",
      "/records/ad-creatives/..%2F..%2Fsecret.json",
      "/records/ad-creatives/..%5C..%5Csecret.json",
      "/records/%2E%2E%2Fsecret.json",
      "/records//index.json",
      "/records/index.json.",
      "/records/index.json%20",
      "/records/index.json%00",
      "/records/index.json:stream",
      "/records/%E0%A4%A.json",
      "/records/C:%5Csecret.json",
    ]) {
      const answer = await get(path);
      expect(answer.status, path).toBe(404);
      expect(await answer.json(), path).toEqual({
        error: { code: "records.not_found", message: "No file of the records is at this path." },
      });
      expect(answer.headers.get("cache-control"), path).toBe("no-store");
    }
    // A link that leads out of the directory leads nowhere, where the system let one be made.
    if (linked) {
      const out = await get("/records/link/secret.json");
      expect(out.status).toBe(404);
      expect(await out.json()).toMatchObject({ error: { code: "records.not_found" } });
    }
    // The records are read, and only read.
    for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
      const answer = await served()(
        new Request(`${AT}/records/index.json`, { method, headers: fromPage }),
      );
      expect(answer.status, method).toBe(405);
      expect(answer.headers.get("allow"), method).toBe("GET");
    }
    expect(JSON.parse(readFileSync(join(desk, "records", "index.json"), "utf8"))).toEqual({
      collections: [{ key: "ad-creatives", title: "Ad creatives" }],
    });
  });

  it("refuses by name a file that git LFS has not fetched on this machine", async () => {
    const answer = await get("/records/ad-creatives/files/big.mov");
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({
      error: {
        code: "records.not_fetched",
        message:
          "This file is a git LFS pointer: the file itself was not fetched on this machine. git lfs pull in the desk fetches it.",
      },
    });
  });

  it("answers the desk's own pages and no other site's, and only where records are served", async () => {
    const elsewhere = await served()(
      new Request(`${AT}/records/index.json`, { headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(elsewhere.status).toBe(403);
    expect(await elsewhere.json()).toMatchObject({ error: { code: "auth.forbidden_origin" } });
    const renamed = await served()(new Request("http://evil.example:11197/records/index.json"));
    expect(renamed.status).toBe(421);
    // An address typed by hand comes from no page, and is the person's own.
    const typed = await served()(
      new Request(`${AT}/records/index.json`, { headers: { "sec-fetch-site": "none" } }),
    );
    expect(typed.status).toBe(200);
    await typed.arrayBuffer();
    // Without records, a path under /records/ is said to be none, and never the build's page.
    for (const path of [
      "/records/index.json",
      "/records",
      "/records/ad-creatives/files/c-001.png",
    ]) {
      const none = await served(false)(new Request(`${AT}${path}`, { headers: fromPage }));
      expect(none.status, path).toBe(404);
      expect(await none.json(), path).toMatchObject({ error: { code: "records.not_served" } });
    }
    // The build's own pages are as they were.
    const page = await get("/projects/web");
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("serves a directory that is not there yet as one that holds nothing, and what comes to be kept in it with no restart", async () => {
    // A desk keeps nothing until its member asks (ADR-0122): its pages are served all the same.
    const later = join(desk, "later");
    const kept = await loadRecordsRoot(later);
    expect(await kept.there()).toBe(false);
    const handler = createServeHandler({
      upstream: `${UPSTREAM}/`,
      token: TOKEN,
      fetch: fakeConsole().fetch,
      port: PORT,
      web,
      records: kept,
    });
    const ask = () => handler(new Request(`${AT}/records/index.json`, { headers: fromPage }));
    const none = await ask();
    expect(none.status).toBe(404);
    expect(await none.json()).toMatchObject({ error: { code: "records.not_found" } });
    // The first thing the desk keeps is served as soon as it is there: the directory is looked
    // for at each request.
    mkdirSync(later);
    writeFileSync(join(later, "index.json"), '{"collections":[]}');
    expect(await kept.there()).toBe(true);
    const first = await ask();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ collections: [] });
    // And nothing again once it is gone.
    rmSync(later, { recursive: true, force: true });
    expect(await kept.there()).toBe(false);
    expect((await ask()).status).toBe(404);
  });

  it("serves no path that is there and is not a directory", async () => {
    await expect(loadRecordsRoot(join(desk, "secret.json"))).rejects.toBeInstanceOf(
      RecordsRootError,
    );
    await expect(loadRecordsRoot(join(desk, "secret.json"))).rejects.toThrow(
      "is there and is not a directory",
    );
  });

  it("answers nothing from a directory that turned into a file while it was served", async () => {
    const turned = join(desk, "turned");
    mkdirSync(turned);
    writeFileSync(join(turned, "index.json"), "{}");
    const kept = await loadRecordsRoot(turned);
    rmSync(turned, { recursive: true, force: true });
    writeFileSync(turned, "a file now");
    try {
      expect(await kept.there()).toBe(false);
      const answer = await kept.respond(new Request(`${AT}/records/index.json`));
      expect(answer.status).toBe(404);
    } finally {
      rmSync(turned, { force: true });
    }
  });

  it("answers a part of a video over the loopback, as a browser's player asks for it", async () => {
    const listening = await listenOn(
      (port) =>
        createServeHandler({
          upstream: `${UPSTREAM}/`,
          token: TOKEN,
          fetch: fakeConsole().fetch,
          port,
          web,
          records,
        }),
      0,
    );
    try {
      const answer = await fetch(`${listening.url}records/ad-creatives/files/c-001.mp4`, {
        headers: { range: "bytes=50000-50999" },
      });
      expect(answer.status).toBe(206);
      expect(answer.headers.get("content-range")).toBe(`bytes 50000-50999/${VIDEO.length}`);
      expect(new Uint8Array(await answer.arrayBuffer())).toEqual(VIDEO.slice(50_000, 51_000));
    } finally {
      await listening.close();
    }
  });
});
