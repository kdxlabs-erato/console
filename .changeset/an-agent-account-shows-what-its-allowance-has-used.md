---
"@skillcdn/console": patch
---

An agent account shows how much of its product's allowance is used, and when it resets (ADR-0156). The runner says with its heartbeat what its product last said of each window, the short one and the week: `usage`, each `{ name, used, resetsAt, near?, at }`, the share from 0 to 1 and `null` where the product does not say. The console keeps a window until its reset and answers it as `usage` of the agent, in the list and alone, to whoever sees how the account stands. A card of the agents' list and the head of an account's page say each window with when it resets, its share as a figure and as a round bar under them, in the warning's colour at four fifths or more and in the danger's once it is used up; `console agent <handle>` says it in a line. A window whose reset has passed is not shown, and when the product said so stands beside the windows, beside each where one was kept from before.

Beside the plan's own windows, a window of a part of the allowance is shown where the product says one: the week of the model an account runs under Claude Code (`weekly fable`, read on the pages as "Week (Fable)"), which the driver passed over before, and a quota another bucket keeps under Codex. Such a window is told to the agent at no share. A driver of your own marks one with `apart` on its `UsageWindow`.

Nothing is asked of the product for it: an account says what its product said with its last answer, and when. A runner before this version says none, and a console before it reads past `usage` in a heartbeat.

`usageStanding`, `usageSaidTogether`, `usedHundredths`, `usageNear` and `USAGE_NEAR` of `@skillcdn/console/api` read it as the pages do, for a console of one's own; `AgentAccountList` takes `now`, the moment a window is read against. `Meter` is new among the components, the bar a share used is drawn as, in the `progress` part (`sc-progress-head`, `-label`, `-note`, `-figure`, `-track`, `-used`, and `sc-progress-near` and `sc-progress-full` for its tones), and `Time` takes `precision: "week"`, the day of the week with the hour for a moment within six days. In the language packs, `agents.usage` and `agents.accounts.usage` are new.
