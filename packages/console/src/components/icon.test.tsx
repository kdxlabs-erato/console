import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KOREAN, LanguageContext } from "../i18n/index.js";
import { GLYPHS, ICON_NAMES, type IconName } from "../icons/index.js";
import { Icon, IconPicker } from "./icon.js";

describe("Icon", () => {
  it("draws a glyph of the pack as elements, in the colour of its text, hidden beside words", () => {
    const html = renderToStaticMarkup(<Icon name="plus" />);
    expect(html).toContain('class="sc-icon sc-icon-md"');
    expect(html).toContain('viewBox="0 0 20 20"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('<path d="M10 4v12M4 10h12"></path>');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("role=");
  });

  it("is a picture with a name where it is given a label", () => {
    const html = renderToStaticMarkup(<Icon name="lock" size="sm" label="Private" />);
    expect(html).toContain('class="sc-icon sc-icon-sm"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Private"');
    expect(html).not.toContain("aria-hidden");
  });

  it("draws a tinted part filled and never stroked, under the lines, and lines alone where a glyph has none (ADR-0149)", () => {
    const count = (html: string, part: string): number => html.split(part).length - 1;
    const tinted = GLYPHS.calendar.filter((shape) => shape[2] === "tint").length;
    expect(tinted).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<Icon name="calendar" />);
    // By its class, which the stylesheet colours in the accent; and drawn on the element in
    // the text's colour, faint, for a page without the stylesheet, where the glyph's own
    // stroke would otherwise outline it.
    expect(
      count(html, 'class="sc-icon-tint" fill="currentColor" fill-opacity="0.2" stroke="none"'),
    ).toBe(tinted);
    // Under the lines: the tint comes first, and every line after it is a line of the glyph.
    const shapes = html.match(/<(?:path|circle|ellipse|rect|line|polyline|polygon) [^>]*>/g) ?? [];
    expect(shapes).toHaveLength(GLYPHS.calendar.length);
    expect(shapes.slice(0, tinted).every((shape) => shape.includes("sc-icon-tint"))).toBe(true);
    expect(shapes.slice(tinted).some((shape) => /sc-icon-tint|fill=|stroke=/.test(shape))).toBe(
      false,
    );
    // A glyph with nothing to fill is its lines alone.
    expect(renderToStaticMarkup(<Icon name="plus" />)).not.toContain("sc-icon-tint");
    // And so for every glyph of the pack: as many tinted parts drawn as its data names.
    for (const name of ICON_NAMES) {
      const named = GLYPHS[name].filter((shape) => shape[2] === "tint").length;
      expect(count(renderToStaticMarkup(<Icon name={name} />), "sc-icon-tint"), name).toBe(named);
    }
  });

  it("draws an empty box of its size for a name the pack does not hold", () => {
    const html = renderToStaticMarkup(<Icon name={"no-such-glyph" as IconName} />);
    expect(html).toContain('class="sc-icon sc-icon-md"');
    expect(html).not.toContain("<path");
    // A name every object has draws nothing either.
    expect(renderToStaticMarkup(<Icon name={"constructor" as IconName} />)).not.toContain("<path");
  });
});

describe("IconPicker", () => {
  it("shows the choice in its field, closed until it is pressed", () => {
    const html = renderToStaticMarkup(
      <IconPicker value="calendar" label="Icon" onChange={() => undefined} />,
    );
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Icon: calendar"');
    expect(html).toContain('<span class="sc-icon-picker-value">calendar</span>');
    // The pack is not in the page until the field is opened.
    expect(html).not.toContain("sc-icon-picker-panel");
    expect(html).not.toContain('role="option"');
  });

  it("says that none is chosen, in the reader's language", () => {
    const english = renderToStaticMarkup(
      <IconPicker value={null} label="Icon" onChange={() => undefined} />,
    );
    expect(english).toContain('<span class="sc-icon-picker-value">No icon</span>');
    const korean = renderToStaticMarkup(
      <LanguageContext.Provider value={KOREAN}>
        <IconPicker value={null} label="아이콘" onChange={() => undefined} />
      </LanguageContext.Provider>,
    );
    expect(korean).toContain(KOREAN.messages.icons.none);
    expect(korean).not.toContain("No icon");
  });
});
