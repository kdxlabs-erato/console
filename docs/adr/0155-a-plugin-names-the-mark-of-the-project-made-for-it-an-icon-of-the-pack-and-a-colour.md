# ADR-0155: A plugin names the mark of the project made for it, an icon of the pack and a colour

- Status: Accepted
- Date: 2026-11-24
- Adds to [ADR-0052](0052-a-plugins-board-is-a-project-made-or-chosen-when-it-is-enabled-and-what-it-puts-there-carries-its-name.md), under which the project made for a plugin begins with the key, the name and the description its manifest proposes, and builds on [ADR-0142](0142-the-console-has-one-icon-pack-drawn-on-one-grid-and-used-by-name.md), point 6, a project's mark as an icon of the pack. Nothing of either is taken back.

## Context

A project made for a plugin when it is enabled began with the mark every project has without one: the first letter of its name on a colour chosen from its key. On a console with several plugins their projects stood among the others by a letter each, and an administrator who wanted one to read as its plugin's opened the project's settings afterwards and chose an icon and a colour there, for every plugin and on every console.

Whoever writes a plugin knows what its feature is. The console has an icon pack whose names are the work of an organization (`leave`, `finance`, `customer`), and a vocabulary of colours a project's mark is chosen from. Nothing let a manifest name either.

## Decision

1. **`board.defaults` takes `glyph` and `color`, each left out for none.** `glyph` is an icon of the console's pack by its name, `color` one of the vocabulary's colours by its name (`gray`, `blue`, `green`, `orange`, `pink`, `purple`, `teal`, `yellow`). They are the mark of the project an administrator may make for the plugin, and of nothing else: a plugin's tab, its menu and its settings page show no mark by them.
2. **They are defaults, as the key and the name are.** The form that enables the plugin begins with them and shows the mark as it will be, for the administrator to keep or change, with the icon picker and the colours a project's own form has; `console plugin <key> enable --board new` sends them as named. A project that exists, chosen in the form or by `--board <key>`, keeps its own mark.
3. **The manifest holds an icon and a colour to how a name is spelled, and the console to what it has.** The pack and the colours are the console's and grow; a plugin is one package for consoles of several versions. A name a console does not have is none there (`boardDefaults.glyph` or `.color` answered `null`), and the plugin runs. What is sent to make the project (`board.create.glyph` and `.color`) is held to the pack and the vocabulary, as a project's own form is.
4. **No symbol and no image.** The symbol is the first letter of the name unless the administrator writes one. An image would be a file a plugin brought, shown on the console's own pages outside its frame ([ADR-0054](0054-a-plugins-pages-run-in-a-sandboxed-frame-and-speak-only-to-their-plugin.md)): an administrator gives the project one, as an owner does.

## Consequences

- **A plugin that names a mark runs on consoles from 0.6.1.** A console before reads `board.defaults` strictly and refuses a key it does not know, so such a manifest's `console` begins there (`>=0.6.1`).
- **The REST answer grows by two fields a reader may not find.** `boardDefaults.color` and `.glyph` are answered from 0.6.1 and read as optional: a page or a command against a console of before reads none and sends none, and the form offers no mark there, since that console would make the project without the one shown.
- **What `--board new` would make is said beforehand.** `console plugin <key>` names the project a plugin proposes, with its mark, while it has none.
- **The names of the pack are surface for plugins too.** A glyph is redrawn freely under its name; one taken out of the pack turns the default of a plugin that named it into none, with the `Breaking:` entry ADR-0142 already asks for.
- **Rejected:** holding the manifest's icon to the pack, or its colour to the vocabulary (a plugin written beside a later console would be refused whole by one of before, for a picture); a colour of the plugin's own, as a value (a colour is written in the tokens alone, [ADR-0106](0106-a-look-is-a-part-with-a-file-and-a-row-and-a-page-places-its-parts.md)); the mark set on a project that exists when a plugin is bound to it (it is somebody's choice already, and several plugins may share one project); a mark of the plugin itself, on its tab or in a list of plugins, which nothing asked for yet.
