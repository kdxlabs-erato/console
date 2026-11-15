import {
  addedRulesOf,
  CONSOLE_RULES,
  RULES_PATH,
  RULES_TITLE,
  type RulesSource,
  rulesWith,
} from "@skillcdn/console/api";
import type { Database } from "../client.js";
import {
  type DocumentRecord,
  type DocumentScope,
  getDocument,
  setArchived,
  writeDocument,
} from "./documents.js";
import type { Actor } from "./events.js";

// The rules of the board (ADR-0023, ADR-0120): the console's, which always hold and are the
// package's text, and what is added to them on a page at `rules`, the workspace's own or a
// project's, kept as any page is, with its versions, and read apart. Nothing of the console's
// rules is ever written to a row: they are answered as they stand, so that they follow the
// console's version, and a text sent as the whole is taken for what it adds.

export interface RulesRecord {
  readonly source: RulesSource;
  /**
   * The rules as they hold: at the workspace the console's with what the organization adds,
   * whole; in a project what it adds; nothing for a project that adds none.
   */
  readonly body: string | undefined;
  /** The page what is added is written on, or nothing where nothing is added. */
  readonly page: DocumentRecord | undefined;
  /** At the workspace: the console's rules by themselves. */
  readonly own?: string | undefined;
  /** At the workspace: what the organization adds, with its page; `null` where it adds nothing. */
  readonly added?: { readonly body: string; readonly page: DocumentRecord } | null | undefined;
}

/**
 * What holds in a scope. At the workspace: the console's rules, with the page written and not
 * put away as what the organization adds to them. In a project: its page, or none.
 */
export async function readRules(database: Database, scope: DocumentScope): Promise<RulesRecord> {
  const page = await getDocument(database, scope, RULES_PATH);
  const written = page !== undefined && page.archivedAt === undefined ? page : undefined;
  if (scope.projectId !== null) {
    return written === undefined
      ? { source: "none", body: undefined, page: undefined }
      : { source: "written", body: written.body, page: written };
  }
  return written === undefined
    ? {
        source: "reference",
        body: rulesWith(undefined),
        page: undefined,
        own: CONSOLE_RULES,
        added: null,
      }
    : {
        source: "written",
        body: rulesWith(written.body),
        page: written,
        own: CONSOLE_RULES,
        added: { body: written.body, page: written },
      };
}

/**
 * Writes what a scope adds to the rules as a version of its page, bringing the page back when
 * it was put away. At the workspace a text that carries the console's rules whole, as a command
 * or a page of before read them and sends them back, is written as what stands before and
 * after them: a copy of the console's rules would stop following the console's version. With
 * nothing beside them, nothing is added: what was added is put away.
 */
export async function writeRules(
  database: Database,
  input: {
    readonly scope: DocumentScope;
    readonly actor: Actor;
    readonly body: string;
    readonly baseVersion?: number | undefined;
    readonly maxVersions: number;
    readonly now: Date;
  },
): Promise<RulesRecord> {
  const { scope } = input;
  const body = scope.projectId === null ? addedRulesOf(input.body) : input.body;
  if (scope.projectId === null && body.length === 0) {
    return archiveRules(database, { scope, actor: input.actor, now: input.now });
  }
  await writeDocument(database, {
    scope,
    actor: input.actor,
    path: RULES_PATH,
    title: RULES_TITLE,
    body,
    baseVersion: input.baseVersion,
    restoreArchived: true,
    maxVersions: input.maxVersions,
    now: input.now,
  });
  return readRules(database, scope);
}

/** Puts what a scope adds to the rules away, so that the rules before it stand alone; nothing where nothing is added. */
export async function archiveRules(
  database: Database,
  input: { readonly scope: DocumentScope; readonly actor: Actor; readonly now: Date },
): Promise<RulesRecord> {
  const current = await readRules(database, input.scope);
  if (current.source === "written") {
    await setArchived(database, {
      scope: input.scope,
      actor: input.actor,
      path: RULES_PATH,
      archived: true,
      now: input.now,
    });
  }
  return readRules(database, input.scope);
}
