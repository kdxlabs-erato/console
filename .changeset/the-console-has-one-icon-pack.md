---
"@skillcdn/console": patch
---

The console has an icon pack ([ADR-0142](https://github.com/skillcdn/console/blob/main/docs/adr/0142-the-console-has-one-icon-pack-drawn-on-one-grid-and-used-by-name.md)): some eighty glyphs drawn on one grid of twenty with one stroke, for the console's pages, a page of your own, a plugin's and a prototype, so that an icon is taken by its name and not chosen or drawn anew wherever one is needed.

- `Icon` draws a glyph by its `name` in the colour of the text around it, at `xs`, `sm`, `md` or `lg`, hidden from a screen reader beside words and a named picture with a `label`. `ICON_NAMES`, `IconName` and `isIconName` say what the pack holds, `ICON_GROUP_LIST` its groups.
- `IconPicker` chooses one, or none: a field that shows the choice and opens the pack under it, found by a glyph's name or by the words a language pack gives it (`icons.words`, with `findIcons`), and worked whole with the keys.
- `@skillcdn/console/icons` is the pack on its own, with no dependency, for a plugin's plain bundle: `iconElement(name, { size, label })` makes the element, and `GLYPHS` is the data.
- The look is a part, `icon` (`sc-icon*`), in `console.css` and in the catalogue; a custom console's own stylesheet that drew `.sc-menu-caret`, the dots of a card's menu, a column's fold or a session's device by their element inside the page's class now meets the pack's `sc-icon` there instead.
- The pages draw the glyphs they drew before from the pack. A column's fold is a shade lighter than it was; the others are as they were.

The language packs gain `icons` (the picker's words, the groups' names and each glyph's search words) and `projects.form.icon`: a pack of your own needs them.
