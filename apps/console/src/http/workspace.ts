import type { RestWorkspace } from "@skillcdn/console/api";
import type { WorkspaceRecord, WorkspaceSettings } from "../db/queries/workspaces.js";

/**
 * The workspace as the API answers it: in `me`, and from every route that changes one of its
 * settings or its SkillCDN token, so that the pages hold the same shape wherever it comes from.
 */
export function restWorkspace(
  found: WorkspaceRecord,
  settings: WorkspaceSettings,
  skills: { readonly source: string; readonly address: string | undefined },
  tokenDaysAtMost: number | undefined,
): RestWorkspace {
  return {
    name: found.name,
    handle: settings.handle,
    domain: settings.domain,
    services: { ...settings.services },
    tokenDaysAtMost: tokenDaysAtMost ?? null,
    skills: {
      source: skills.source,
      address: skills.address ?? null,
      packToken:
        settings.packTokenSetAt === null ? null : { setAt: settings.packTokenSetAt.toISOString() },
    },
    peopleVisibility: settings.peopleVisibility,
    weekStart: settings.weekStart,
    timeZone: settings.timeZone,
    language: settings.language,
  };
}

/**
 * The workspace as nobody signed in is told of it: its name, and the language it speaks to
 * whoever has none, which are what the sign-in page shows beside the ways in. Nothing else of
 * it: not its short name, its domain and the services its agents work with (ADR-0089), which
 * say what its accounts are named and where they are kept; not how long a token may last, where
 * its skills are read or with what, who sees whom, the day its weeks begin or its time zone,
 * which are its members' to read and say how the organization is set up. The two keys every
 * answer has, `tokenDaysAtMost` and `skills`, are there and say nothing, so that a console
 * built on any version of the package still reads the answer; the rest are read as optional.
 */
export function restWorkspaceForNobody(workspace: RestWorkspace): RestWorkspace {
  return {
    name: workspace.name,
    tokenDaysAtMost: null,
    skills: { source: "", address: null },
    ...(workspace.language === undefined ? {} : { language: workspace.language }),
  };
}
