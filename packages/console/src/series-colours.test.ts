import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHART_SERIES, seriesClass } from "./charts.js";
import { CONSOLE_TOKENS } from "./tokens.js";

// The colours a series of a chart is drawn in (ADR-0123), as the stylesheet's tokens have them.
// They were chosen by checks a test here cannot run whole (how far any two stand apart to a
// reader who does not tell red from green); this holds what it can, so that one is not changed
// by eye: which six they are, that each stands out on the console's light grounds and on a
// dark one, and that none is a colour the console already means something by.

const read = (name: string): Promise<string> =>
  readFile(fileURLToPath(new URL(`./styles/${name}`, import.meta.url)), "utf8");

/** A token's value as the stylesheet's root sets it. */
function colourOf(tokens: string, name: string): string {
  const found = new RegExp(`^  ${name}: (#[0-9a-f]{6});$`, "m").exec(tokens);
  if (found?.[1] === undefined) {
    throw new Error(`${name} is not a colour of the tokens`);
  }
  return found[1];
}

/** How bright a colour is, as the contrast of two colours counts it. */
function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The contrast of two colours, from 1 to 21. */
function contrast(one: string, other: string): number {
  const [light = 0, dark = 0] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe("the colours of a series", () => {
  it("are six: blue, coral, raspberry, teal, violet and green", async () => {
    const tokens = await read("tokens.css");
    const six = Array.from({ length: CHART_SERIES }, (_, index) =>
      colourOf(tokens, `--sc-series-${index + 1}`),
    );
    expect(six).toEqual(["#285fd4", "#e45b63", "#bf1b7f", "#0097ac", "#946ff2", "#04933e"]);
    expect(tokens).not.toContain("--sc-series-7");
  });

  it("stand out, 3:1 or better, on the console's light grounds and on a dark one", async () => {
    const tokens = await read("tokens.css");
    const grounds = [
      colourOf(tokens, "--sc-color-bg-raised"),
      colourOf(tokens, "--sc-color-bg"),
      colourOf(tokens, "--sc-color-bg-inset"),
      // A dark ground, as a console re-skinned by its tokens may have: the ink of this one.
      colourOf(tokens, "--sc-color-text"),
    ];
    for (let index = 1; index <= CHART_SERIES; index += 1) {
      const colour = colourOf(tokens, `--sc-series-${index}`);
      for (const ground of grounds) {
        expect(
          contrast(colour, ground),
          `--sc-series-${index} on ${ground}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("are none of the colours the console means something by", async () => {
    const tokens = await read("tokens.css");
    const meant = ["accent", "point", "success", "warning", "danger", "info", "neutral"].map(
      (name) => colourOf(tokens, `--sc-color-${name}`),
    );
    const six = Array.from({ length: CHART_SERIES }, (_, index) =>
      colourOf(tokens, `--sc-series-${index + 1}`),
    );
    expect(new Set(six).size).toBe(CHART_SERIES);
    for (const colour of six) {
      expect(meant).not.toContain(colour);
    }
  });

  it("each reach a plugin's frame as a token, and are drawn in by a class of their own", async () => {
    const part = await read("parts/series.css");
    for (let index = 0; index < CHART_SERIES; index += 1) {
      expect(CONSOLE_TOKENS).toContain(`--sc-series-${index + 1}`);
      expect(part).toContain(
        `.${seriesClass(index)} {\n  color: var(--sc-series-${index + 1});\n}`,
      );
    }
    // What is past the sixth wears the neutral, never a seventh hue.
    expect(part).toContain(".sc-series-rest {\n  color: var(--sc-color-neutral);\n}");
  });
});
