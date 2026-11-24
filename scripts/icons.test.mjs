// What the icon pack's reader takes and refuses (scripts/icons.mjs): a glyph's file is a drawing
// somebody handed in, and is read as such. Run by `pnpm check:icons` and by `pnpm check`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
// biome-ignore lint/correctness/useImportExtensions: the module beside this one is .mjs, as every script here is
import { GlyphError, parseGlyph, parseGroups, readPack, renderPack } from "./icons.mjs";

const ROOT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
const glyph = (inner, root = ROOT) => `${root}\n  ${inner}\n</svg>\n`;
const refuses = (name, source, words) =>
  assert.throws(
    () => parseGlyph(name, source),
    (error) => error instanceof GlyphError && words.test(error.message),
  );

test("a glyph is read as its shapes, each an element with its measures", () => {
  const shapes = parseGlyph(
    "calendar",
    glyph('<rect x="3.5" y="4.5" width="13" height="12" rx="2"/>\n  <path d="M3.5 8.5h13M7 3v3"/>'),
  );
  assert.deepEqual(shapes, [
    ["rect", { x: "3.5", y: "4.5", width: "13", height: "12", rx: "2" }],
    ["path", { d: "M3.5 8.5h13M7 3v3" }],
  ]);
});

test("what a drawing tool writes around the shapes is taken where it says the pack's own", () => {
  const exported = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '<g stroke="#000" stroke-width="1.5">',
    '<circle r="7" cy="10" cx="10" stroke-linecap="round" stroke-linejoin="round" stroke="black"/>',
    "</g>",
    "</svg>",
  ].join("\n");
  // The measures stand in the element's own order, whatever order the tool wrote them in.
  assert.deepEqual(parseGlyph("goal", exported), [["circle", { cx: "10", cy: "10", r: "7" }]]);
});

test("a script, a style, a link and anything else that is no shape is refused", () => {
  refuses("bad", glyph("<script>alert(1)</script>"), /holds text|<script>/);
  refuses("bad", glyph('<script href="https://elsewhere.example/x.js"/>'), /<script>/);
  refuses("bad", glyph("<style>path{stroke:red}</style>"), /holds text|<style>/);
  refuses(
    "bad",
    glyph('<image href="https://elsewhere.example/p.png" width="20" height="20"/>'),
    /<image>/,
  );
  refuses("bad", glyph('<use href="#other"/>'), /<use>/);
  refuses("bad", glyph('<a href="https://elsewhere.example"><path d="M1 1h2"/></a>'), /<a>/);
  refuses("bad", glyph('<foreignObject width="20" height="20"/>'), /<foreignObject>/);
  refuses("bad", glyph('<!-- a note --><path d="M1 1h2"/>'), /no plain element/);
  refuses("bad", glyph('<!DOCTYPE svg><path d="M1 1h2"/>'), /no plain element/);
});

test("an attribute that is no measure is refused, an event handler and a link among them", () => {
  refuses("bad", glyph('<path d="M1 1h2" onclick="alert(1)"/>'), /has onclick on <path>/);
  refuses("bad", glyph('<path d="M1 1h2" href="https://elsewhere.example"/>'), /has href/);
  refuses("bad", glyph('<path d="M1 1h2" xlink:href="#a"/>'), /has xlink:href/);
  refuses("bad", glyph('<path d="M1 1h2" style="stroke:red"/>'), /has style/);
  refuses("bad", glyph('<path d="M1 1h2" id="a"/>'), /has id/);
  refuses("bad", glyph('<path d="M1 1h2" class="a"/>'), /has class/);
  refuses("bad", glyph('<path d="M1 1h2" transform="rotate(45)"/>'), /has transform/);
  refuses("bad", glyph('<g transform="translate(1 1)"><path d="M1 1h2"/></g>'), /group/);
  refuses(
    "bad",
    glyph('<path d="M1 1h2"/>', ROOT.replace("<svg ", '<svg onload="alert(1)" ')),
    /onload/,
  );
});

test("a glyph off the grid, or drawn another way than the pack's, is refused", () => {
  refuses("bad", glyph('<path d="M1 1h2"/>', ROOT.replace("0 0 20 20", "0 0 24 24")), /viewBox/);
  refuses("bad", glyph('<path d="M1 1h2"/>', ROOT.replace(' viewBox="0 0 20 20"', "")), /viewBox/);
  refuses("bad", glyph('<path d="M1 1h2" stroke-width="2"/>'), /stroke is 1\.5/);
  refuses("bad", glyph('<path d="M1 1h2" fill="#000"/>'), /lines only/);
  refuses("bad", glyph('<path d="M1 1h2" stroke="#2c5bc4"/>'), /one colour/);
  refuses("bad", glyph('<circle cx="10" cy="10" r="30"/>'), /no number within the grid/);
  refuses("bad", glyph('<rect x="10" y="2" width="12" height="4"/>'), /past the grid/);
  refuses("bad", glyph('<polyline points="1,1 40,2"/>'), /points outside the grid/);
  refuses("bad", glyph('<path d="M1 1h2;url(x)"/>'), /commands and numbers/);
  refuses("bad", glyph('<path d=""/>'), /empty/);
});

test("a tinted part is a filled shape under the lines, kept as such and no more than two", () => {
  const tint = 'fill="#3b6fd4" fill-opacity="0.3" stroke="none"';
  assert.deepEqual(
    parseGlyph(
      "lock",
      glyph(
        `<rect ${tint} x="4" y="8.75" width="12" height="8.5" rx="2.5"/>\n  <rect x="4" y="8.75" width="12" height="8.5" rx="2.5"/>`,
      ),
    ),
    [
      ["rect", { x: "4", y: "8.75", width: "12", height: "8.5", rx: "2.5" }, "tint"],
      ["rect", { x: "4", y: "8.75", width: "12", height: "8.5", rx: "2.5" }],
    ],
  );
  // The tint's colour is the accent's or the text's, and a filled shape is never also a line.
  refuses(
    "bad",
    glyph('<path fill="#ff0000" stroke="none" d="M1 1h2"/><path d="M1 1h2"/>'),
    /tinted part/,
  );
  refuses("bad", glyph('<path fill="#3b6fd4" d="M1 1h2"/><path d="M1 1h2"/>'), /tinted part/);
  refuses(
    "bad",
    glyph(`<path ${tint.replace("0.3", "3")} d="M1 1h2"/><path d="M1 1h2"/>`),
    /0 to 1/,
  );
  // It stands under the lines, a glyph has at most two, and a tint alone is no glyph.
  refuses("bad", glyph(`<path d="M1 1h2"/><path ${tint} d="M1 1h2"/>`), /put it first/);
  refuses(
    "bad",
    glyph(
      `${Array.from({ length: 3 }, () => `<path ${tint} d="M1 1h2"/>`).join("")}<path d="M1 1h2"/>`,
    ),
    /3 tinted parts/,
  );
  refuses("bad", glyph(`<path ${tint} d="M1 1h2"/>`), /0 shapes/);
});

test("a file that is too large, or holds too much, or nothing, is refused", () => {
  refuses("bad", glyph(`<path d="M1 1${"h1".repeat(3000)}"/>`), /larger than/);
  refuses(
    "bad",
    glyph(Array.from({ length: 13 }, () => '<path d="M1 1h2"/>').join("")),
    /13 shapes/,
  );
  refuses("bad", glyph(""), /0 shapes/);
  refuses("bad", "<svg></svg><svg></svg>", /viewBox|one <svg>/);
  refuses("bad", "", /one <svg>/);
});

test("a name is lowercase words joined by a hyphen", () => {
  const fine = glyph('<path d="M1 1h2"/>');
  assert.equal(parseGlyph("arrow-right", fine).length, 1);
  refuses("Arrow", fine, /no name of a glyph/);
  refuses("arrow_right", fine, /no name of a glyph/);
  refuses("../escape", fine, /no name of a glyph/);
});

test("the groups name every glyph once, and no glyph there is none of", () => {
  const names = ["check", "plus"];
  assert.deepEqual(parseGroups('{"groups":[{"key":"actions","icons":["plus","check"]}]}', names), [
    { key: "actions", icons: ["plus", "check"] },
  ]);
  assert.throws(
    () => parseGroups('{"groups":[{"key":"actions","icons":["plus"]}]}', names),
    /no group for check/,
  );
  assert.throws(
    () => parseGroups('{"groups":[{"key":"actions","icons":["plus","check","minus"]}]}', names),
    /no minus\.svg/,
  );
  assert.throws(
    () =>
      parseGroups(
        '{"groups":[{"key":"a","icons":["plus","check"]},{"key":"b","icons":["plus"]}]}',
        names,
      ),
    /plus twice/,
  );
  assert.throws(() => parseGroups("{", names), /not readable JSON/);
});

test("a folder is written as one module, the same text every time", () => {
  const dir = mkdtempSync(join(tmpdir(), "console-icons-"));
  try {
    writeFileSync(join(dir, "plus.svg"), glyph('<path d="M10 4v12M4 10h12"/>'));
    writeFileSync(join(dir, "check.svg"), glyph('<path d="M4 10.5l4 4 8-9"/>'));
    writeFileSync(
      join(dir, "groups.json"),
      '{"groups":[{"key":"actions","icons":["plus","check"]}]}',
    );
    const text = renderPack(readPack(dir));
    assert.equal(text, renderPack(readPack(dir)));
    // The glyphs by name, in the order of the names; the groups in the order the file gives.
    assert.match(text, /"check": \[\["path", \{ d: "M4 10\.5l4 4 8-9" \}\]\],\n {2}"plus": /);
    assert.match(text, /\{ key: "actions", icons: \["plus", "check"\] \}/);
    // Data, never markup.
    assert.doesNotMatch(text, /<path|<svg/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
