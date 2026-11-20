import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RestProject } from "../api.js";
import { glyphChange, ProjectForm, ProjectMark } from "./projects.js";

// A project's mark with an icon of the pack in its symbol's place (ADR-0142), and the form that
// chooses it.

const project: RestProject = {
  id: "0190a8c0-0000-7000-8000-000000000001",
  key: "ledger",
  name: "Ledger",
  description: "",
  visibility: "workspace",
  skillsAddress: null,
  color: "teal",
  symbol: null,
  icon: null,
  packToken: null,
  role: "owner",
  openDecisions: 0,
  openRuns: 0,
  createdAt: "2026-11-02T09:00:00.000Z",
  updatedAt: "2026-11-02T09:00:00.000Z",
};

describe("a project's mark with an icon of the pack", () => {
  it("shows the icon in the symbol's place, on the project's colour", () => {
    const html = renderToStaticMarkup(
      <ProjectMark project={{ ...project, symbol: "L", glyph: "finance" }} />,
    );
    expect(html).toContain("sc-category-teal");
    expect(html).toContain('class="sc-icon sc-icon-md"');
    expect(html).not.toContain(">L<");
  });

  it("keeps the symbol where the project names no icon, or one this pack does not hold", () => {
    expect(renderToStaticMarkup(<ProjectMark project={project} />)).toContain(">L<");
    expect(renderToStaticMarkup(<ProjectMark project={{ ...project, glyph: null }} />)).toContain(
      ">L<",
    );
    const newer = renderToStaticMarkup(
      <ProjectMark project={{ ...project, glyph: "a-glyph-of-a-newer-pack" }} />,
    );
    expect(newer).toContain(">L<");
    expect(newer).not.toContain("sc-icon");
  });

  it("shows the project's own image over the icon", () => {
    const html = renderToStaticMarkup(
      <ProjectMark project={{ ...project, glyph: "finance", icon: { sha256: "a".repeat(64) } }} />,
    );
    expect(html).toContain("sc-mark-pictured");
    expect(html).toContain("<img");
  });
});

describe("the project form's icon", () => {
  it("offers the icon beside the mark's letters, with the project's own chosen", () => {
    const html = renderToStaticMarkup(
      <ProjectForm project={{ ...project, glyph: "flag" }} onSubmit={() => undefined} />,
    );
    expect(html).toContain('aria-label="Icon: flag"');
    // The mark as it will be shows the icon already.
    expect(html).toMatch(/class="sc-mark sc-mark-lg[^"]*"[^>]*><svg class="sc-icon/);
  });

  it("says an icon in a save only where the form changed it, so that one this pack lacks is not cleared", () => {
    // Chosen, changed and taken away: said.
    expect(glyphChange(null, "flag")).toEqual({ glyph: "flag" });
    expect(glyphChange("flag", "calendar")).toEqual({ glyph: "calendar" });
    expect(glyphChange("flag", null)).toEqual({ glyph: null });
    // As it was: nothing is said, and the project keeps what it has. An icon of a newer pack
    // reads here as none, and saving the project's name leaves it there.
    expect(glyphChange("flag", "flag")).toEqual({});
    expect(glyphChange(null, null)).toEqual({});
  });

  it("offers none for a new project", () => {
    const html = renderToStaticMarkup(<ProjectForm onSubmit={() => undefined} />);
    expect(html).toContain('aria-label="Icon: No icon"');
  });
});
