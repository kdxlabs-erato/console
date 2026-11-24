import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.js";
import { ko } from "../i18n/ko.js";
import {
  findIcons,
  GLYPHS,
  ICON_GRID,
  ICON_GROUP_LIST,
  ICON_NAMES,
  type IconSection,
  iconElement,
  iconPlace,
  iconStep,
  isIconName,
} from "./index.js";

describe("the icon pack", () => {
  it("holds every glyph in one group, and no group names a glyph there is none of", () => {
    const grouped = ICON_GROUP_LIST.flatMap((group) => group.icons);
    expect([...grouped].sort()).toEqual([...ICON_NAMES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(70);
  });

  it("draws every glyph from shapes with measures alone", () => {
    for (const name of ICON_NAMES) {
      const shapes = GLYPHS[name];
      expect(shapes.length, name).toBeGreaterThan(0);
      // At most two tinted parts, under the lines, and at least one line.
      const tints = shapes.filter((shape) => shape[2] === "tint").length;
      expect(tints, name).toBeLessThanOrEqual(2);
      expect(shapes.length - tints, name).toBeGreaterThan(0);
      expect(
        shapes.slice(0, tints).every((shape) => shape[2] === "tint"),
        name,
      ).toBe(true);
      for (const [tag, measures, part] of shapes) {
        expect([undefined, "tint"]).toContain(part);
        expect(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]).toContain(tag);
        for (const [attribute, value] of Object.entries(measures)) {
          expect(attribute, name).toMatch(
            /^(d|cx|cy|r|rx|ry|x|y|width|height|x1|y1|x2|y2|points)$/,
          );
          expect(value, name).not.toMatch(/[<>"'&;()]/);
        }
      }
    }
    expect(ICON_GRID).toBe(20);
  });

  it("knows a name of the pack from anything else", () => {
    expect(isIconName("calendar")).toBe(true);
    expect(isIconName("arrow-right")).toBe(true);
    expect(isIconName("Calendar")).toBe(false);
    expect(isIconName("")).toBe(false);
    // A name every object has is no glyph.
    expect(isIconName("constructor")).toBe(false);
    expect(isIconName("toString")).toBe(false);
    expect(isIconName("__proto__")).toBe(false);
    expect(isIconName(undefined)).toBe(false);
    expect(isIconName(7)).toBe(false);
  });

  it("gives every group a word, and the same glyphs their search words, in each pack", () => {
    const groups = ICON_GROUP_LIST.map((group) => group.key).sort();
    expect(Object.keys(en.icons.groups).sort()).toEqual(groups);
    expect(Object.keys(ko.icons.groups).sort()).toEqual(groups);
    // Words are a help and no duty: a glyph without them is found by its name. Those that have
    // them have them in every pack, and are glyphs of the pack.
    expect(Object.keys(ko.icons.words).sort()).toEqual(Object.keys(en.icons.words).sort());
    for (const name of Object.keys(en.icons.words)) {
      expect(isIconName(name), name).toBe(true);
    }
  });
});

describe("finding a glyph by words", () => {
  it("finds every glyph by nothing, in the order the pack shows them", () => {
    expect(findIcons("")).toEqual(ICON_GROUP_LIST.flatMap((group) => group.icons));
    expect(findIcons("   ")).toHaveLength(ICON_NAMES.length);
  });

  it("finds by the name, whatever its case, with the names that begin so first", () => {
    expect(findIcons("CAL")[0]).toBe("calendar");
    expect(findIcons("arrow")).toEqual(["arrow-up", "arrow-down", "arrow-left", "arrow-right"]);
    // A hyphen is typed as a space too.
    expect(findIcons("arrow right")).toEqual(["arrow-right"]);
    expect(findIcons("eye off")).toEqual(["eye-off"]);
  });

  it("finds by the words a pack gives a glyph, in the reader's language", () => {
    expect(findIcons("delete", en.icons.words)).toContain("trash");
    expect(findIcons("delete")).not.toContain("trash");
    expect(findIcons("달력", ko.icons.words)).toEqual(["calendar"]);
    expect(findIcons("휴지통", ko.icons.words)).toEqual(["trash"]);
    // The name still finds it, whatever the language.
    expect(findIcons("trash", ko.icons.words)).toContain("trash");
  });

  it("wants every word typed, and finds nothing where one is nowhere", () => {
    expect(findIcons("arrow nowhere", en.icons.words)).toEqual([]);
    expect(findIcons("zzzz")).toEqual([]);
  });

  it("reads no word off a name every object has", () => {
    expect(findIcons("function", {})).toEqual([]);
  });
});

describe("moving among a picker's choices with the keys", () => {
  // None by itself, then a group of ten on rows of four, then a group of three.
  const sections: IconSection[] = [
    { size: 1, columns: 1 },
    { size: 10, columns: 4 },
    { size: 3, columns: 4 },
  ];

  it("begins at the choice in hand: none first, then the glyphs in the pack's order", () => {
    expect(iconPlace(null)).toBe(0);
    const shown = ICON_GROUP_LIST.flatMap((group) => group.icons);
    expect(iconPlace(shown[0] ?? "plus")).toBe(1);
    expect(iconPlace("calendar")).toBe(1 + shown.indexOf("calendar"));
    expect(iconPlace(shown.at(-1) ?? "plus")).toBe(shown.length);
  });

  it("goes from the field to the first choice, and back up out of it", () => {
    expect(iconStep(sections, -1, "ArrowDown")).toBe(0);
    expect(iconStep(sections, -1, "ArrowUp")).toBeUndefined();
    expect(iconStep(sections, -1, "ArrowRight")).toBeUndefined();
    expect(iconStep(sections, 0, "ArrowUp")).toBe(-1);
  });

  it("goes through the choices in order with left and right, and stops at the ends", () => {
    expect(iconStep(sections, 0, "ArrowRight")).toBe(1);
    expect(iconStep(sections, 10, "ArrowRight")).toBe(11);
    expect(iconStep(sections, 13, "ArrowRight")).toBeUndefined();
    expect(iconStep(sections, 1, "ArrowLeft")).toBe(0);
    expect(iconStep(sections, 0, "ArrowLeft")).toBeUndefined();
  });

  it("keeps the column going down, into the next group where one ends", () => {
    // From none to the first of the group under it.
    expect(iconStep(sections, 0, "ArrowDown")).toBe(1);
    // Within the group of ten: a row is four.
    expect(iconStep(sections, 2, "ArrowDown")).toBe(6);
    // The last row is short: the last choice of it.
    expect(iconStep(sections, 8, "ArrowDown")).toBe(10);
    expect(iconStep(sections, 7, "ArrowDown")).toBe(10);
    // From the last row into the next group, at the same column, or its last.
    expect(iconStep(sections, 9, "ArrowDown")).toBe(11);
    expect(iconStep(sections, 10, "ArrowDown")).toBe(12);
    // Nothing under the last group.
    expect(iconStep(sections, 12, "ArrowDown")).toBeUndefined();
  });

  it("keeps the column going up, into the last row of the group above", () => {
    expect(iconStep(sections, 6, "ArrowUp")).toBe(2);
    // From the first row of the group of ten up to none.
    expect(iconStep(sections, 3, "ArrowUp")).toBe(0);
    // From the group of three up to the last row of the ten, which holds two.
    expect(iconStep(sections, 11, "ArrowUp")).toBe(9);
    expect(iconStep(sections, 12, "ArrowUp")).toBe(10);
    expect(iconStep(sections, 13, "ArrowUp")).toBe(10);
  });

  it("goes to the first and the last with Home and End, and nowhere by another key", () => {
    expect(iconStep(sections, 5, "Home")).toBe(0);
    expect(iconStep(sections, 5, "End")).toBe(13);
    expect(iconStep(sections, 5, "a")).toBeUndefined();
  });

  it("moves nowhere among no choices, and skips a section that holds none", () => {
    expect(iconStep([], -1, "ArrowDown")).toBeUndefined();
    expect(iconStep([{ size: 0, columns: 4 }], -1, "ArrowDown")).toBeUndefined();
    const found: IconSection[] = [
      { size: 0, columns: 4 },
      { size: 5, columns: 4 },
    ];
    expect(iconStep(found, -1, "ArrowDown")).toBe(0);
    expect(iconStep(found, 0, "ArrowDown")).toBe(4);
    expect(iconStep(found, 0, "ArrowUp")).toBe(-1);
  });
});

/** A document that keeps what is made in it, as far as `iconElement` asks of one. */
function fakeDocument() {
  interface Made {
    readonly space: string;
    readonly tag: string;
    readonly attributes: Record<string, string>;
    readonly children: Made[];
    setAttribute(name: string, value: string): void;
    append(child: Made): void;
  }
  const createElementNS = (space: string, tag: string): Made => {
    const made: Made = {
      space,
      tag,
      attributes: {},
      children: [],
      setAttribute(name, value) {
        made.attributes[name] = value;
      },
      append(child) {
        made.children.push(child);
      },
    };
    return made;
  };
  return { createElementNS } as unknown as Document;
}

describe("a glyph as an element of a page that is not React's", () => {
  it("is drawn from the pack's data, hidden from a screen reader unless it is given a label", () => {
    const made = iconElement("plus", {}, fakeDocument()) as unknown as {
      tag: string;
      space: string;
      attributes: Record<string, string>;
      children: { tag: string; attributes: Record<string, string> }[];
    };
    expect(made.tag).toBe("svg");
    expect(made.space).toBe("http://www.w3.org/2000/svg");
    expect(made.attributes).toMatchObject({
      class: "sc-icon sc-icon-md",
      viewBox: "0 0 20 20",
      fill: "none",
      stroke: "currentColor",
      "aria-hidden": "true",
    });
    expect(made.children).toEqual([
      expect.objectContaining({ tag: "path", attributes: { d: "M10 4v12M4 10h12" } }),
    ]);
    const labelled = iconElement(
      "calendar",
      { size: "sm", label: "Due" },
      fakeDocument(),
    ) as unknown as {
      attributes: Record<string, string>;
    };
    expect(labelled.attributes).toMatchObject({
      class: "sc-icon sc-icon-sm",
      role: "img",
      "aria-label": "Due",
    });
    expect(labelled.attributes["aria-hidden"]).toBeUndefined();
    // A tinted part (ADR-0149) is filled and not stroked, by its class and on the element
    // itself, under the lines, which carry nothing but their measures.
    const tinted = iconElement("calendar", {}, fakeDocument()) as unknown as {
      children: { tag: string; attributes: Record<string, string> }[];
    };
    const tints = GLYPHS.calendar.filter((shape) => shape[2] === "tint").length;
    expect(tints).toBeGreaterThan(0);
    expect(tinted.children).toHaveLength(GLYPHS.calendar.length);
    for (const [place, child] of tinted.children.entries()) {
      if (place < tints) {
        expect(child.attributes).toMatchObject({
          class: "sc-icon-tint",
          fill: "currentColor",
          "fill-opacity": "0.2",
          stroke: "none",
        });
      } else {
        expect(child.attributes).toEqual(GLYPHS.calendar[place]?.[1]);
      }
    }
  });
});
