---
"@skillcdn/console": patch
---

Breaking: the console's rules always hold, and an organization adds to them where it rewrote them whole (ADR-0120). No organization had written its own, and a rewritten whole would have stopped following the console's version. An administrator now writes what the organization adds, read after the console's rules and before a project's; an addition holds where it differs from what stands before it, and none takes back what the console's rules say never happens.

- `GET /api/v1/rules`, and the workspace's half of a project's rules, keep `body` as what holds whole, the console's rules and then the additions under the heading `# What this organization adds`, so a command of 0.5.0 prints it as before. `source` is `reference` where nothing is added and `written` where something is; `page` is the additions' page. Two optional fields carry the parts apart: `own`, the console's rules, and `added`, `{ body, page }` or `null`.
- `PUT /api/v1/rules` writes the additions. A body that begins with the console's rules, the whole a client of before sends back, is written as what follows them; with nothing following, the additions are put away.
- The package exports `CONSOLE_RULES` in place of `REFERENCE_RULES`, with `rulesWith`, `addedRulesOf` and `ADDED_RULES_HEADING`; `isReferenceRules` is gone. `RulesForm` takes no `onReset`, and at the workspace it edits the additions alone, empty until something is added, with the console's rules read above it; `RulesView` shows the console's rules as they hold and the additions below them. The pack `rules` has `console`, `added`, `nothingAdded`, `add`, `readConsole` and `form.hintAdded` in place of `reference`, `writeOrganizations` and `useReference`.
- A page written before as the organization's whole rules reads as an addition from now on.
