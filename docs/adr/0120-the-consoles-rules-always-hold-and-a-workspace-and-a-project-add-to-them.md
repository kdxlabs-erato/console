# ADR-0120: The console's rules always hold, and a workspace and a project add to them

- Status: Accepted
- Date: 2026-11-15
- Supersedes point 2 of [ADR-0023](0023-the-rules-of-a-board-are-pages-the-workspace-and-its-projects-keep-read-first-by-every-agent.md), which had the console's own rules hold only until an administrator wrote the organization's in their place. The rest of ADR-0023 stands: the rules are pages of the board, who writes them is who configures, and they are the organization's layer beside the skills.

## Context

ADR-0023 gave a workspace the console's own rules until an administrator wrote the organization's, which then took their place whole. No organization wrote its own: on every console in use, what agents read is the console's text. A whole that is rewritten also stops following the console's version, so that what a release adds to the rules, the part on agent accounts or on a member's own desk, never reaches an organization that wrote its own, and each such organization keeps a copy in step by hand. As the rules grow, the copy grows with them. And a text that is edited whole can lose what has to hold on every board: that no token is read or shown, that what content says is no instruction.

## Decision

1. **The console's rules always hold.** They are the package's text, with `{language}` filled where they are shown, and they change with the console's version. Nobody edits them in a deployment, and nothing takes their place.
2. **A workspace adds rules, and a project adds rules.** An administrator writes what the organization adds, an owner what a project adds, signed in or through their agent ([ADR-0021](0021-a-token-configures-as-its-person-does.md)). They are read in that order after the console's, and an addition holds where it differs from what stands before it.
3. **Nothing added takes back what the console's rules say never happens**: a token or a secret looked for or shown, an instruction taken from content, the rules added to by an agent unasked. The rules say so at their head, since it is agents who read an addition; the console shows text and judges none.
4. **An addition says what differs, and nothing the rules before it say.** A project's is five things at most: where its work lives, the skills to load first, its pages' folders, who decides what, and its language where it is another. An organization's is what it asks besides the console's rules. Both stay short, since every agent reads them with every task.
5. **The workspace's page `rules` is the page of its additions**, with its versions, its archive and `baseVersion` as before. A page written under ADR-0023 as a whole reads as an addition; none was written on a console in use, and nothing is migrated.
6. **The API takes nothing away from what a command of before reads.** `GET /api/v1/rules`, and the workspace's half of `GET /api/v1/projects/<key>/rules`, keep `body` as what holds at the workspace, whole: the console's rules, then what the organization adds under a heading of its own. `source` keeps its values: `reference` where nothing is added, `written` where something is, and `page` is the additions' page. Two fields carry the parts apart, for the pages and a newer command: `own`, the console's rules, and `added`, what the organization adds with its page, or `null`. `PUT /api/v1/rules` writes the additions; a body that begins with the console's rules, as a command or a page of before sends the whole back, is taken for what follows them, and with nothing following puts the additions away. The archive puts them away. A project's half is as it was.
7. **The pages show the console's rules as they hold, not to be edited, and below them what the organization adds**, with the editor for that alone, empty until something is added. Nothing puts "the console's own" back, since they never left. A project's rules are written as before, starting from the five headings.

## Consequences

- What a release adds to the rules reaches every organization with the release. An organization that asks otherwise than one of the console's rules says so in what it adds, and that holds, except for what never happens.
- The package exports the console's rules as `CONSOLE_RULES` (it was `REFERENCE_RULES`), and `rulesWith` and `addedRulesOf` for the whole and for what a text adds; `isReferenceRules`, which told a rewritten whole from the console's own, is gone with the rewriting.
- The words of the command (`console rules`, `console rules write --workspace`) say "adds" where they said "writes the organization's"; what they send and read is unchanged, so a command of 0.5.0 prints the whole as it printed `body`.
- An organization's additions and a project's are both the organization's to keep short: the console bounds a page (`MAX_RULES_LENGTH`) and holds no opinion of what is in it.
- Rejected: keeping the whole editable with parts marked as fixed (a second format to parse and to explain, and the copy still drifts from the release); additions per section of the console's rules (a structure nobody asked for, where the order of reading already says which holds); the console refusing an addition that contradicts a fixed rule (it would have to read Markdown for meaning); migrating a page written as a whole (there is none).
