import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as exported from "./index.js";

// The shell of a desk's pages (ADR-0116), `template/desk-web` in the package: the files
// `console desk --web` writes into a desk's `web/`, with the package's version for
// `__VERSION__` and the desk's title for `__TITLE__`. A template is built nowhere in this
// repository, so this holds what a build of it leans on: the files there are, the two words
// where the command fills them, that what the scripts import is what the package exports, and
// that the pages are served with the desk's records beside them. The shell is one page of the
// member's own with nothing on it yet (ADR-0122): it mounts no ready page.

const TEMPLATE = fileURLToPath(new URL("../template/desk-web/", import.meta.url));

async function filesOf(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await filesOf(path)));
    } else {
      found.push(relative(TEMPLATE, path).split(sep).join("/"));
    }
  }
  return found.sort();
}

const read = (name: string): Promise<string> => readFile(join(TEMPLATE, name), "utf8");

describe("the shell of a desk's pages", () => {
  it("is the files of a console of one's own with one page of the member's own, its manifest and five lines on how it is run", async () => {
    expect(await filesOf(TEMPLATE)).toEqual([
      "README.md",
      "index.html",
      "package.json",
      "src/main.tsx",
      "src/page.tsx",
      "tsconfig.json",
      "vite.config.ts",
    ]);
  });

  it("depends on the package at the version the command fills in, and on nothing a build does not need", async () => {
    const manifest = JSON.parse(await read("package.json")) as {
      readonly private?: boolean;
      readonly scripts: Readonly<Record<string, string>>;
      readonly dependencies: Readonly<Record<string, string>>;
      readonly devDependencies: Readonly<Record<string, string>>;
    };
    // Never published: it is a person's own.
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies["@skillcdn/console"]).toBe("__VERSION__");
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      "@skillcdn/console",
      "pretendard",
      "react",
      "react-dom",
    ]);
    expect(Object.keys(manifest.devDependencies).sort()).toEqual([
      "@types/react",
      "@types/react-dom",
      "@vitejs/plugin-react",
      "typescript",
      "vite",
    ]);
    // A build that went well prints nothing of its own: the bundler's report of every file is
    // a screen an agent reads for nothing, so it speaks from a warning up, and the one warning
    // a console of one's own always got, the size of its one script, is set past what it is.
    expect(manifest.scripts.build).toBe(
      "tsc -p tsconfig.json --noEmit && vite build --logLevel warn",
    );
    expect(await read("vite.config.ts")).toContain("build: { chunkSizeWarningLimit: 4000 }");
    // So the README says what such a build leaves, where it names it.
    expect(await read("README.md")).toContain(
      "- **Build it:** `npm install`, then `npm run build`, which says nothing of its own where it went well and leaves the pages in `dist/`.\n",
    );
    // The pages are served with the desk's records beside them, and nothing else of the desk.
    expect(manifest.scripts.serve).toBe("console serve dist --records ../records");
  });

  it("carries the desk's title where the command fills it, and names no token, address or project", async () => {
    expect(await read("index.html")).toContain("<title>__TITLE__</title>");
    // The title stands in the page and in the README's heading alone, as text: never in a
    // script or in JSON, where a name with a quote in it would break what it is written into.
    expect(await read("src/main.tsx")).toContain(
      "createConsole({ title: document.title, pages: [page] })",
    );
    expect(await read("README.md")).toMatch(/^# __TITLE__: the pages\n/);
    expect(await read("README.md")).toContain("`console serve dist --records ../records`");
    for (const name of [
      "package.json",
      "src/main.tsx",
      "src/page.tsx",
      "tsconfig.json",
      "vite.config.ts",
    ]) {
      expect(await read(name)).not.toContain("__TITLE__");
    }
    for (const name of await filesOf(TEMPLATE)) {
      expect((await read(name)).includes("__VERSION__")).toBe(name === "package.json");
    }
    for (const name of await filesOf(TEMPLATE)) {
      const text = await read(name);
      // The two words alone are filled; nothing else looks like one.
      expect(text.replaceAll("__VERSION__", "").replaceAll("__TITLE__", "")).not.toMatch(/__\w+__/);
      // The pages hold no credential and no address of a console: `console serve` carries the API.
      expect(text).not.toMatch(/token\s*[:=]|CONSOLE_TOKEN|https?:\/\/(?!127\.0\.0\.1:11197)/i);
      expect(text.endsWith("\n")).toBe(true);
      expect(text).not.toContain("\r");
    }
  });

  it("imports from the package what the package exports", async () => {
    /** The names a script takes from the package, the types among them left out. */
    const namesOf = (script: string): string[] =>
      (/import \{([^}]+)\} from "@skillcdn\/console";/.exec(script)?.[1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0 && !name.startsWith("type "));
    const script = await read("src/main.tsx");
    const page = await read("src/page.tsx");
    expect(namesOf(script)).toEqual(["createConsole", "customPageHref"]);
    expect(namesOf(page)).toEqual(["DEFAULT_LANGUAGES", "EmptyState"]);
    for (const name of [...namesOf(script), ...namesOf(page)]) {
      expect(exported).toHaveProperty(name);
    }
    expect(script).toContain('import "@skillcdn/console/console.css";');
    expect(script).toContain('import { page } from "./page.js";');
    // The development server sends the API where `console serve` listens by default.
    const build = await read("vite.config.ts");
    expect(build).toContain(
      'const served = { target: "http://127.0.0.1:11197", changeOrigin: true };',
    );
    expect(build).toContain('proxy: { "/api": served, "/records": served }');
  });

  it("is one page of the member's own with nothing on it yet, and mounts no ready page", async () => {
    const script = await read("src/main.tsx");
    const page = await read("src/page.tsx");
    // The console opens on the member's page, which stands at an address of its own, apart
    // from the ready page's, so that the ready page may be added beside it.
    expect(script).toContain('window.history.replaceState(null, "", customPageHref(page.key));');
    expect(page).toContain(
      'export const page: CustomPage = {\n  // What the address says: /pages/mine.\n  key: "mine",',
    );
    expect(exported.customPageHref("mine")).toBe("/pages/mine");
    expect(exported.DESK_PAGE_KEY).not.toBe("mine");
    // Nothing ready is mounted: the ready page is named where the page says what there is, and
    // imported nowhere.
    expect(script).not.toContain("deskPage");
    expect(page).not.toMatch(/import [^;]*deskPage/);
    expect(page).toContain("`deskPage()`, one more entry of `pages` in main.tsx");
    // What it shows until then are the package's words for it, in every language the console
    // speaks: a tab's word, and that the page is the member's.
    expect(page).toContain("pack.messages.desk.mine.tab");
    expect(page).toContain("<EmptyState title={words.title} body={words.body} />");
    for (const pack of exported.DEFAULT_LANGUAGES) {
      const words = pack.messages.desk.mine;
      for (const one of [words.tab, words.title, words.body]) {
        expect(one.length).toBeGreaterThan(0);
      }
    }
    // The page teaches what a page is given and may read, and where what it is built from is.
    for (const taught of [
      "`data`",
      "`client`",
      "`search` and `navigation`",
      "`words` and `language`",
      "/records/",
      '"The catalogue"',
      '"Charts"',
      '"Pages of your own"',
      '"A desk\'s pages"',
    ]) {
      expect(page).toContain(taught);
    }
  });
});
