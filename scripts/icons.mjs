// The icon pack (ADR-0142; packages/console/icons/README.md): one SVG file a glyph under
// packages/console/icons, drawn on one grid, and `groups.json` beside them, which says the group
// each stands in. This script reads the folder, holds every file to the grid's rules, and writes
// what the package's `Icon` draws from, `packages/console/src/icons/glyphs.ts`: data, a glyph's
// shapes by element and measures, never markup. `pnpm icons` writes it; `pnpm check:icons`
// (`--check`, part of `pnpm check`) fails where a file breaks a rule or the written module is
// not what the folder gives.
//
// A file is read as what it is, a drawing somebody handed in: by a grammar of its own, strict
// and small. Only the shapes a line drawing is made of, only their measures, and the pack's one
// stroke; a script, a style, a link, an id, a class, a transform or anything else is refused,
// with what to do instead, since whoever reads the refusal is about to export the file again.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");

/** Where the glyphs are drawn, and where what the package draws from is written. */
export const ICONS_DIR = "packages/console/icons";
export const GLYPHS_FILE = "packages/console/src/icons/glyphs.ts";
const GROUPS_FILE = "groups.json";

/** The grid every glyph is drawn on, and the one stroke of the pack. */
export const GRID = 20;
const VIEW_BOX = `0 0 ${GRID} ${GRID}`;
const STROKE_WIDTH = "1.5";

/** The most a glyph's file is, and the most shapes it has: a glyph is a few lines. */
const MAX_FILE_BYTES = 4096;
const MAX_SHAPES = 12;
const MAX_PATH_LENGTH = 1200;

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 32;

/** The shapes a glyph is made of, each with the measures it may carry. */
const SHAPES = new Map(
  Object.entries({
    path: ["d"],
    circle: ["cx", "cy", "r"],
    ellipse: ["cx", "cy", "rx", "ry"],
    rect: ["x", "y", "width", "height", "rx", "ry"],
    line: ["x1", "y1", "x2", "y2"],
    polyline: ["points"],
    polygon: ["points"],
  }),
);

/** What a drawing tool writes of the stroke, on the root or on a shape: taken where it says the pack's own, refused otherwise. */
const STROKE = new Map(
  Object.entries({
    fill: { values: ["none"], say: 'lines only: fill="none"' },
    stroke: {
      values: ["currentColor", "currentcolor", "black", "#000", "#000000"],
      say: 'one colour, the text\'s: stroke="currentColor"',
    },
    "stroke-width": { values: [STROKE_WIDTH], say: `the pack's stroke is ${STROKE_WIDTH}` },
    "stroke-linecap": { values: ["round"], say: "the ends are round" },
    "stroke-linejoin": { values: ["round"], say: "the joins are round" },
  }),
);

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const NUMBERS = /^\s*-?(?:\d+\.?\d*|\.\d+)(?:[\s,]+-?(?:\d+\.?\d*|\.\d+))*\s*$/;
/** A path's data: the commands of a path and numbers, nothing else. */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;

/** What is wrong with a glyph's file, in words that say what to do. */
export class GlyphError extends Error {
  constructor(name, problem) {
    super(`${name}.svg ${problem}`);
    this.name = "GlyphError";
  }
}

const TAG =
  /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:][A-Za-z0-9_:.-]*\s*=\s*"[^"<>]*")*)\s*(\/?)>/y;
const ATTRIBUTE = /([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*"([^"<>]*)"/g;

/** The tags of a file in order, or a refusal: nothing but tags and the space between them. */
function tagsOf(name, source) {
  const tags = [];
  let at = 0;
  // A drawing tool's first line, the declaration of the format, says nothing of the drawing.
  const declared = /^\s*<\?xml[^?<>]*\?>/.exec(source);
  if (declared !== null) {
    at = declared[0].length;
  }
  while (at < source.length) {
    const next = source.indexOf("<", at);
    const between = source.slice(at, next === -1 ? source.length : next);
    if (between.trim().length > 0) {
      throw new GlyphError(name, "holds text outside its shapes. A glyph is shapes alone.");
    }
    if (next === -1) {
      break;
    }
    TAG.lastIndex = next;
    const found = TAG.exec(source);
    if (found === null) {
      throw new GlyphError(
        name,
        "holds something that is no plain element: a comment, a declaration, an entity or an attribute in single quotes. Export it as plain SVG: elements with double-quoted attributes and nothing else.",
      );
    }
    const attributes = new Map();
    for (const attribute of found[3].matchAll(ATTRIBUTE)) {
      if (attributes.has(attribute[1])) {
        throw new GlyphError(name, `says ${attribute[1]} twice on one element.`);
      }
      attributes.set(attribute[1], attribute[2]);
    }
    tags.push({
      tag: found[2],
      closes: found[1] === "/",
      empty: found[4] === "/",
      attributes,
    });
    at = next + found[0].length;
  }
  return tags;
}

/** Takes what an element says of the stroke where it is the pack's own, and refuses anything else. */
function withoutStroke(name, tag, attributes) {
  const rest = new Map();
  for (const [attribute, value] of attributes) {
    const stroke = STROKE.get(attribute);
    if (stroke === undefined) {
      rest.set(attribute, value);
    } else if (!stroke.values.includes(value.trim())) {
      throw new GlyphError(
        name,
        `has ${attribute}="${value}" on <${tag}>. The pack draws every glyph one way (${stroke.say}).`,
      );
    }
  }
  return rest;
}

const inGrid = (value) => NUMBER.test(value) && Number(value) >= 0 && Number(value) <= GRID;

/** One shape as the package draws it: its element and its measures, each held to the grid. */
function shapeOf(name, tag, attributes) {
  const measures = SHAPES.get(tag);
  const kept = {};
  for (const [attribute, value] of withoutStroke(name, tag, attributes)) {
    if (!measures.includes(attribute)) {
      throw new GlyphError(
        name,
        `has ${attribute} on <${tag}>. A shape carries its measures (${measures.join(", ")}) and nothing else: no id, class, style, transform or link. Flatten transforms in the drawing tool before the export.`,
      );
    }
    const text = value.trim().replaceAll(/\s+/g, " ");
    if (attribute === "d") {
      if (text.length === 0 || text.length > MAX_PATH_LENGTH || !PATH_DATA.test(text)) {
        throw new GlyphError(
          name,
          `has a path that is empty, longer than ${MAX_PATH_LENGTH} characters or written in more than commands and numbers.`,
        );
      }
    } else if (attribute === "points") {
      if (!NUMBERS.test(text) || !text.split(/[\s,]+/).every(inGrid)) {
        throw new GlyphError(name, `has points outside the grid of ${GRID} on <${tag}>.`);
      }
    } else if (!inGrid(text)) {
      throw new GlyphError(
        name,
        `has ${attribute}="${value}" on <${tag}>, which is no number within the grid of ${GRID}.`,
      );
    }
    kept[attribute] = text;
  }
  for (const needed of tag === "rect" ? ["width", "height"] : [measures[0]]) {
    if (kept[needed] === undefined) {
      throw new GlyphError(name, `has a <${tag}> without ${needed}.`);
    }
  }
  if (tag === "rect") {
    const right = Number(kept.x ?? 0) + Number(kept.width);
    const bottom = Number(kept.y ?? 0) + Number(kept.height);
    if (right > GRID || bottom > GRID) {
      throw new GlyphError(name, `has a <rect> that reaches past the grid of ${GRID}.`);
    }
  }
  // The measures in the order the element lists them, so that the written module never changes
  // with the order a tool wrote them in.
  return [tag, Object.fromEntries(measures.flatMap((m) => (m in kept ? [[m, kept[m]]] : [])))];
}

/**
 * One glyph's file as the package draws it: its shapes in order, each an element's name with its
 * measures. Throws a `GlyphError` that says what to change where the file breaks a rule.
 */
export function parseGlyph(name, source) {
  if (!NAME.test(name) || name.length > MAX_NAME_LENGTH) {
    throw new GlyphError(
      name,
      `is no name of a glyph. A name is lowercase letters and digits, words joined by a hyphen, up to ${MAX_NAME_LENGTH} characters: calendar, arrow-right.`,
    );
  }
  if (Buffer.byteLength(source) > MAX_FILE_BYTES) {
    throw new GlyphError(
      name,
      `is larger than ${MAX_FILE_BYTES} bytes. A glyph is a few lines: simplify the drawing, or the export.`,
    );
  }
  const tags = tagsOf(name, source);
  const [first, ...rest] = tags;
  const last = rest.pop();
  if (
    first === undefined ||
    first.tag !== "svg" ||
    first.closes ||
    first.empty ||
    last === undefined ||
    last.tag !== "svg" ||
    !last.closes
  ) {
    throw new GlyphError(name, "is not one <svg> element with its shapes in it.");
  }
  const root = withoutStroke(name, "svg", first.attributes);
  if ((root.get("viewBox") ?? "").trim().replaceAll(/[\s,]+/g, " ") !== VIEW_BOX) {
    throw new GlyphError(
      name,
      `is not drawn on the grid: its viewBox is "${root.get("viewBox") ?? ""}" and the pack's is "${VIEW_BOX}".`,
    );
  }
  for (const [attribute, value] of root) {
    const fine =
      attribute === "viewBox" ||
      (attribute === "xmlns" && value === "http://www.w3.org/2000/svg") ||
      ((attribute === "width" || attribute === "height") && value.trim() === String(GRID));
    if (!fine) {
      throw new GlyphError(
        name,
        `has ${attribute}="${value}" on <svg>. The root says the grid and the stroke, and nothing else.`,
      );
    }
  }
  const shapes = [];
  let depth = 0;
  for (const tag of rest) {
    if (tag.tag === "g") {
      // A group holds shapes together in a drawing tool and says nothing of its own here.
      if (withoutStroke(name, "g", tag.attributes).size > 0) {
        throw new GlyphError(
          name,
          "has a group that carries more than the stroke: a transform, an id, a class. Flatten it in the drawing tool before the export.",
        );
      }
      depth += tag.closes ? -1 : tag.empty ? 0 : 1;
      if (depth < 0) {
        throw new GlyphError(name, "closes a group it never opened.");
      }
      continue;
    }
    if (!SHAPES.has(tag.tag)) {
      throw new GlyphError(
        name,
        `has a <${tag.tag}>. A glyph is made of ${[...SHAPES.keys()].join(", ")} alone: no script, style, text, image, link, mask or definition.`,
      );
    }
    if (tag.closes || !tag.empty) {
      throw new GlyphError(
        name,
        `has a <${tag.tag}> that is not closed in itself (<${tag.tag} ... />).`,
      );
    }
    shapes.push(shapeOf(name, tag.tag, tag.attributes));
  }
  if (depth !== 0) {
    throw new GlyphError(name, "leaves a group open.");
  }
  if (shapes.length === 0 || shapes.length > MAX_SHAPES) {
    throw new GlyphError(name, `has ${shapes.length} shapes. A glyph has one to ${MAX_SHAPES}.`);
  }
  return shapes;
}

/**
 * The groups the glyphs stand in, in order, as `groups.json` says them, held to the glyphs there
 * are: every glyph in one group, and no group naming a glyph that has no file.
 */
export function parseGroups(text, names) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${GROUPS_FILE} is not readable JSON.`);
  }
  const listed = Array.isArray(json?.groups) ? json.groups : undefined;
  if (listed === undefined) {
    throw new Error(`${GROUPS_FILE} has no list of groups: { "groups": [{ "key", "icons" }] }.`);
  }
  const seen = new Set();
  const groups = [];
  for (const group of listed) {
    const key = group?.key;
    const icons = group?.icons;
    if (typeof key !== "string" || !NAME.test(key) || !Array.isArray(icons)) {
      throw new Error(
        `${GROUPS_FILE} has a group without a key in lowercase or without its icons.`,
      );
    }
    if (groups.some((other) => other.key === key)) {
      throw new Error(`${GROUPS_FILE} names the group ${key} twice.`);
    }
    for (const icon of icons) {
      if (typeof icon !== "string" || !names.includes(icon)) {
        throw new Error(
          `${GROUPS_FILE} lists ${String(icon)} in ${key}, and there is no ${String(icon)}.svg. Draw it, or take the name out.`,
        );
      }
      if (seen.has(icon)) {
        throw new Error(`${GROUPS_FILE} lists ${icon} twice. A glyph stands in one group.`);
      }
      seen.add(icon);
    }
    groups.push({ key, icons: [...icons] });
  }
  const unlisted = names.filter((name) => !seen.has(name));
  if (unlisted.length > 0) {
    throw new Error(
      `${GROUPS_FILE} lists no group for ${unlisted.join(", ")}. Add each name to the icons of the group it stands in: the picker and the catalogue show a glyph under its group.`,
    );
  }
  return groups;
}

/** The pack of a folder: every glyph by its name, in the order of the names, and the groups. */
export function readPack(dir) {
  const names = readdirSync(dir)
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.slice(0, -4))
    .sort();
  const glyphs = names.map((name) => [
    name,
    parseGlyph(name, readFileSync(join(dir, `${name}.svg`), "utf8")),
  ]);
  const groups = parseGroups(readFileSync(join(dir, GROUPS_FILE), "utf8"), names);
  return { glyphs, groups };
}

const quoted = (text) => JSON.stringify(text);

/** The module the package draws from, as text: the same text for the same folder, every time. */
export function renderPack(pack) {
  const shape = ([tag, measures]) =>
    `[${quoted(tag)}, { ${Object.entries(measures)
      .map(([name, value]) => `${name}: ${quoted(value)}`)
      .join(", ")} }]`;
  return [
    "// Written by `pnpm icons` from packages/console/icons, one SVG file a glyph. Do not edit it:",
    "// change the glyph's file, or groups.json beside it, and run `pnpm icons` again.",
    "// `pnpm check:icons` holds this module to that folder.",
    "// biome-ignore-all format: written by a script, a glyph a line",
    "",
    "/** The elements a glyph is made of. */",
    `export type GlyphTag = ${[...SHAPES.keys()].map(quoted).join(" | ")};`,
    "",
    "/** One shape of a glyph: an element by its name, with its measures on the grid. */",
    "export type GlyphShape = readonly [tag: GlyphTag, measures: Readonly<Record<string, string>>];",
    "",
    "/** The side of the grid every glyph is drawn on. */",
    `export const ICON_GRID = ${GRID};`,
    "",
    "/** Every glyph of the pack by its name: its shapes in the order they are drawn. */",
    "export const GLYPHS = {",
    ...pack.glyphs.map(([name, shapes]) => `  ${quoted(name)}: [${shapes.map(shape).join(", ")}],`),
    "} as const satisfies Readonly<Record<string, readonly GlyphShape[]>>;",
    "",
    "/** The groups the glyphs stand in, in the order a picker and the catalogue show them. */",
    "export const ICON_GROUPS = [",
    ...pack.groups.map(
      (group) => `  { key: ${quoted(group.key)}, icons: [${group.icons.map(quoted).join(", ")}] },`,
    ),
    "] as const;",
    "",
  ].join("\n");
}

function main() {
  const check = process.argv.includes("--check");
  let text;
  try {
    text = renderPack(readPack(join(root, ICONS_DIR)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  const file = join(root, GLYPHS_FILE);
  if (!check) {
    writeFileSync(file, text);
    process.stdout.write(`${GLYPHS_FILE} written.\n`);
    return;
  }
  let written;
  try {
    written = readFileSync(file, "utf8");
  } catch {
    written = undefined;
  }
  if (written?.replaceAll("\r\n", "\n") !== text) {
    process.stderr.write(
      `${GLYPHS_FILE} is not what ${ICONS_DIR} gives. Run \`pnpm icons\` and commit what it writes.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("The icon pack is what its folder gives.\n");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
