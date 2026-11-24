---
"@skillcdn/console": patch
---

A plugin names the mark of the project made for it (ADR-0155). `board.defaults` in `console-plugin.json` takes `glyph`, an icon of the console's pack by its name (`leave`, `finance`, `customer`), and `color`, one of `gray`, `blue`, `green`, `orange`, `pink`, `purple`, `teal`, `yellow`, each left out for none. `console plugin <key>` says the project `enable --board new` would make, with its mark, while the plugin has none. The form that enables the plugin begins the project to make with them and shows the mark as it will be, beside the icon picker and the colours of a project's own form, and `console plugin <key> enable --board new` sends them as named. A project that exists and is chosen keeps its own mark.

A manifest that names either runs on consoles from this version, and says so in `console` (`>=0.6.1`): a console before refuses a key of `board.defaults` it does not know. An icon the pack of a console does not have, or a colour it does not know, is none there, and the plugin runs. The form offers the mark where the console answers one, so that nothing is shown that a console of before would not make.

`GET /api/v1/plugins/<key>` answers `boardDefaults.color` and `.glyph`, `null` for none, and `POST .../enable` takes `board.create.color` and `.glyph`, held as a project's own are. `PLUGIN_GLYPH_PATTERN` and `PLUGIN_COLOR_PATTERN` of `@skillcdn/console/plugin` are how a manifest spells an icon's name and a colour's.
