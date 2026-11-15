// `console-plugin check` (docs/specs/plugins.md, "Authoring"): reads a plugin's package as the
// console would and names everything a console, or a store, would refuse it for: the manifest,
// the package's own manifest, the server module under the host's hardening and against the
// manifest, the web bundle's self-containment and its classes, held to the console's parts, the
// skills, the migrations.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { descriptionProblems, type PluginDescription } from "../plugin/define.js";
import type { ServerLoad } from "../plugin/load.js";
import {
  CURRENT_PLUGIN_API,
  capabilitiesAsked,
  PLUGIN_API_MAJORS,
  type PluginManifest,
  parsePluginManifest,
} from "../plugin/manifest.js";
import { forbiddenImportsIn, removedGlobalsIn } from "../plugin/sandbox.js";
import { formatTriple, satisfiesRange, versionOfDependency } from "../plugin/semver.js";
import { isLanguageMap } from "./plugin-init.js";

export interface CheckReport {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  /** One line about what was found, when the package read at all. */
  readonly summary: string | null;
}

/** SPDX identifiers under which a plugin may ship into an image: permissive only. */
export const PERMISSIVE_LICENSES: readonly string[] = [
  "MIT",
  "MIT-0",
  "ISC",
  "0BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Zlib",
];

/** `(MIT OR Apache-2.0)` is fine when one side is; `MIT AND X` only when both are. */
export function isPermissiveLicense(expression: string): boolean {
  const trimmed = expression.trim().replace(/^\(|\)$/g, "");
  if (/\bOR\b/i.test(trimmed)) {
    return trimmed.split(/\s+OR\s+/i).some(isPermissiveLicense);
  }
  if (/\bAND\b/i.test(trimmed)) {
    return trimmed.split(/\s+AND\s+/i).every(isPermissiveLicense);
  }
  return PERMISSIVE_LICENSES.includes(trimmed);
}

/** True when npm's `files` list ships the path: named, under a named directory, or matched by a simple glob. */
export function coveredByFiles(files: readonly string[], path: string): boolean {
  const target = posix.normalize(path).replace(/^\.\//, "");
  return files.some((entry) => {
    const pattern = posix.normalize(entry).replace(/^\.\//, "").replace(/\/$/, "");
    if (pattern.startsWith("!")) {
      return false;
    }
    if (pattern === target || target.startsWith(`${pattern}/`)) {
      return true;
    }
    if (!/[*?]/.test(pattern)) {
      return false;
    }
    const regex = new RegExp(
      `^${pattern
        .split("**")
        .map((part) =>
          part
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, "[^/]*")
            .replace(/\?/g, "[^/]"),
        )
        .join(".*")}(?:/.*)?$`,
    );
    return regex.test(target);
  });
}

/** A class selector: a dot not after a digit or another dot (0.5em is a number), then a name. */
const CLASS_SELECTOR = /(?<![\d.])\.(-?[A-Za-z_][\w-]*)/g;

/** The classes a stylesheet styles, each once; comments and quoted strings are not read. */
export function classesIn(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, '""');
  const found = new Set<string>();
  for (const match of withoutComments.matchAll(CLASS_SELECTOR)) {
    if (match[1] !== undefined && !/^\d/.test(match[1])) {
      found.add(match[1]);
    }
  }
  return [...found];
}

/**
 * The classes of the console's stylesheet, as the package ships its sources (ADR-0106): the
 * parts, which a plugin's pages are built from as the console's own are, and the classes of the
 * console's own pages, which lay one page out and are that page's alone. The list is the
 * catalogue itself, `src/styles/README.md` of the package, and the pages' files beside it:
 * nothing is copied, so that a part added to the catalogue is one a plugin may use at once.
 */
export interface ConsoleClasses {
  /** Whether a row of the catalogue names the class: `sc-button*` is `sc-button` and every `sc-button-...`. */
  isPart(name: string): boolean;
  /** Whether a part's class begins so, for a name a bundle finishes itself: `sc-badge-` and a tone. */
  beginsPart(stem: string): boolean;
  /** Whether the class is one of the console's own pages', which no part is. */
  isPagesOwn(name: string): boolean;
}

/** Reads the catalogue's rows and the pages' stylesheets into the classes a plugin is held to. */
export function consoleClassesOf(catalogue: string, pageSheets: readonly string[]): ConsoleClasses {
  const exact = new Set<string>();
  const stems: string[] = [];
  const lines = catalogue.split(/\r?\n/);
  const from = lines.findIndex((line) => line.trim() === "## The catalogue");
  const after = lines.findIndex((line, index) => index > from && line.startsWith("## "));
  for (const line of from < 0 ? [] : lines.slice(from + 1, after < 0 ? undefined : after)) {
    // A row of the table: the part, its classes, what renders it, what it is for.
    const cells = line.startsWith("|") ? line.split("|") : [];
    for (const match of (cells[2] ?? "").matchAll(/`(sc-[a-z0-9-]+)(\*?)`/g)) {
      if (match[2] === "*") {
        stems.push(match[1] ?? "");
      } else {
        exact.add(match[1] ?? "");
      }
    }
  }
  const isPart = (name: string): boolean =>
    exact.has(name) || stems.some((stem) => name === stem || name.startsWith(`${stem}-`));
  const ofPages = new Set(pageSheets.flatMap((css) => classesIn(css)));
  return {
    isPart,
    beginsPart: (stem) =>
      [...exact].some((name) => name.startsWith(stem)) ||
      stems.some((part) => `${part}-`.startsWith(stem) || stem.startsWith(`${part}-`)),
    isPagesOwn: (name) => ofPages.has(name) && !isPart(name),
  };
}

/** The catalogue and the pages' files of the package whose styles are in `stylesDir`. */
export async function readConsoleClasses(stylesDir: string): Promise<ConsoleClasses> {
  const catalogue = await readFile(join(stylesDir, "README.md"), "utf8");
  const pages = (await readdir(join(stylesDir, "pages"))).filter((name) => name.endsWith(".css"));
  return consoleClassesOf(
    catalogue,
    await Promise.all(pages.map((name) => readFile(join(stylesDir, "pages", name), "utf8"))),
  );
}

/**
 * A name in the console's own prefix, as a script holds one: `sc-` not inside a longer word nor
 * a custom property (`--sc-color-text` is a token), then the name, with the hyphen it ends on
 * where the script finishes it itself (`sc-badge-` and a tone).
 */
const CONSOLE_NAME = /(?<![\w-])sc-[a-z][a-z0-9]*(?:-[a-z0-9]+)*-?/g;

/** The names in the console's prefix a script holds, each once. */
export function consoleNamesIn(script: string): string[] {
  return [...new Set(script.match(CONSOLE_NAME) ?? [])];
}

/**
 * What a file of a web bundle uses of the console's classes that is not a part (ADR-0106): a
 * class of one of the console's own pages, which is that page's layout and changes with it, is
 * an error; a name nothing of the console styles is said, since it draws nothing. A stylesheet
 * is read by its selectors, a script by the names it holds.
 */
export function strayConsoleClasses(
  file: string,
  text: string,
  classes: ConsoleClasses,
): { readonly pagesOwn: string[]; readonly unknown: string[] } {
  const names = file.endsWith(".css")
    ? classesIn(text).filter((name) => name.startsWith("sc-"))
    : consoleNamesIn(text);
  const pagesOwn: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    if (name.endsWith("-") ? classes.beginsPart(name) : classes.isPart(name)) {
      continue;
    }
    (classes.isPagesOwn(name) ? pagesOwn : unknown).push(name);
  }
  return { pagesOwn: pagesOwn.sort(), unknown: unknown.sort() };
}

/** A few of a list, in a line, with a word where there are more. */
const some = (names: readonly string[], most = 8): string =>
  `${names.slice(0, most).join(", ")}${names.length > most ? `, and ${names.length - most} more` : ""}`;

const WEB_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)["'`]([^"'`]+)["'`]/g;
const WEB_FORBIDDEN =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon)\s*\(|document\.cookie|\bnavigator\.serviceWorker\b/g;

/** What a web bundle reaches for that a frame has no business with, or imports from elsewhere. */
export function webBundleProblems(source: string): string[] {
  const problems = new Set<string>();
  for (const match of source.matchAll(WEB_IMPORT)) {
    const specifier = match[1] ?? "";
    if (
      !specifier.startsWith("./") &&
      !specifier.startsWith("../") &&
      !specifier.startsWith("data:")
    ) {
      problems.add(`imports ${specifier} from elsewhere: a bundle is self-contained`);
    }
  }
  for (const match of source.matchAll(WEB_FORBIDDEN)) {
    problems.add(
      `uses ${match[1] ?? match[0]}: a frame speaks to the console through the bridge alone`,
    );
  }
  return [...problems];
}

async function exists(path: string): Promise<"file" | "directory" | null> {
  try {
    const found = await stat(path);
    return found.isDirectory() ? "directory" : "file";
  } catch {
    return null;
  }
}

async function readJson(path: string): Promise<{ value: unknown } | { problem: string }> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { problem: `${posix.basename(path)} is missing` };
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      problem: `${posix.basename(path)} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

interface FrontMatter {
  readonly scalars: Readonly<Record<string, string>>;
  readonly body: string;
}

function frontMatter(text: string): FrontMatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (match === null) {
    return null;
  }
  const scalars: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const key = /^([a-z][a-zA-Z]*):(?: (.*))?$/.exec(line);
    if (key?.[1] !== undefined && key[2] !== undefined) {
      scalars[key[1]] = key[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return { scalars, body: match[2] ?? "" };
}

async function checkSkills(
  root: string,
  skillsDir: string,
  errors: string[],
  warnings: string[],
): Promise<number> {
  const manifestPath = join(root, "SKILLCDN.md");
  const manifestText = await readFile(manifestPath, "utf8").catch(() => null);
  if (manifestText === null) {
    errors.push(
      "SKILLCDN.md is missing at the package root: a plugin with skills has their manifest there",
    );
  } else {
    const matter = frontMatter(manifestText);
    if (matter === null || !matter.scalars.name || !matter.scalars.description) {
      errors.push("SKILLCDN.md has no front-matter with name and description");
    }
  }
  const dir = join(root, skillsDir);
  if ((await exists(dir)) !== "directory") {
    errors.push(`skills names ${skillsDir}, which is not a directory`);
    return 0;
  }
  let count = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const file = posix.join(skillsDir, entry.name, "SKILL.md");
    const text = await readFile(join(root, file), "utf8").catch(() => null);
    if (text === null) {
      errors.push(`${file} is missing: a skill directory holds a SKILL.md`);
      continue;
    }
    count += 1;
    const matter = frontMatter(text);
    if (matter === null) {
      errors.push(`${file} has no front-matter`);
      continue;
    }
    if (matter.scalars.name !== entry.name) {
      errors.push(
        `${file} is named ${matter.scalars.name ?? "(nothing)"}, not ${entry.name} as its directory is`,
      );
    }
    const description = matter.scalars.description ?? "";
    if (description.length === 0 || description.length > 1024) {
      errors.push(
        `${file} has a description of ${description.length} characters; 1 to 1024 are allowed`,
      );
    }
    if (!/^\s*# /.test(matter.body)) {
      errors.push(`${file} does not start its body with a level-one heading`);
    }
    if (matter.scalars.license === undefined) {
      warnings.push(`${file} names no license`);
    }
  }
  if (count === 0) {
    warnings.push(`${skillsDir} holds no skill`);
  }
  return count;
}

async function checkMigrations(
  root: string,
  migrationsDir: string,
  errors: string[],
): Promise<void> {
  const dir = join(root, migrationsDir);
  if ((await exists(dir)) !== "directory") {
    errors.push(`migrations names ${migrationsDir}, which is not a directory`);
    return;
  }
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  if (names.length === 0) {
    errors.push(`${migrationsDir} holds no .sql file`);
  }
  for (const name of names) {
    if (!/^\d{4}-[a-z0-9-]+\.sql$/.test(name)) {
      errors.push(`${migrationsDir}/${name} is not named NNNN-<words>.sql`);
    }
  }
}

/** The scripts and stylesheets of a bundle, by their paths under it: its entry, its chunks, its styles. */
async function bundleFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:js|mjs|css)$/.test(entry.name))
    .map((entry) => posix.join(relative(dir, entry.parentPath).split(sep).join("/"), entry.name))
    .sort();
}

async function checkWeb(
  root: string,
  manifest: PluginManifest,
  webDir: string,
  errors: string[],
  warnings: string[],
  classes: ConsoleClasses | undefined,
): Promise<void> {
  const dir = join(root, webDir);
  if ((await exists(dir)) !== "directory") {
    errors.push(`web names ${webDir}, which is not a directory: build the bundle first`);
    return;
  }
  const script = await readFile(join(dir, "index.js"), "utf8").catch(() => null);
  if (script === null) {
    errors.push(`${webDir}/index.js is missing: the frame loads the bundle from there`);
  } else {
    for (const problem of webBundleProblems(script)) {
      errors.push(`${webDir}/index.js ${problem}`);
    }
  }
  const css = await readFile(join(dir, "index.css"), "utf8").catch(() => null);
  if (css !== null) {
    if (
      /@import\s+(?:url\()?["']?(?:https?:)?\/\//.test(css) ||
      /url\(\s*["']?(?:https?:)?\/\//.test(css)
    ) {
      errors.push(`${webDir}/index.css loads from elsewhere: a bundle is self-contained`);
    }
    const prefix = `pl-${manifest.key}-`;
    const strangers = classesIn(css).filter(
      (name) => !name.startsWith(prefix) && !name.startsWith("sc-"),
    );
    if (strangers.length > 0) {
      warnings.push(
        `${webDir}/index.css styles ${strangers.slice(0, 5).join(", ")}${strangers.length > 5 ? ", ..." : ""}: a plugin's classes begin with ${prefix}`,
      );
    }
  }
  if (classes === undefined) {
    return;
  }
  // A plugin's pages are built from the console's parts, as the console's own are (ADR-0106):
  // every file of the bundle is read for the classes of the console it uses.
  for (const file of await bundleFiles(dir)) {
    const text = await readFile(join(dir, file), "utf8").catch(() => null);
    if (text === null) {
      continue;
    }
    const stray = strayConsoleClasses(file, text, classes);
    if (stray.pagesOwn.length > 0) {
      const one = stray.pagesOwn.length === 1;
      errors.push(
        `${webDir}/${file} uses ${some(stray.pagesOwn)}: ${one ? "a class" : "classes"} of the console's own pages, not ${one ? "a part" : "parts"}; a plugin's page is built from the parts, which src/styles/README.md of @skillcdn/console lists`,
      );
    }
    if (stray.unknown.length > 0) {
      const one = stray.unknown.length === 1;
      warnings.push(
        `${webDir}/${file} names ${some(stray.unknown)}: no part of the console has ${one ? "that class" : "those classes"}, and nothing styles ${one ? "it" : "them"}; a plugin's own classes begin with pl-${manifest.key}-`,
      );
    }
  }
}

function describeCounts(manifest: PluginManifest, description: PluginDescription | null): string {
  const counts = [
    `${manifest.pages.length} pages`,
    `${manifest.widgets.length} widgets`,
    `${manifest.settings.length} settings`,
    `${Object.keys(manifest.roles).length} roles`,
  ];
  if (description !== null) {
    counts.unshift(
      `${description.collections.length} collections`,
      `${Object.keys(description.commands).length} commands`,
      `${Object.keys(description.queries).length} queries`,
      `${Object.keys(description.endpoints).length} endpoints`,
      `${description.hooks.length} hooks`,
      `${Object.keys(description.jobs).length} jobs`,
    );
  }
  return counts.join(", ");
}

/**
 * The words of the manifest, as JSON, whose translation repeats the English words (`name.ko`,
 * for one): what `init --languages` copies for the author to translate, and what was left.
 */
export function sameAsEnglish(value: unknown, at = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => sameAsEnglish(item, `${at}[${index}]`));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  if (isLanguageMap(value)) {
    return Object.entries(value)
      .filter(([language, words]) => language !== "en" && words === value.en)
      .map(([language]) => `${at}.${language}`.replace(/^\./, ""));
  }
  return Object.entries(value).flatMap(([key, inner]) =>
    sameAsEnglish(inner, at.length === 0 ? key : `${at}.${key}`),
  );
}

export interface CheckOptions {
  /** The version of the console this command belongs to, held against the manifest's `console`; left out, not compared. */
  readonly consoleVersion?: string | undefined;
  /** The classes of the console this command belongs to, which the web bundle's are held to; left out, not held. */
  readonly consoleClasses?: ConsoleClasses | undefined;
}

/** Reads the plugin at `root` as a console would, and says what it would refuse. */
export async function checkPlugin(
  root: string,
  loadServer: (file: string) => Promise<ServerLoad>,
  options: CheckOptions = {},
): Promise<CheckReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if ((await exists(root)) !== "directory") {
    return { ok: false, errors: [`${root} is not a directory`], warnings, summary: null };
  }

  const manifestRead = await readJson(join(root, "console-plugin.json"));
  if ("problem" in manifestRead) {
    return { ok: false, errors: [manifestRead.problem], warnings, summary: null };
  }
  const parsed = parsePluginManifest(manifestRead.value);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.problems.map((problem) => `console-plugin.json: ${problem}`),
      warnings,
      summary: null,
    };
  }
  const manifest = parsed.manifest;
  if (!(PLUGIN_API_MAJORS as readonly number[]).includes(manifest.pluginApi)) {
    errors.push(
      `console-plugin.json: pluginApi ${manifest.pluginApi} is not one this command knows (${PLUGIN_API_MAJORS.join(", ")}); write against ${CURRENT_PLUGIN_API}`,
    );
  }
  for (const path of sameAsEnglish(manifestRead.value)) {
    warnings.push(
      `console-plugin.json: ${path} is the same as en: translate it, or leave the language out`,
    );
  }
  if (
    manifest.console !== undefined &&
    options.consoleVersion !== undefined &&
    !satisfiesRange(options.consoleVersion, manifest.console)
  ) {
    warnings.push(
      `console-plugin.json: console ${manifest.console} leaves out ${options.consoleVersion}, the console this command belongs to`,
    );
  }

  const packageRead = await readJson(join(root, "package.json"));
  let version = "0.0.0";
  if ("problem" in packageRead) {
    errors.push(packageRead.problem);
  } else {
    const pkg = (
      typeof packageRead.value === "object" && packageRead.value !== null ? packageRead.value : {}
    ) as Record<string, unknown>;
    if (typeof pkg.name !== "string" || pkg.name.length === 0) {
      errors.push("package.json: name is missing");
    }
    if (
      typeof pkg.version !== "string" ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version)
    ) {
      errors.push("package.json: version is not a semver version");
    } else {
      version = pkg.version;
    }
    if (typeof pkg.license !== "string" || !isPermissiveLicense(pkg.license)) {
      errors.push(
        `package.json: license ${typeof pkg.license === "string" ? pkg.license : "(none)"} is not a permissive license (${PERMISSIVE_LICENSES.join(", ")})`,
      );
    }
    if (pkg.type !== "module") {
      errors.push('package.json: type is not "module"; the server module is ESM');
    }
    // The console the plugin is built against is the one its types come from: a devDependency
    // outside the consoles it declares is a plugin built for a console it says it does not run on.
    const devDependencies = (
      typeof pkg.devDependencies === "object" && pkg.devDependencies !== null
        ? pkg.devDependencies
        : {}
    ) as Record<string, unknown>;
    const dependency = devDependencies["@skillcdn/console"];
    const builtAgainst =
      typeof dependency === "string" ? versionOfDependency(dependency) : undefined;
    if (
      manifest.console !== undefined &&
      builtAgainst !== undefined &&
      !satisfiesRange(formatTriple(builtAgainst), manifest.console)
    ) {
      errors.push(
        `package.json: devDependencies names @skillcdn/console ${String(dependency)}, outside the consoles the manifest declares (console ${manifest.console})`,
      );
    }
    const scripts = (
      typeof pkg.scripts === "object" && pkg.scripts !== null ? pkg.scripts : {}
    ) as Record<string, unknown>;
    for (const hook of ["preinstall", "install", "postinstall"]) {
      if (hook in scripts) {
        errors.push(
          `package.json: has a ${hook} script; a plugin is installed with no install scripts`,
        );
      }
    }
    if (Array.isArray(pkg.files)) {
      const files = pkg.files.filter((entry): entry is string => typeof entry === "string");
      const shipped = [
        "console-plugin.json",
        manifest.server,
        ...(manifest.web === undefined ? [] : [manifest.web]),
        ...(manifest.skills === undefined ? [] : [manifest.skills, "SKILLCDN.md"]),
        ...(manifest.migrations === undefined ? [] : [manifest.migrations]),
      ];
      for (const path of shipped) {
        if (!coveredByFiles(files, path)) {
          errors.push(`package.json: files leaves out ${path}, which the console reads`);
        }
      }
    } else {
      warnings.push("package.json: has no files list; everything in the directory is published");
    }
    if (typeof pkg.private === "boolean" && pkg.private) {
      warnings.push("package.json: is private; take that out to publish");
    }
  }

  let description: PluginDescription | null = null;
  const serverPath = join(root, manifest.server);
  if ((await exists(serverPath)) !== "file") {
    errors.push(`server names ${manifest.server}, which is missing: build the server module first`);
  } else {
    const source = await readFile(serverPath, "utf8");
    for (const specifier of forbiddenImportsIn(source)) {
      errors.push(`${manifest.server} imports ${specifier}, which the host refuses`);
    }
    for (const name of removedGlobalsIn(source)) {
      errors.push(
        `${manifest.server} calls ${name}, which the host removes; the console is reached through ctx`,
      );
    }
    const load = await loadServer(serverPath);
    if (!load.ok) {
      errors.push(`${manifest.server} does not load under the host's hardening: ${load.error}`);
      for (const problem of load.problems) {
        errors.push(`${manifest.server}: ${problem}`);
      }
    } else {
      description = load.description;
      if (description.pluginApi !== manifest.pluginApi) {
        errors.push(
          `${manifest.server} was built against plugin API ${description.pluginApi}; the manifest says ${manifest.pluginApi}`,
        );
      }
      for (const problem of descriptionProblems(description, manifest)) {
        errors.push(`${manifest.server}: ${problem}`);
      }
      if (
        capabilitiesAsked(manifest).includes("endpoints") &&
        Object.keys(description.endpoints).length === 0
      ) {
        warnings.push(
          "console-plugin.json: asks the capability endpoints and the server module defines no endpoint",
        );
      }
      if (
        capabilitiesAsked(manifest).includes("jobs") &&
        Object.keys(description.jobs).length === 0
      ) {
        warnings.push(
          "console-plugin.json: asks the capability jobs and the server module defines no job",
        );
      }
    }
  }

  if (manifest.web !== undefined) {
    await checkWeb(root, manifest, manifest.web, errors, warnings, options.consoleClasses);
  }
  let skills = 0;
  if (manifest.skills !== undefined) {
    skills = await checkSkills(root, manifest.skills, errors, warnings);
  } else {
    warnings.push(
      "console-plugin.json: names no skills; an agent learns the plugin from its command's help alone",
    );
  }
  if (manifest.migrations !== undefined) {
    await checkMigrations(root, manifest.migrations, errors);
  } else if (manifest.capabilities.includes("storage:sql")) {
    warnings.push("console-plugin.json: asks storage:sql and names no migrations");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: `${manifest.key} ${version}: ${describeCounts(manifest, description)}, ${skills} skills`,
  };
}
