---
"@skillcdn/console": patch
---

The `panel` part has a variant, `sc-panel-small`: one pane of many in a list, a step closer in and a step less round (`padding` 1rem 1.25rem, the large radius), and on a phone any pane. A plugin's page may name it like any other part.

Six classes of the console's own pages drew the glass of a pane for themselves and now wear the part instead: a decision (`sc-panel`), a run, a comment and the front page's bar while it is arranged (`sc-panel sc-panel-small`), a team's card and the sign-in pane (`sc-panel`, each keeping its own padding). They look as they did, but for one thing: on a phone a team's card and the sign-in pane round their corners as every other pane does there, 12px instead of 20px. `sc-decision`, `sc-run`, `sc-comment`, `sc-home-bar`, `sc-team-card` and `sc-sign-in` no longer draw a look of their own; a stylesheet of your own that leaned on them for the glass finds it on `sc-panel` now.
