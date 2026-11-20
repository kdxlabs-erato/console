# Documentation

The map of the documents: what each one is for and when it changes. The rules for when to update them are in the root [`AGENTS.md`](../AGENTS.md) under "Documentation protocol".

| Document | Purpose | Lifecycle |
|---|---|---|
| [`../README.md`](../README.md) | What the console is, for someone who has never seen it, and how it is installed. | Overview only. Details live below. |
| [`architecture.md`](architecture.md) | How the console is built: the parts, the boundaries, the data, the security model, and what is still open. | Living. Always describes the current design. |
| [`roadmap.md`](roadmap.md) | What exists, what is being built now, what comes next. | Living. Updated when a milestone item starts, finishes or is dropped. |
| [`specs/`](specs/) | The contracts: the REST API of the board ([`rest.md`](specs/rest.md)), the command line ([`cli.md`](specs/cli.md)), plugins ([`plugins.md`](specs/plugins.md)), the runner of an agent account ([`runner.md`](specs/runner.md)), a desk's records ([`records.md`](specs/records.md)). | Living and normative. Where the README and a spec disagree, the spec wins and the README is fixed. |
| [`adr/`](adr/) | Decisions with lasting consequences, and why; [`adr/README.md`](adr/README.md) lists them. | Append-only. An accepted ADR is superseded, never edited. |
| [`../skills/`](../skills/) | The console's skills in the SkillCDN Format: how an agent works the board, plans it, builds a console or a plugin, deploys one, runs an agent account, keeps a desk. The package carries them as they are. | Living. Read again by hand when what they name changes. |
| [`../SKILLCDN.md`](../SKILLCDN.md) | This repository as a pack: the name and the description an agent is told, the folders served (the skills and these documents), and the rules for every skill. | Living. |
| [`../deploy/README.md`](../deploy/README.md) | Building, configuring and releasing the image; the contract with whoever operates it. | Living. |
| `apps/console/README.md`, `packages/console/README.md` | What the workspace is for, its surface, how to work on it, the data model, and under "Rules" the rules for changing it. | Living. |
| [`../packages/console/src/styles/README.md`](../packages/console/src/styles/README.md) | The rules for the pages and the catalogue of the parts they are built from. | Living. A part added, changed or taken out changes its row. |
| [`../packages/console/icons/README.md`](../packages/console/icons/README.md) | For whoever draws the icon pack: the grid's rules, how a glyph is changed or added, and where it is looked at. | Living. A rule of the grid changed changes it. |
| [`../AGENTS.md`](../AGENTS.md) | The working agreement: the rules for changing the code, for agents and people. | Living. Short. |
| `CLAUDE.md` at the root | Imports `AGENTS.md` for Claude Code, and holds nothing else; `.claude/rules/` points it at the rules of a workspace and of the pages when it opens a file there. | Fixed. |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md), [`../SECURITY.md`](../SECURITY.md) | How to contribute, and how to report a vulnerability. | Living. |
| `packages/console/CHANGELOG.md` | What each release of the package changed, from the changesets, for whoever installs it. | Written by the release workflow, never by hand. |

## Principles

- **Write for a reader with no context.** The next contributor, a person or an agent, starts from the repository alone.
- **Facts and decisions, not history or essays.** Git history is the changelog.
- **One home per fact.** Link instead of repeating.
- **This repository is public.** Operations details, business reasoning and comparisons with other products do not belong here.
