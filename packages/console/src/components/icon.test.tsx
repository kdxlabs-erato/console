import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KOREAN, LanguageContext } from "../i18n/index.js";
import type { IconName } from "../icons/index.js";
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
