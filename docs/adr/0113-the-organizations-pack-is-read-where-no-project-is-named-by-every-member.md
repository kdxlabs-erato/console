# ADR-0113: The organization's pack is read where no project is named, by every member

- Status: Accepted
- Date: 2026-11-15
- Builds on [ADR-0028](0028-the-console-reads-a-projects-pack-through-the-deployments-rest-api-with-a-pack-token-for-a-private-one.md), [ADR-0031](0031-the-console-reads-a-pack-as-the-skillcdn-command-does-and-a-local-one-from-a-directory.md) and [ADR-0036](0036-a-private-pack-is-connected-with-a-code-a-person-approves-from-the-projects-settings.md). The contract is in [specs/rest.md](../specs/rest.md#get-apiv1workspaceskills-skillsone-skillsfile-skillsbrowse-skillsfind-skillsrows-and-skillscode) and [specs/cli.md](../specs/cli.md#the-project).

## Context

A pack is read through the console as a project's: at the project's own address, or, for a project that names none, at the organization's, with the workspace's SkillCDN token where that pack is private. Every read was a route of a project, and `console skills` in a directory that named no project answered that a project had to be said.

The directories that name no project are the ones an agent starts in. An agent account's desk names none ([ADR-0088](0088-an-agent-account-has-a-desk-and-is-set-up-from-an-invitation-by-signing-in-as-itself.md)). A folder a repository is about to be made in names none, and the skill that sets a repository up and binds it to a project is in the pack: to find it through the console, an agent had to pick a project first, with `--project`, which is the flag a bound checkout is told never to use. The organization's rules, which every member reads from anywhere, tell every agent to load the skill that fits the work; in those directories the command it was told to use refused.

## Decision

1. **The organization's pack has routes of its own**, `/api/v1/workspace/skills` and under it `one`, `file`, `browse`, `find`, `rows` and `code`: the seven reads of a project's pack, one for one, with the same queries, bounds, envelope and bodies, served by the same handlers. The pack is the one at the console's own address, read with the workspace's SkillCDN token where it is private; a console that names no address answers `none`.
2. **Every member of the workspace reads it**, signed in or through their agent's token, a person and an agent account alike, whatever projects they are in. Whoever is out, deactivated or no longer let in, reads none of it, by a session or by a token; neither does whoever is not signed in. It is the standing the workspace's rules are read with, which name these skills.
3. **`console skills` and `console skill` read it where no project is named**: no `--project`, no `CONSOLE_PROJECT`, no file in the directory or above it. Every form reads it as it reads a project's. The answer begins with a line that says whose pack it is and how a project's own is read; `--rows`, `--code` and `--json`, which a program takes, carry no such line. The words of a read the pack refused name the workspace's token and an administrator, where a project's name the project's and an owner.
4. **Where a project is named, nothing changes**: its pack is read, by whoever may see the project, with the token that pack is read with.
5. **A console from before has no such routes**, and the command says so, with what still reads a pack there, where the console's own answer would read as a missing skill.
6. **A plugin's own skills are untouched**: they are a pack in the plugin's package, read through the plugin.

## Consequences

- An agent in a desk, and one in a folder with nothing in it yet, finds and loads the organization's skills with the command it is told to use, and binds a checkout afterwards. `--project` stays what it was: a way to read another project's pack on purpose.
- This is a permission the console did not give before, and it is a narrow one to state: a member who may see no project that reads the organization's pack can now read that pack. In a workspace whose every project reads the organization's pack, which is the default, nothing more is read than before. In one that lets people in for a single project with a pack of its own, those people now read the organization's pack too; an organization whose pack is not for every member it lets in keeps that pack as a project's own address, read by that project's members, and leaves the console's address for what every member may read.
- The reads are logged as a project's are, with who read which path of which pack and no project, never with what was read or with the token.
- The token's standing does not change: the workspace's token is still set, connected and taken away by an administrator, shown to nobody, and sent to the deployment and nowhere else.
- Rejected: having the command pick a project the member is in and read its pack (a command that picks is a command that picks wrong, and which pack was read would depend on the order of a list); letting only those read it who may see a project that reads it (no new standing at all, at the price of a rule nobody can say in a sentence and a query on every read; kept as the way to narrow this, should a workspace need it); a setting per workspace for who reads the organization's pack (a knob before anyone asked for one); answering the pack's listing to anyone and the reads to members (the listing of a private pack is its table of contents).
