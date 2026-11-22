---
"@skillcdn/console": patch
---

A plugin writes a Korean word with the particle its ending takes, as the console's own Korean does (ADR-0137): `asObject` (을/를), `asSubject` (이/가) and `asWay` (으로/로) are exported from `@skillcdn/console/plugin`, for what a server module writes for people, and from `@skillcdn/console/plugin/web`, for a page's words. They are the functions the console's Korean pack is written with, so a decision's question or a page's line of a plugin reads as the console's sentences beside it do, where a plugin wrote both forms, "을(를)", or kept a rule of its own. They are bundled with the plugin as the rest of the two entry points is, and ask nothing of the console the plugin runs on.
