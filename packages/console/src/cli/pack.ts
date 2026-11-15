import {
  type BrowseResult,
  browseResultOf,
  catalogStateOf,
  type DirectoryResult,
  directoryResultOf,
  type FileResult,
  type FindItem,
  type FindResult,
  fileResultOf,
  findResultOf,
  isReadmePath,
  joinSkillPages,
  type MountSummary,
  mountSummaryOf,
  parseAddress,
  parseRepoPath,
  parseSkillUri,
  type RestMount,
  type RestSkill,
  renderBrowseResult,
  renderDirectoryResult,
  renderFileResult,
  renderFindResult,
  renderInstructions,
  renderSkillResult,
  rowsCsv,
  type SkillResult,
  skillOutcome,
  skillResultOf,
  type ToolWords,
} from "@skillcdn/core";
import type {
  RestSkillBrowse,
  RestSkillCode,
  RestSkillFile,
  RestSkillFind,
  RestSkillLoad,
  RestSkillRows,
  RestSkills,
} from "../schemas.js";
import type { SkillsStatus } from "../vocabulary.js";

// The pack of the project, as the command prints it (ADR-0028, ADR-0031): the console answers
// what the pack's REST API answered, in the shapes of @skillcdn/core, and the command renders
// it with the functions a deployment's own tools render for a model, naming the reads as its
// own commands, so that an agent reads here what it would read over MCP, or with the skillcdn
// command. Each read goes as that command's does (ADR-0118): a skill whole, the pages it came
// in joined; a folder and a file a page at a time, the page saying where the next begins; the
// tables and the code blocks whole, as data. What a pack refuses is said as that command says
// it, by the pack's own code and words, and ends the command as refused.

/** How the results name the four reads, so that an agent is told the command and not a tool. */
export const CONSOLE_WORDS: ToolWords = {
  browse: "console skills <folder>",
  search: "console skills --search",
  load: "console skill",
  read: "console skill --file",
};

/** Where the reads of a pack are rendered at: what the listing said the address serves. */
export type PackSummary = MountSummary;

export const NO_ADDRESS = "No skills address: neither this project nor the console names one.";

/**
 * Whose pack a read is of, for the words of a read that did not happen: a project's, or the
 * organization's, which is what a command reads where no project is named (ADR-0113).
 */
export type PackOwner = "project" | "organization";

const NO_ORGANIZATION_ADDRESS =
  "No skills address: the console names none for the organization's skills, and no project is named here.";

const noAddress = (owner: PackOwner): string =>
  owner === "organization" ? NO_ORGANIZATION_ADDRESS : NO_ADDRESS;

/**
 * What a read of the organization's pack begins with: whose pack it is, since the command
 * would otherwise read as if a project had been named, and how a project's own is read.
 */
export const ORGANIZATION_PACK_LINE =
  "The organization's pack, since no project is named here: --project <key>, or a directory bound with console use <key>, reads a project's own.";

/** The words of a read that did not happen, by status, with what to do about it. */
const SKILLS_WORDS: Readonly<Record<Exclude<SkillsStatus, "none" | "ready">, string>> = {
  indexing: "The pack is still being indexed; ask again in a moment.",
  failed:
    "The pack could not be indexed, or this is a file the pack will not carry: too large, or not text.",
  not_found:
    "Nothing is served to the console at this address or path: it is not there, or the pack is private and the project holds no pack token for it (console project pack-token <key> --stdin, for an owner).",
  token_invalid:
    "The pack token the project holds no longer works at the deployment: an owner sets a new one (console project pack-token <key> --stdin).",
  unavailable: "The pack could not be reached; ask again later.",
};

/** The same, where the pack is the organization's: the token is the workspace's, an administrator's to set. */
const ORGANIZATION_WORDS: Readonly<Record<"not_found" | "token_invalid", string>> = {
  not_found:
    "Nothing is served to the console at this address or path: it is not there, or the organization's pack is private and the workspace holds no SkillCDN token for it (console workspace pack-token --connect, for an administrator).",
  token_invalid:
    "The SkillCDN token the workspace holds no longer works at the deployment: an administrator sets a new one (console workspace pack-token --connect).",
};

type Envelope = Pick<RestSkills, "address" | "source" | "page" | "status" | "refusal">;

/** The first line of an answer about the pack: what was read, where the pack is, and how it went. */
function head(what: string, answer: Envelope): string {
  const where =
    answer.source === null ? "read from the console's machine" : `served by ${answer.source}`;
  return `${what} at ${answer.address}, ${where}: ${answer.status}`;
}

/**
 * Whether a refusal is the pack's answer to one read: a path with nothing at it, a read asked
 * wrong, a file it will not carry, in the pack's own code and words. The pack answered, so no
 * token is what is missing, and saying so would send an agent to mend a pack that is served.
 * Every other refusal is of the pack as a whole: nothing is served to the console at the
 * address, the token is no good there, the index is not there to read, or it was not reached.
 */
const ofOneRead = (answer: Envelope): boolean =>
  answer.refusal !== null &&
  (answer.status === "not_found" || answer.status === "failed") &&
  !/^(mount|auth|index)\./.test(answer.refusal.code);

/**
 * A read that did not happen, as the command says it on standard error. Of the pack as a
 * whole: where it is and how it stands, the words of that standing, and the pack's own
 * refusal when it gave one. Of one read: the pack's code and words, as the skillcdn command
 * prints them.
 */
function refused(what: string, answer: Envelope, owner: PackOwner = "project"): string {
  if (answer.refusal !== null && ofOneRead(answer)) {
    return `${answer.refusal.code}: ${answer.refusal.message}`;
  }
  const lines = [head(what, answer)];
  if (answer.status !== "none" && answer.status !== "ready") {
    lines.push(
      owner === "organization" &&
        (answer.status === "not_found" || answer.status === "token_invalid")
        ? ORGANIZATION_WORDS[answer.status]
        : SKILLS_WORDS[answer.status],
    );
  }
  if (answer.refusal !== null) {
    lines.push(answer.refusal.message);
  }
  return lines.join("\n");
}

/** What the listing said the address serves, for the reads to be rendered at; nothing when it did not answer. */
export function summaryOf(listing: RestSkills): PackSummary | undefined {
  return listing.mount === null ? undefined : mountSummaryOf(listing.mount);
}

/** Every skill and document the address serves, as one listing: what `search_repo` without words answers. */
function listingOf(mount: RestMount, summary: PackSummary): FindResult | undefined {
  if (mount.index.status !== "ready") {
    return undefined;
  }
  const { index } = mount;
  const items: FindItem[] = [];
  for (const skill of index.skills) {
    const directory = parseRepoPath(skill.directory);
    if (!directory.ok) {
      continue;
    }
    const path = parseRepoPath(
      skill.path ?? (skill.directory === "" ? "SKILL.md" : `${skill.directory}/SKILL.md`),
    );
    items.push({
      kind: "skill",
      ...(path.ok ? { path: path.value } : {}),
      name: skill.name,
      directory: directory.value,
      description: skill.description,
      files: [],
      moreFiles: 0,
      // For people, and not rendered for a model.
      translations: {},
    });
  }
  for (const document of index.documents) {
    const path = parseRepoPath(document.path);
    if (path.ok) {
      items.push({
        kind: "document",
        path: path.value,
        title: document.title ?? undefined,
        summary: document.summary ?? undefined,
        skillDirectory: undefined,
        // The README of a folder is its map, and is listed as one, as the pack's own listing has it.
        ...(isReadmePath(path.value) ? { overview: true } : {}),
      });
    }
  }
  const state = catalogStateOf(mount);
  return {
    mount: summary,
    query: undefined,
    items,
    // The counts stand in the instructions above; without totals here, nothing suggests a cursor.
    totals: undefined,
    diagnostics: state.status === "ready" ? state.catalog.diagnostics : [],
  };
}

/**
 * The pack: where it is and how it answered; what a client is told on connect, as the
 * deployment tells one; every skill and document; where a person connects an agent of its own;
 * and where the console's own skills are on this machine.
 */
export function formatSkills(
  skills: RestSkills,
  ownSkills?: string,
  owner: PackOwner = "project",
): string {
  const own =
    ownSkills === undefined
      ? []
      : ["", `The console's own skills, for working the board: ${ownSkills}`];
  if (skills.status === "none" || skills.address === null) {
    return [noAddress(owner), ...own].join("\n");
  }
  const summary = summaryOf(skills);
  if (skills.status !== "ready" || skills.mount === null || summary === undefined) {
    return [refused("skills", skills, owner), ...own].join("\n");
  }
  const lines = [
    head("skills", skills),
    "",
    renderInstructions(catalogStateOf(skills.mount), CONSOLE_WORDS),
  ];
  const listing = listingOf(skills.mount, summary);
  if (listing !== undefined) {
    lines.push("", renderFindResult(listing, CONSOLE_WORDS));
  }
  if (skills.page !== null) {
    lines.push(
      "",
      `A host with a SkillCDN connection of its own loads a skill by its URI, which a person makes at ${skills.page}; through the console, ${CONSOLE_WORDS.load} takes the URI too. --json adds the page of each skill, for a person.`,
    );
  }
  lines.push(...own);
  return lines.join("\n");
}

/**
 * The `SKILL.md` a path names: the path itself where it names one, else the one in the folder
 * it names, since a skill is its folder and a listing cut short shows the folder alone; the
 * root's own for the dot, as the root is everywhere.
 */
function skillFileOf(given: string): string {
  const path = given.replace(/\/+$/, "");
  if (path === "" || path === ".") {
    return "SKILL.md";
  }
  return path === "SKILL.md" || path.endsWith("/SKILL.md") ? path : `${path}/SKILL.md`;
}

/**
 * A skill's path as given, or taken out of the URI the listing names it by
 * (`skill://<host>/<owner>/<name>/<path>`); a URI of another pack would read this pack's skill
 * at the same path, or nothing, so it is said instead.
 */
export function skillPathIn(
  given: string,
  packAddress: string | null,
): { readonly path: string } | { readonly error: string } {
  const uri = parseSkillUri(given);
  if (uri === undefined) {
    return given.startsWith("skill://")
      ? {
          error: `Not a skill's URI the console knows: ${given}. Say the path of its SKILL.md from the repository's root, or the URI console skills lists.`,
        }
      : { path: skillFileOf(given) };
  }
  const pack = packAddress === null ? undefined : parseAddress(packAddress);
  if (
    pack?.ok === true &&
    (uri.address.host !== pack.value.host ||
      uri.address.owner !== pack.value.owner ||
      uri.address.repo !== pack.value.repo)
  ) {
    return {
      error: `That URI is of another pack, /${uri.address.host}/${uri.address.owner}/${uri.address.repo}; this project's pack is at ${packAddress}. Say the path of the SKILL.md, or a URI console skills lists.`,
    };
  }
  return { path: uri.path };
}

/** The pages of a skill, as the console answered them, as the one skill they were cut from. */
export function joinSkill(
  pages: readonly RestSkillLoad[],
  summary: PackSummary,
): SkillResult | undefined {
  return joinSkillPages(
    pages.flatMap((page) =>
      page.read?.status === "ready" ? (skillResultOf(page.read, summary) ?? []) : [],
    ),
  );
}

/** The skill whole, as the REST API answers one, for `--json`. */
export function bodyOfSkill(skill: SkillResult): RestSkill {
  const outcome = skillOutcome({ status: "ready", lookup: { kind: "found", skill } });
  if ("failure" in outcome) {
    throw new Error("a skill that was found has a body");
  }
  return outcome.body;
}

/** How many skills a refusal names as available: what the skillcdn command names. */
const AVAILABLE_SKILLS = 20;

/** One skill as `load_skill` lays it out for a model: the rules, the body, the included files, its files and references. */
export function formatSkillLoad(
  loaded: RestSkillLoad,
  whole: SkillResult | undefined,
  owner: PackOwner = "project",
  /** The path that was read, the command it was read with and the skills the listing names, for what is said where no skill is there. */
  asked?: {
    readonly path: string;
    readonly command: string;
    readonly available: readonly string[];
  },
): string {
  if (loaded.status === "none" || loaded.address === null) {
    return noAddress(owner);
  }
  if (loaded.status !== "ready") {
    if (asked !== undefined && loaded.refusal?.code === "skill.not_found") {
      // As the skillcdn command says it: the path as given, the two reads that find the exact
      // one, and the paths there are. The listing is the command's plural (console skills).
      const listing = `${asked.command}s`;
      const available =
        asked.available.length === 0
          ? ""
          : ` Available: ${asked.available.slice(0, AVAILABLE_SKILLS).join(", ")}.`;
      return `skill.not_found: No skill at ${JSON.stringify(asked.path)}. Use ${listing} <folder> or ${listing} --search for its exact SKILL.md path.${available}`;
    }
    return refused("skill", loaded, owner);
  }
  if (whole === undefined) {
    return `${head("skill", loaded)}\nNothing was read.`;
  }
  return renderSkillResult(whole, CONSOLE_WORDS);
}

/** One page of a folder, or of a file's outline, as the console answered it; nothing when the pack did not. */
export function folderOf(page: RestSkillBrowse, summary: PackSummary): BrowseResult | undefined {
  return page.read?.status === "ready" ? browseResultOf(page.read, summary) : undefined;
}

/** A path as a word of a command line: as it is, or quoted where a shell would split it. */
const pathWord = (path: string): string =>
  /^[\w./@+-]+$/.test(path) ? path : JSON.stringify(path);

/**
 * A document's outline with the reads of its tables and its code blocks named as commands
 * (ADR-0100): where the console said an address of its own for one, the command that reads it,
 * `command` being the one the pack is read with, so that an agent is told what to run.
 */
function withDataCommands(whole: BrowseResult, command: string): BrowseResult {
  const outline = whole.outline;
  if (outline?.data === undefined) {
    return whole;
  }
  const path = pathWord(outline.path);
  return {
    ...whole,
    outline: {
      ...outline,
      data: {
        ...(outline.data.rows === undefined ? {} : { rows: `${command} --rows ${path}` }),
        ...(outline.data.code === undefined ? {} : { code: `${command} --code ${path}` }),
      },
    },
  };
}

/** What a folder holds, as `browse_repo` lays it out for a model; `command` is the one the pack is read with. */
export function formatSkillBrowse(
  browsed: RestSkillBrowse,
  whole: BrowseResult | undefined,
  command = "console skills",
  owner: PackOwner = "project",
): string {
  if (browsed.status === "none" || browsed.address === null) {
    return noAddress(owner);
  }
  if (browsed.status !== "ready") {
    return refused("folder", browsed, owner);
  }
  if (whole === undefined) {
    return `${head("folder", browsed)}\nNothing was read.`;
  }
  return renderBrowseResult(withDataCommands(whole, command), CONSOLE_WORDS);
}

type ReadyRows = Extract<NonNullable<RestSkillRows["read"]>, { readonly status: "ready" }>;
type ReadyCode = Extract<NonNullable<RestSkillCode["read"]>, { readonly status: "ready" }>;

/** The pages of a read of tables, as the console answered them, as the one answer they were cut from: every table in reading order. */
export function joinRows(pages: readonly RestSkillRows[]): ReadyRows | undefined {
  const reads = pages.flatMap((page) => (page.read?.status === "ready" ? [page.read] : []));
  const first = reads[0];
  const last = reads[reads.length - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }
  return {
    ...first,
    tables: reads.flatMap((read) => read.tables),
    rowCount: reads.reduce((sum, read) => sum + read.rowCount, 0),
    nextCursor: last.nextCursor,
  };
}

/** The pages of a read of code blocks, as the one answer they were cut from: every block in reading order. */
export function joinCode(pages: readonly RestSkillCode[]): ReadyCode | undefined {
  const reads = pages.flatMap((page) => (page.read?.status === "ready" ? [page.read] : []));
  const first = reads[0];
  const last = reads[reads.length - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }
  return {
    ...first,
    blocks: reads.flatMap((read) => read.blocks),
    nextCursor: last.nextCursor,
  };
}

/** Why a read of tables or of code blocks did not happen, for the command to fail with; nothing when it did. */
export function dataRefusal(
  what: "tables" | "code blocks",
  read: RestSkillRows | RestSkillCode,
  owner: PackOwner = "project",
): string | undefined {
  if (read.status === "none" || read.address === null) {
    return noAddress(owner);
  }
  return read.status === "ready" ? undefined : refused(what, read, owner);
}

const counted = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

/** The tables as one CSV: a header of `path`, `heading` and every column name, then a line per row (`rowsCsv` of `@skillcdn/core`). */
export const csvOfRows = (whole: ReadyRows): string => rowsCsv(whole.tables);

/**
 * The tables as an array of rows, each with its file, the section it stands in and its cells by
 * column name, in the order of the columns: what `skillcdn rows --format json` prints. A name
 * a table has twice keeps its first cell.
 */
export function jsonOfRows(whole: ReadyRows): string {
  const rows = whole.tables.flatMap((table) =>
    table.rows.map((row) => {
      const cells: Record<string, string> = {};
      table.columns.forEach((column, at) => {
        if (!Object.hasOwn(cells, column)) {
          cells[column] = row[at] ?? "";
        }
      });
      return { path: table.path, heading: table.heading.join(" > "), cells };
    }),
  );
  return JSON.stringify(rows, null, 2);
}

/** What a read of tables held, in the words the skillcdn command says it was written in. */
export const describeRows = (whole: ReadyRows): string =>
  `${counted(whole.rowCount, "row")} of ${counted(whole.tables.length, "table")}`;

/**
 * The code blocks as written, each under a line that names its file, the section it stands in
 * and what it says it is written in, a blank line between two: as `skillcdn code` prints them.
 */
export function textOfCode(blocks: ReadyCode["blocks"]): string {
  return blocks
    .map(
      (block) =>
        `--- ${block.path}${block.heading.length === 0 ? "" : ` > ${block.heading.join(" > ")}`}${block.language.length === 0 ? "" : ` (${block.language})`} ---\n${block.text}\n`,
    )
    .join("\n");
}

/** What a read of code blocks held, in the words the skillcdn command says it was written in. */
export const describeCode = (blocks: ReadyCode["blocks"]): string =>
  counted(blocks.length, "code block");

/** What words found, as `search_repo` lays it out for a model, one page of it. */
export function formatSkillFind(
  found: RestSkillFind,
  summary: PackSummary | undefined,
  owner: PackOwner = "project",
): string {
  if (found.status === "none" || found.address === null) {
    return noAddress(owner);
  }
  if (found.status !== "ready" || found.read?.status !== "ready" || summary === undefined) {
    return refused("search", found, owner);
  }
  return renderFindResult(findResultOf(found.read, summary), CONSOLE_WORDS);
}

/**
 * One page of a file as the console answered it, or the folder the path named; nothing when
 * the pack did not answer. The length asked for travels with the result, as the skillcdn
 * command passes it, so that a range that came whole says where the file continues.
 */
export function fileOf(
  page: RestSkillFile,
  summary: PackSummary,
  requested: number | undefined,
): FileResult | DirectoryResult | undefined {
  const read = page.read;
  if (read === null) {
    return undefined;
  }
  if (read.kind === "directory") {
    return directoryResultOf(read, summary);
  }
  const file = fileResultOf(read, summary);
  return file === undefined ? undefined : { ...file, requestedLength: requested };
}

/** A page of a file as `read_repo_file` lays it out for a model; or what the folder holds. */
export function formatSkillFile(
  read: RestSkillFile,
  whole: FileResult | DirectoryResult | undefined,
  owner: PackOwner = "project",
): string {
  if (read.status === "none" || read.address === null) {
    return noAddress(owner);
  }
  if (read.status !== "ready") {
    return refused("file", read, owner);
  }
  if (whole === undefined) {
    return `${head("file", read)}\nNothing was read.`;
  }
  return "entries" in whole ? renderDirectoryResult(whole) : renderFileResult(whole, CONSOLE_WORDS);
}
