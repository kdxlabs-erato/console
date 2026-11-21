import { describe, expect, it } from "vitest";
import {
  added,
  arranged,
  columnsFor,
  footprintOf,
  GLANCE_REM,
  glanceFit,
  glanceProjects,
  type HomeColumns,
  type HomeTile,
  type HomeTileSize,
  homeTiles,
  homeWith,
  isGlanceSize,
  moved,
  nobodyArranged,
  type PlacedTile,
  resized,
  rowsOf,
  sameArrangement,
  sizesAt,
  standsUnarranged,
  startingSizeAt,
  tidied,
  UNARRANGED_HOME,
  waitToGiveWay,
} from "./home-tiles.js";
import type { RestHome, RestPlugin, RestProject } from "./schemas.js";

const plugin = (key: string, widgets: RestPlugin["widgets"], state = "enabled"): RestPlugin =>
  ({
    key,
    name: { en: key },
    description: { en: "" },
    agentNote: null,
    version: "1.0.0",
    state,
    problems: [],
    roles: [],
    declaredRoles: [],
    defaultRole: null,
    menu: null,
    pages: [],
    widgets,
    board: null,
    boardNeeds: "none",
    capabilities: [],
    consent: null,
    projects: null,
    requires: {},
    dataVersion: 1,
    enabledAt: null,
  }) as RestPlugin;

const project = (at: number): RestProject =>
  ({
    id: `0199c4d8-0000-7000-8000-00000000000${at}`,
    key: `p${at}`,
    name: `Project ${at}`,
  }) as RestProject;

const hr = plugin("hr", [
  {
    key: "balance",
    name: { en: "My leave" },
    place: "home:top",
    size: "third",
    sizes: ["small", "medium"],
    defaultSize: "small",
  },
  {
    key: "today",
    name: { en: "Out today" },
    place: "home:top",
    size: "half",
    sizes: ["medium", "large", "wide"],
    defaultSize: "medium",
  },
]);

/** A plugin of before, which names one size, and places its widget below the projects. */
const hello = plugin("hello", [
  { key: "latest", name: { en: "Latest" }, place: "home:bottom", size: "full" },
]);

const P1 = "project:0199c4d8-0000-7000-8000-000000000001";
const P2 = "project:0199c4d8-0000-7000-8000-000000000002";
const P3 = "project:0199c4d8-0000-7000-8000-000000000003";
const BALANCE = "widget:hr:balance";
const TODAY = "widget:hr:today";

/** Where each tile stands, by its id, for a test to read at a glance. */
const places = (placed: readonly PlacedTile[]) =>
  Object.fromEntries(placed.map(({ tile, x, y, size }) => [tile.id, [x, y, size]]));

/** Whether no two tiles share a cell, and each stands within the grid. */
function holdsTogether(placed: readonly PlacedTile[], columns: number): boolean {
  const cells = new Set<string>();
  for (const { x, y, size } of placed) {
    const { w, h } = footprintOf(size, columns);
    if (x < 0 || y < 0 || x + w > columns) {
      return false;
    }
    for (let row = y; row < y + h; row += 1) {
      for (let column = x; column < x + w; column += 1) {
        const cell = `${column},${row}`;
        if (cells.has(cell)) {
          return false;
        }
        cells.add(cell);
      }
    }
  }
  return true;
}

/** The cells left empty within the rows the page takes. */
const emptyCells = (placed: readonly PlacedTile[], columns: number): number =>
  rowsOf(placed, columns) * columns -
  placed.reduce((cells, { size }) => {
    const { w, h } = footprintOf(size, columns);
    return cells + w * h;
  }, 0);

const people = plugin("people", [
  {
    key: "notices",
    name: { en: "Notices" },
    place: "home:top",
    size: "half",
    sizes: ["small", "medium", "large", "wide"],
    defaultSize: "large",
  },
  {
    key: "leave",
    name: { en: "My leave" },
    place: "home:top",
    size: "third",
    sizes: ["small", "medium", "large"],
    defaultSize: "medium",
  },
  {
    key: "away",
    name: { en: "Away today" },
    place: "home:top",
    size: "third",
    sizes: ["small", "medium", "large", "wide"],
    defaultSize: "medium",
  },
  {
    key: "approvals",
    name: { en: "Approvals" },
    place: "home:top",
    size: "third",
    sizes: ["small", "medium", "large"],
    defaultSize: "medium",
  },
]);
const NOTICES = "widget:people:notices";
const LEAVE = "widget:people:leave";
const AWAY = "widget:people:away";
const APPROVALS = "widget:people:approvals";

const layout = (columns: HomeColumns, tiles: RestHome["layouts"][8]): RestHome => ({
  hidden: [],
  layouts: { [columns]: tiles },
});

describe("the front page's grid (ADR-0061)", () => {
  it("has as many columns as the width keeps a cell of a size to read", () => {
    expect(columnsFor(320)).toBe(4);
    expect(columnsFor(559)).toBe(4);
    expect(columnsFor(560)).toBe(6);
    expect(columnsFor(899)).toBe(6);
    expect(columnsFor(900)).toBe(8);
    expect(columnsFor(1519)).toBe(8);
    expect(columnsFor(1520)).toBe(12);
    expect(columnsFor(3840)).toBe(12);
  });

  it("gives every size its cells, and no tile more columns than there are", () => {
    expect(footprintOf("icon", 8)).toEqual({ w: 1, h: 1 });
    expect(footprintOf("small", 8)).toEqual({ w: 2, h: 2 });
    expect(footprintOf("medium", 8)).toEqual({ w: 4, h: 2 });
    expect(footprintOf("large", 8)).toEqual({ w: 4, h: 4 });
    expect(footprintOf("wide", 8)).toEqual({ w: 8, h: 2 });
    expect(footprintOf("full", 8)).toEqual({ w: 8, h: 4 });
    expect(footprintOf("full", 4)).toEqual({ w: 4, h: 4 });
    expect(footprintOf("wide", 6)).toEqual({ w: 6, h: 2 });
  });

  it("holds what the person may see: the widgets of the plugins that are on, and the projects", () => {
    const tiles = homeTiles([hr, hello], [project(1)]);
    expect(tiles.map((tile) => tile.id)).toEqual([BALANCE, TODAY, P1, "widget:hello:latest"]);
    // A project at a glance as well, never at the size a glance has more room than words for (ADR-0105).
    expect(tiles[2]?.sizes).toEqual(["icon", "small", "medium", "large", "wide"]);
    expect(tiles[2]?.defaultSize).toBe("icon");
    // The one size of before reads as one of the family.
    expect(tiles[3]?.sizes).toEqual(["medium", "wide"]);
    for (const state of ["installed", "disabled", "needs_consent", "failed"]) {
      expect(homeTiles([{ ...hr, state } as RestPlugin], [])).toEqual([]);
    }
  });

  it("stands the page of someone who has arranged nothing in its order, each tile at the size it starts at, at the first room from the top (ADR-0147)", () => {
    const tiles = homeTiles([hr, hello], [project(1), project(2), project(3)]);
    // The widgets placed at the top, the projects, the widget placed at the bottom; the third
    // project takes the room the first two leave under them, beside the widget.
    expect(places(arranged(tiles, null, 8))).toEqual({
      [BALANCE]: [0, 0, "small"],
      [TODAY]: [2, 0, "medium"],
      [P1]: [6, 0, "icon"],
      [P2]: [7, 0, "icon"],
      [P3]: [6, 1, "icon"],
      "widget:hello:latest": [0, 2, "wide"],
    });
    for (const columns of [12, 8, 6, 4] as const) {
      const at = arranged(tiles, null, columns);
      expect(holdsTogether(at, columns)).toBe(true);
      // Every tile at the size it starts at on this grid, and none at another.
      for (const { tile, size } of at) {
        expect(size).toBe(startingSizeAt(tile, columns));
      }
      // What the person took off stays off.
      expect(
        arranged(tiles, { hidden: [TODAY], layouts: {} }, columns).some(
          ({ tile }) => tile.id === TODAY,
        ),
      ).toBe(false);
    }
    expect(nobodyArranged({ hidden: [TODAY], layouts: {} })).toBe(true);
    expect(nobodyArranged(layout(8, []))).toBe(false);
  });

  it("gives no widget a size it was not given, to lead the page or to close a row (ADR-0147)", () => {
    // What an organization with a plugin for its people has on its front page: a notice that
    // starts large, three widgets that start medium, and seven projects.
    const seven = [1, 2, 3, 4, 5, 6, 7].map(project);
    const tiles = homeTiles([people], seven);
    // Twelve columns: the notice four cells by four, not half the page; the next two beside it at
    // their own size, none grown to fill the column; the fourth under the second, and the
    // projects in the room left beside it.
    const wide = arranged(tiles, null, 12);
    expect(places(wide)).toMatchObject({
      [NOTICES]: [0, 0, "large"],
      [LEAVE]: [4, 0, "medium"],
      [AWAY]: [8, 0, "medium"],
      [APPROVALS]: [4, 2, "medium"],
    });
    expect(
      wide.filter(({ tile }) => tile.kind === "project").map(({ x, y, size }) => [x, y, size]),
    ).toEqual([
      [8, 2, "icon"],
      [9, 2, "icon"],
      [10, 2, "icon"],
      [11, 2, "icon"],
      [8, 3, "icon"],
      [9, 3, "icon"],
      [10, 3, "icon"],
    ]);
    // A widget alone at the top stays at its own small size, beside the projects.
    const solo = plugin("solo", [
      {
        key: "latest",
        name: { en: "Latest" },
        place: "home:top",
        size: "third",
        sizes: ["small", "medium"],
        defaultSize: "small",
      },
    ]);
    expect(places(arranged(homeTiles([solo], [project(1)]), null, 12))).toEqual({
      "widget:solo:latest": [0, 0, "small"],
      [P1]: [2, 0, "icon"],
    });
    // At every width, a widget is at the size it starts at: its own where it fits, else the
    // largest of its sizes that does.
    for (const columns of [12, 8, 6, 4] as const) {
      for (const { tile, size } of arranged(tiles, null, columns)) {
        expect(size).toBe(startingSizeAt(tile, columns));
      }
    }
  });

  it("stands a project on one cell, never stretched, as when a plugin's widgets are gone", () => {
    const seven = [1, 2, 3, 4, 5, 6, 7].map(project);
    // A plugin that failed, on a console it was not built for, has no widget to show.
    const tiles = homeTiles([{ ...hr, state: "failed" } as RestPlugin], seven);
    expect(tiles.every((tile) => tile.kind === "project")).toBe(true);
    const cells = (columns: HomeColumns) =>
      arranged(tiles, null, columns).map(({ x, y, size }) => [x, y, size]);
    // Twelve columns hold the seven in one row, each on one cell; a phone, rows of four.
    expect(cells(12)).toEqual(seven.map((_, at) => [at, 0, "icon"]));
    expect(cells(4)).toEqual(seven.map((_, at) => [at % 4, Math.floor(at / 4), "icon"]));
    // One project alone is one cell, never a bar across the page.
    expect(places(arranged(homeTiles([], [project(1)]), null, 12))).toEqual({
      [P1]: [0, 0, "icon"],
    });
  });

  it("puts the page back as nobody arranged it: no width arranged, nothing taken off (ADR-0109)", () => {
    const tiles = homeTiles([hr, hello], [project(1), project(2), project(3)]);
    expect(standsUnarranged(null)).toBe(true);
    expect(standsUnarranged(undefined)).toBe(true);
    expect(standsUnarranged(UNARRANGED_HOME)).toBe(true);
    // Something taken off, or a width arranged, is something to put back.
    expect(standsUnarranged({ hidden: [TODAY], layouts: {} })).toBe(false);
    expect(standsUnarranged(layout(8, []))).toBe(false);
    expect(nobodyArranged(UNARRANGED_HOME)).toBe(true);
    // Put back, the page is the one someone who arranged nothing has, every tile on it.
    const kept: RestHome = {
      hidden: [TODAY],
      layouts: { 8: [{ tile: P1, x: 7, y: 5, size: "small" }] },
    };
    for (const columns of [12, 8, 6, 4] as const) {
      expect(places(arranged(tiles, UNARRANGED_HOME, columns))).toEqual(
        places(arranged(tiles, null, columns)),
      );
    }
    expect(places(arranged(tiles, kept, 8))).not.toEqual(
      places(arranged(tiles, UNARRANGED_HOME, 8)),
    );
    expect(arranged(tiles, kept, 8).some(({ tile }) => tile.id === TODAY)).toBe(false);
    expect(arranged(tiles, UNARRANGED_HOME, 8).some(({ tile }) => tile.id === TODAY)).toBe(true);
  });

  it("closes up a page a person kept with gaps, when they ask, moving its tiles and changing no size (ADR-0147)", () => {
    const tiles = homeTiles([people], [project(1), project(2)]);
    // A page kept with a band of two empty columns beside the notice, and a project the person
    // made a card.
    const kept = layout(12, [
      { tile: NOTICES, x: 0, y: 0, size: "large" },
      { tile: LEAVE, x: 6, y: 0, size: "medium" },
      { tile: P1, x: 6, y: 2, size: "small" },
      { tile: P2, x: 8, y: 2, size: "icon" },
    ]);
    const hidden = { ...kept, hidden: [AWAY, APPROVALS] };
    const standing = arranged(tiles, hidden, 12);
    expect(places(standing)).toEqual({
      [NOTICES]: [0, 0, "large"],
      [LEAVE]: [6, 0, "medium"],
      [P1]: [6, 2, "small"],
      [P2]: [8, 2, "icon"],
    });
    // In the order they are read, each moved up to the first room at the size it has.
    const closed = tidied(standing, 12);
    expect(holdsTogether(closed, 12)).toBe(true);
    expect(places(closed)).toEqual({
      [NOTICES]: [0, 0, "large"],
      [LEAVE]: [4, 0, "medium"],
      [P1]: [8, 0, "small"],
      [P2]: [10, 0, "icon"],
    });
    expect(sameArrangement(closed, standing)).toBe(false);
    // Closed up once, there is nothing more to close, and the way to it is not offered.
    expect(sameArrangement(tidied(closed, 12), closed)).toBe(true);
    expect(sameArrangement(closed, closed.slice(1))).toBe(false);
    expect(tidied([], 12)).toEqual([]);
    // Nor is it on a page nobody arranged, which already stands so.
    for (const columns of [12, 8, 6, 4] as const) {
      const fresh = arranged(
        homeTiles([people, hr, hello], [1, 2, 3, 4, 5].map(project)),
        null,
        columns,
      );
      expect(sameArrangement(tidied(fresh, columns), fresh)).toBe(true);
    }
  });

  it("keeps the sizes kept at another width, so that icons stay icons where a row does not close", () => {
    // Eight icons kept on a phone fill a row of eight.
    const eight = [1, 2, 3, 4, 5, 6, 7, 8].map(project);
    const icons = layout(
      4,
      eight.map((one, at) => ({
        tile: `project:${one.id}`,
        x: at % 4,
        y: Math.floor(at / 4),
        size: "icon" as const,
      })),
    );
    const row = arranged(homeTiles([], eight), icons, 8);
    expect(row.every(({ size }) => size === "icon")).toBe(true);
    expect(emptyCells(row, 8)).toBe(0);
    // One project alone on twelve columns stays an icon, eleven cells of its row empty.
    const alone = arranged(
      homeTiles([], [project(1)]),
      layout(4, [{ tile: P1, x: 3, y: 0, size: "icon" }]),
      12,
    );
    expect(places(alone)).toEqual({ [P1]: [0, 0, "icon"] });
    expect(emptyCells(alone, 12)).toBe(11);
  });

  it("keeps what the person arranged, leaving what is empty empty", () => {
    const tiles = homeTiles([hr], [project(1)]);
    const home = layout(8, [
      { tile: P1, x: 7, y: 3, size: "small" },
      { tile: BALANCE, x: 3, y: 1, size: "medium" },
      { tile: TODAY, x: 0, y: 5, size: "wide" },
    ]);
    expect(places(arranged(tiles, home, 8))).toEqual({
      // Beside the edge, a tile comes back within the grid.
      [P1]: [6, 3, "small"],
      [BALANCE]: [3, 1, "medium"],
      [TODAY]: [0, 5, "wide"],
    });
  });

  it("brings in what is new at the first room, and leaves out what was taken off and what is gone", () => {
    const home: RestHome = {
      hidden: [P2],
      layouts: {
        8: [
          { tile: P1, x: 0, y: 0, size: "icon" },
          { tile: "widget:crm:deals", x: 1, y: 0, size: "small" },
          { tile: "project:0199c4d8-0000-7000-8000-000000000009", x: 3, y: 0, size: "icon" },
        ],
      },
    };
    expect(places(arranged(homeTiles([hr], [project(1), project(2)]), home, 8))).toEqual({
      [P1]: [0, 0, "icon"],
      [BALANCE]: [1, 0, "small"],
      [TODAY]: [3, 0, "medium"],
    });
  });

  it("gives a tile the size it starts at when the one kept is gone, and a tile on another's cells the nearest room", () => {
    const tiles = homeTiles([hr], [project(1)]);
    const home = layout(8, [
      { tile: BALANCE, x: 0, y: 0, size: "full" },
      { tile: P1, x: 1, y: 0, size: "icon" },
      { tile: P1, x: 5, y: 5, size: "icon" },
      { tile: TODAY, x: 0, y: 0, size: "medium" },
    ]);
    const placed = arranged(tiles, home, 8);
    expect(places(placed)).toMatchObject({ [BALANCE]: [0, 0, "small"], [P1]: [2, 0, "icon"] });
    expect(placed).toHaveLength(3);
    expect(holdsTogether(placed, 8)).toBe(true);
  });

  it("reads a width nobody arranged when another was in the same order from the top, at the sizes kept there, and keeps each width to itself (ADR-0147)", () => {
    const tiles = homeTiles([hr, hello], [project(1), project(2), project(3)]);
    const phone = layout(4, [
      { tile: BALANCE, x: 0, y: 0, size: "small" },
      { tile: TODAY, x: 0, y: 2, size: "medium" },
      { tile: P1, x: 0, y: 4, size: "icon" },
      { tile: P2, x: 1, y: 4, size: "icon" },
      { tile: P3, x: 2, y: 4, size: "icon" },
      { tile: "widget:hello:latest", x: 0, y: 5, size: "medium" },
    ]);
    // The phone's order and sizes on eight columns: no project made a card, no widget resized.
    expect(places(arranged(tiles, phone, 8))).toEqual({
      [BALANCE]: [0, 0, "small"],
      [TODAY]: [2, 0, "medium"],
      [P1]: [6, 0, "icon"],
      [P2]: [7, 0, "icon"],
      [P3]: [6, 1, "icon"],
      "widget:hello:latest": [0, 2, "medium"],
    });
    expect(rowsOf(arranged(tiles, phone, 8), 8)).toBe(4);
    expect(rowsOf([], 8)).toBe(0);
    for (const columns of [12, 8, 6] as const) {
      const at = arranged(tiles, phone, columns);
      expect(holdsTogether(at, columns)).toBe(true);
      for (const { tile, size } of at) {
        expect(size).toBe(phone.layouts[4]?.find((entry) => entry.tile === tile.id)?.size);
      }
    }
    // A size this grid does not have becomes the one the tile starts at here.
    const laptop = layout(8, [
      { tile: P1, x: 6, y: 4, size: "icon" },
      { tile: TODAY, x: 3, y: 2, size: "large" },
      { tile: BALANCE, x: 0, y: 0, size: "small" },
    ]);
    const narrow = arranged(homeTiles([hr], [project(1)]), laptop, 4);
    expect(places(narrow)).toEqual({
      [BALANCE]: [0, 0, "small"],
      [TODAY]: [0, 2, "large"],
      [P1]: [2, 0, "icon"],
    });
    expect(holdsTogether(narrow, 4)).toBe(true);
    // Arranged on the phone, the phone has its own; the laptop's stands.
    const kept = homeWith(laptop, moved(narrow, P1, 0, 6, 4), [], 4);
    expect(places(arranged(homeTiles([hr], [project(1)]), kept, 4))[P1]).toEqual([0, 6, "icon"]);
    expect(kept.layouts[8]).toEqual(laptop.layouts[8]);
    expect(places(arranged(homeTiles([hr], [project(1)]), kept, 8))[P1]).toEqual([6, 4, "icon"]);
  });

  it("gives a tile only the sizes that fit the grid, and the largest of them where its own does not", () => {
    const [balance, today, , latest] = homeTiles([hr, hello], [project(1)]);
    expect(balance && sizesAt(balance, 4)).toEqual(["small", "medium"]);
    expect(today && sizesAt(today, 8)).toEqual(["medium", "large", "wide"]);
    expect(today && sizesAt(today, 6)).toEqual(["medium", "large"]);
    expect(latest && startingSizeAt(latest, 8)).toBe("wide");
    expect(latest && startingSizeAt(latest, 6)).toBe("medium");
    expect(latest && startingSizeAt(latest, 4)).toBe("medium");
    const full = plugin("board", [
      {
        key: "all",
        name: { en: "All" },
        place: "home:top",
        size: "full",
        sizes: ["small", "large", "full"],
        defaultSize: "full",
      },
    ]);
    const [all] = homeTiles([full], []);
    expect(all && startingSizeAt(all, 8)).toBe("full");
    expect(all && startingSizeAt(all, 4)).toBe("large");
  });

  it("never shows a phone a size too wide for it, so that a frame is told what it has", () => {
    const tiles = homeTiles([hello], []);
    const kept = layout(8, [{ tile: "widget:hello:latest", x: 0, y: 0, size: "wide" }]);
    expect(places(arranged(tiles, kept, 8))["widget:hello:latest"]).toEqual([0, 0, "wide"]);
    expect(places(arranged(tiles, kept, 4))["widget:hello:latest"]).toEqual([0, 0, "medium"]);
    expect(places(arranged(tiles, null, 6))["widget:hello:latest"]).toEqual([0, 0, "medium"]);
    const back = added([], tiles[0] as HomeTile, 4);
    expect(back[0]?.size).toBe("medium");
  });

  it("has the tiles in the way give way from the nearest out, within a short wait", () => {
    expect(waitToGiveWay({ x: 3, y: 3 }, { x: 3, y: 3 })).toBe(0);
    expect(waitToGiveWay({ x: 4, y: 3 }, { x: 3, y: 3 })).toBe(22);
    expect(waitToGiveWay({ x: 6, y: 7 }, { x: 3, y: 3 })).toBe(110);
    expect(waitToGiveWay({ x: 40, y: 0 }, { x: 0, y: 0 })).toBe(130);
  });

  it("keeps a widget of an older console, with no size that fits, as wide as the grid", () => {
    const old = plugin("old", [
      { key: "strip", name: { en: "Strip" }, place: "home:top", size: "full", sizes: ["wide"] },
    ]);
    const [strip] = homeTiles([old], []);
    expect(strip && sizesAt(strip, 4)).toEqual(["wide"]);
    expect(footprintOf("wide", 4)).toEqual({ w: 4, h: 2 });
  });
});

describe("moving a tile (ADR-0061)", () => {
  const row = homeTiles([], [project(1), project(2), project(3)]);
  const standing = arranged(
    row,
    layout(8, [
      { tile: P1, x: 0, y: 0, size: "icon" },
      { tile: P2, x: 1, y: 0, size: "icon" },
      { tile: P3, x: 2, y: 0, size: "icon" },
    ]),
    8,
  );

  it("stands it where the place is free, up, down, left or right, leaving a gap where the person wants one", () => {
    expect(places(moved(standing, P1, 5, 2, 8))).toMatchObject({
      [P1]: [5, 2, "icon"],
      [P2]: [1, 0, "icon"],
      [P3]: [2, 0, "icon"],
    });
    // Off the grid, the nearest place on it.
    expect(places(moved(standing, P1, 99, 0, 8))[P1]).toEqual([7, 0, "icon"]);
    expect(places(moved(standing, P1, -4, -2, 8))[P1]).toEqual([0, 0, "icon"]);
    // A tile that is not there changes nothing.
    expect(moved(standing, "project:nothing", 1, 1, 8)).toBe(standing);
  });

  it("closes a row up behind it, both ways, as icons do on a phone", () => {
    expect(places(moved(standing, P3, 0, 0, 8))).toMatchObject({
      [P3]: [0, 0, "icon"],
      [P1]: [1, 0, "icon"],
      [P2]: [2, 0, "icon"],
    });
    expect(places(moved(standing, P1, 2, 0, 8))).toMatchObject({
      [P2]: [0, 0, "icon"],
      [P3]: [1, 0, "icon"],
      [P1]: [2, 0, "icon"],
    });
  });

  it("lets the smaller give way and the larger stay", () => {
    const tiles = homeTiles([hr], [project(1), project(2)]);
    const home = layout(8, [
      { tile: TODAY, x: 0, y: 0, size: "medium" },
      { tile: P1, x: 4, y: 0, size: "icon" },
      { tile: P2, x: 5, y: 0, size: "icon" },
      { tile: BALANCE, x: 0, y: 2, size: "small" },
    ]);
    const placed = arranged(tiles, home, 8);
    // A widget laid over the icons: they go to the nearest room.
    const over = moved(placed, TODAY, 4, 0, 8);
    expect(places(over)[TODAY]).toEqual([4, 0, "medium"]);
    expect(places(over)[P1]).toEqual([3, 0, "icon"]);
    expect(places(over)[P2]).toEqual([5, 2, "icon"]);
    expect(holdsTogether(over, 8)).toBe(true);
    // An icon laid on a widget: the widget stays, and the icon lands beside it.
    const on = moved(placed, P1, 1, 1, 8);
    expect(places(on)[TODAY]).toEqual([0, 0, "medium"]);
    expect(places(on)[P1]).toEqual([2, 2, "icon"]);
    expect(holdsTogether(on, 8)).toBe(true);
  });

  it("keeps every tile on cells of its own, wherever a tile is dropped", () => {
    const tiles = homeTiles([hr, hello], [project(1), project(2), project(3)]);
    for (const columns of [12, 8, 6, 4] as const) {
      const placed = arranged(tiles, null, columns);
      for (const tile of placed) {
        for (let y = 0; y < 10; y += 1) {
          for (let x = 0; x < columns; x += 1) {
            expect(holdsTogether(moved(placed, tile.tile.id, x, y, columns), columns)).toBe(true);
          }
        }
      }
    }
  });
});

describe("the other changes to the page (ADR-0061)", () => {
  const tiles = homeTiles([hr], [project(1), project(2)]);
  const placed = arranged(
    tiles,
    layout(8, [
      { tile: BALANCE, x: 0, y: 0, size: "small" },
      { tile: TODAY, x: 2, y: 0, size: "medium" },
      { tile: P1, x: 6, y: 0, size: "icon" },
      { tile: P2, x: 7, y: 0, size: "icon" },
    ]),
    8,
  );

  it("gives a tile another size where it stands, what its cells cover moving aside", () => {
    const larger = resized(placed, BALANCE, "medium", 8);
    expect(places(larger)[BALANCE]).toEqual([0, 0, "medium"]);
    expect(holdsTogether(larger, 8)).toBe(true);
    // Beside the edge, it comes back within the grid.
    const edge = resized(moved(placed, P1, 7, 0, 8), P1, "small", 8);
    expect(places(edge)[P1]).toEqual([6, 0, "small"]);
    expect(holdsTogether(edge, 8)).toBe(true);
    expect(resized(placed, "project:nothing", "small", 8)).toBe(placed);
  });

  it("puts a tile back at the first room, at the size it starts at", () => {
    const without = placed.filter((tile) => tile.tile.id !== BALANCE);
    const tile = tiles.find((candidate) => candidate.id === BALANCE);
    if (tile === undefined) {
      throw new Error("no tile");
    }
    expect(places(added(without, tile, 8))[BALANCE]).toEqual([0, 0, "small"]);
  });

  it("keeps what was changed, and the place of what the person may not see for now", () => {
    const home: RestHome = {
      hidden: [P2],
      layouts: {
        8: [
          { tile: P1, x: 1, y: 1, size: "icon" },
          { tile: "widget:crm:deals", x: 4, y: 4, size: "small" },
          { tile: P2, x: 3, y: 3, size: "icon" },
        ],
        4: [{ tile: P1, x: 0, y: 0, size: "icon" }],
      },
    };
    const shown = arranged(homeTiles([], [project(1)]), home, 8);
    const kept = homeWith(home, moved(shown, P1, 2, 0, 8), [P2], 8);
    expect(kept.hidden).toEqual([P2]);
    expect(kept.layouts[8]).toEqual([
      { tile: P1, x: 2, y: 0, size: "icon" },
      { tile: "widget:crm:deals", x: 4, y: 4, size: "small" },
    ]);
    expect(kept.layouts[4]).toEqual(home.layouts[4]);
    // Once the plugin is back, its widget stands where it stood.
    const back = arranged(
      homeTiles(
        [
          plugin("crm", [
            {
              key: "deals",
              name: { en: "Deals" },
              place: "home:top",
              size: "third",
              sizes: ["small"],
              defaultSize: "small",
            },
          ]),
        ],
        [project(1)],
      ),
      kept,
      8,
    );
    expect(places(back)["widget:crm:deals"]).toEqual([4, 4, "small"]);
  });
});

describe("a project at a glance (ADR-0105)", () => {
  const list = (rows: number, total: number, row: number = GLANCE_REM.task) => ({
    rows,
    total,
    row,
  });
  const STACKED: readonly (readonly [number, number])[] = [
    [0, 2],
    [1, 1],
    [0, Number.POSITIVE_INFINITY],
    [1, Number.POSITIVE_INFINITY],
    [2, Number.POSITIVE_INFINITY],
  ];

  it("is a size of three, and not the largest", () => {
    expect(["medium", "large", "wide"].every((size) => isGlanceSize(size as HomeTileSize))).toBe(
      true,
    );
    expect(["icon", "small", "full"].some((size) => isGlanceSize(size as HomeTileSize))).toBe(
      false,
    );
  });

  it("gives its rows out in order, each whole, and says how many more there are", () => {
    const tasks = list(6, 9);
    const goals = list(3, 3, GLANCE_REM.goal);
    const review = list(2, 2);
    // No room: nothing, not a heading alone.
    expect(glanceFit(1, [tasks, goals, review], STACKED)).toEqual([0, 0, 0]);
    // Room for a heading, two tasks and the line of how many more: the tasks first.
    const two = GLANCE_REM.heading + 2 * GLANCE_REM.task + GLANCE_REM.more;
    expect(glanceFit(two, [tasks, goals, review], STACKED)).toEqual([2, 0, 0]);
    // Then a goal, under a hairline, before more tasks.
    const andGoal =
      two + GLANCE_REM.between + GLANCE_REM.heading + GLANCE_REM.goal + GLANCE_REM.more;
    expect(glanceFit(andGoal, [tasks, goals, review], STACKED)).toEqual([2, 1, 0]);
    // A tall room shows every goal and what waits for review once the tasks are all there.
    expect(glanceFit(60, [tasks, goals, review], STACKED)).toEqual([6, 3, 2]);
    // A list with no rows takes no room.
    expect(glanceFit(60, [tasks, goals, list(0, 0)], STACKED)).toEqual([6, 3, 0]);
  });

  it("holds nothing in a room that is no number", () => {
    const lists = [list(6, 9), list(3, 3, GLANCE_REM.goal)];
    expect(glanceFit(Number.NaN, lists, STACKED)).toEqual([0, 0]);
    expect(glanceFit(Number.POSITIVE_INFINITY, lists, STACKED)).toEqual([0, 0]);
    expect(glanceFit(-3, lists, STACKED)).toEqual([0, 0]);
    expect(glanceFit(10, [], STACKED)).toEqual([]);
  });

  it("names the projects a page shows at a glance, in its order, and none where there is none", () => {
    const tiles = homeTiles([hr], [project(1), project(2), project(3)]);
    const shown = arranged(
      tiles,
      layout(8, [
        { tile: P1, x: 0, y: 0, size: "large" },
        { tile: BALANCE, x: 4, y: 0, size: "medium" },
        { tile: P2, x: 4, y: 2, size: "small" },
        { tile: P3, x: 0, y: 4, size: "wide" },
      ]),
      8,
    );
    // The widget is no project, and a card is no glance.
    expect(glanceProjects(shown).map((one) => one.key)).toEqual(["p1", "p3"]);
    expect(glanceProjects(arranged(tiles, null, 8))).toEqual([]);
    expect(glanceProjects([])).toEqual([]);
  });

  it("reads a project kept at a size it does not come in as an icon", () => {
    const tiles = homeTiles([], [project(1), project(2)]);
    // `full` was drawn for a project once and never kept by a release; a layout that holds it,
    // or a word that is no size at all, must not break the page.
    const kept = {
      hidden: [],
      layouts: {
        8: [
          { tile: P1, x: 0, y: 0, size: "full" },
          { tile: P2, x: 0, y: 4, size: "enormous" },
        ],
      },
    } as unknown as RestHome;
    const shown = arranged(tiles, kept, 8);
    expect(places(shown)[P1]?.[2]).toBe("icon");
    expect(places(shown)[P2]?.[2]).toBe("icon");
    expect(glanceProjects(shown)).toEqual([]);
    expect(holdsTogether(shown, 8)).toBe(true);
  });

  it("drops the line of how many more where the last row fits in its place", () => {
    // Three tasks of three take a heading and three rows, no line of more.
    const room = GLANCE_REM.heading + 3 * GLANCE_REM.task;
    expect(glanceFit(room, [list(3, 3)], [[0, Number.POSITIVE_INFINITY]])).toEqual([3]);
    expect(glanceFit(room, [list(3, 4)], [[0, Number.POSITIVE_INFINITY]])).toEqual([2]);
  });
});
