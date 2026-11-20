import { GLYPHS, type GlyphShape, ICON_GRID, ICON_GROUPS } from "./glyphs.js";

// The icon pack (ADR-0142): the glyphs the console's pages, a plugin's pages and a prototype
// draw by name, so that an icon is not chosen or drawn anew wherever one is needed. A glyph is a
// file under `packages/console/icons`, drawn on one grid with one stroke, and `glyphs.ts` beside
// this module is what `pnpm icons` writes from that folder: shapes as data, which `Icon` draws as
// elements. Nothing here reads a glyph from anywhere else, and a name is checked against the
// pack wherever one arrives from outside.

export { GLYPHS, type GlyphShape, type GlyphTag, ICON_GRID, ICON_GROUPS } from "./glyphs.js";

/** The name of a glyph of the pack. */
export type IconName = keyof typeof GLYPHS;

/** Every glyph of the pack by name, in the order of the names. */
export const ICON_NAMES = Object.keys(GLYPHS) as readonly IconName[];

/** Whether a value names a glyph of the pack. */
export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && Object.hasOwn(GLYPHS, value);
}

/** A group of the pack: its key, and its glyphs in the order they are shown. */
export interface IconGroup {
  readonly key: string;
  readonly icons: readonly IconName[];
}

/** The groups the glyphs stand in, in the order a picker and the catalogue show them. */
export const ICON_GROUP_LIST: readonly IconGroup[] = ICON_GROUPS;

/**
 * The glyphs a person's words find, in the order the pack shows them, those whose name begins
 * with the words first. Every word typed has to be in a glyph's name or among the words a
 * language pack gives it (`icons.words`), whatever its case. Words that are empty find every
 * glyph.
 */
export function findIcons(
  query: string,
  words: Readonly<Record<string, string>> = {},
): readonly IconName[] {
  const all = ICON_GROUP_LIST.flatMap((group) => group.icons);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return all;
  }
  const whole = terms.join(" ");
  const found = all.filter((name) => {
    const spoken = Object.hasOwn(words, name) ? (words[name] ?? "") : "";
    const hay = `${name} ${name.replaceAll("-", " ")} ${spoken}`.toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
  const begins = (name: string): boolean =>
    name.startsWith(whole) || name.replaceAll("-", " ").startsWith(whole);
  return [...found.filter(begins), ...found.filter((name) => !begins(name))];
}

/**
 * Where a choice stands among a picker's choices while nothing is searched: none first, then
 * the glyphs in the order the pack shows them. A picker opens with the choice in hand there.
 */
export function iconPlace(value: IconName | null): number {
  return value === null ? 0 : 1 + ICON_GROUP_LIST.flatMap((group) => group.icons).indexOf(value);
}

/** One section of a picker's choices: how many it holds, and how many stand on a row. */
export interface IconSection {
  readonly size: number;
  readonly columns: number;
}

/**
 * Where a key moves among a picker's choices, which stand in sections one under the other, each
 * a grid of its own: the place of the choice the key leads to, counted through the sections;
 * `-1` for a key that leads up out of the first row, back to the field the words are typed in;
 * nothing for a key that moves nowhere. `at` is where the choice in hand stands, `-1` in the
 * field. Left and right go through the choices in order; up and down keep the column, into the
 * section above or below where a section ends, and to its last choice where a row is short.
 */
export function iconStep(
  sections: readonly IconSection[],
  at: number,
  key: string,
): number | undefined {
  const filled = sections.filter((section) => section.size > 0);
  const total = filled.reduce((sum, section) => sum + section.size, 0);
  if (total === 0) {
    return undefined;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return total - 1;
  }
  if (at < 0) {
    return key === "ArrowDown" ? 0 : undefined;
  }
  if (key === "ArrowRight") {
    return at + 1 < total ? at + 1 : undefined;
  }
  if (key === "ArrowLeft") {
    return at > 0 ? at - 1 : undefined;
  }
  if (key !== "ArrowDown" && key !== "ArrowUp") {
    return undefined;
  }
  let first = 0;
  for (const [index, section] of filled.entries()) {
    if (at >= first + section.size) {
      first += section.size;
      continue;
    }
    const columns = Math.max(1, section.columns);
    const place = at - first;
    const column = place % columns;
    if (key === "ArrowDown") {
      const lastRow = Math.floor((section.size - 1) / columns);
      if (Math.floor(place / columns) < lastRow) {
        return first + Math.min(place + columns, section.size - 1);
      }
      const below = filled[index + 1];
      return below === undefined
        ? undefined
        : first + section.size + Math.min(column, below.size - 1, Math.max(1, below.columns) - 1);
    }
    if (place >= columns) {
      return at - columns;
    }
    const above = filled[index - 1];
    if (above === undefined) {
      return -1;
    }
    const aboveColumns = Math.max(1, above.columns);
    const lastRowStart = Math.floor((above.size - 1) / aboveColumns) * aboveColumns;
    return first - above.size + Math.min(lastRowStart + column, above.size - 1);
  }
  return undefined;
}

/** The sides a glyph is drawn at, by the name of its size, as the stylesheet has them. */
const SIZE_CLASSES = {
  xs: "sc-icon-xs",
  sm: "sc-icon-sm",
  md: "sc-icon-md",
  lg: "sc-icon-lg",
} as const;

/**
 * A glyph as an element, for a page that is not React's: what a plugin's bundle or a prototype
 * puts where it wants an icon (`node.append(iconElement("calendar"))`). Drawn as `Icon` draws
 * it, from the pack's data and never from markup, in the colour of the text around it; hidden
 * from a screen reader unless it is given a label. `doc` is the page's document.
 */
export function iconElement(
  name: IconName,
  options: {
    readonly size?: keyof typeof SIZE_CLASSES | undefined;
    readonly label?: string | undefined;
  } = {},
  doc: Document = document,
): SVGSVGElement {
  const space = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(space, "svg");
  const says: Readonly<Record<string, string>> = {
    class: `sc-icon ${SIZE_CLASSES[options.size ?? "md"]}`,
    viewBox: `0 0 ${ICON_GRID} ${ICON_GRID}`,
    width: String(ICON_GRID),
    height: String(ICON_GRID),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    focusable: "false",
  };
  for (const [attribute, value] of Object.entries(says)) {
    svg.setAttribute(attribute, value);
  }
  if (options.label !== undefined && options.label.length > 0) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", options.label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  const shapes: readonly GlyphShape[] = isIconName(name) ? GLYPHS[name] : [];
  for (const [tag, measures] of shapes) {
    const shape = doc.createElementNS(space, tag);
    for (const [attribute, value] of Object.entries(measures)) {
      shape.setAttribute(attribute, value);
    }
    svg.append(shape);
  }
  return svg;
}
