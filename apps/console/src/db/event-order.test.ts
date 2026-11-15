import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { orderLockOf } from "./queries/event-order.js";

// The order of a feed (ADR-0125) holds only while every event is inserted under the stream's
// lock. One function inserts into each stream and takes it; this reads the sources for an insert
// anywhere else, which would number an event that readers by number may pass over.

const SOURCES = fileURLToPath(new URL("..", import.meta.url));

function sourcesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourcesUnder(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

/** An insert into either stream, through the ORM or written out: the table's name in either casing. */
const INSERTS =
  /\.insert\(\s*(?:events|pluginEvents)\s*,?\s*\)|insert\s+into\s+"?(?:events|plugin_events)"?[\s(]/gi;

function insertsIn(text: string): string[] {
  return [...text.matchAll(INSERTS)].map((match) => match[0].replaceAll(/\s+/g, " ").trim());
}

describe("the writers of the feeds", () => {
  it("are one function a stream, each taking the stream's lock before it inserts", () => {
    const found = sourcesUnder(SOURCES).flatMap((path) =>
      insertsIn(readFileSync(path, "utf8")).map(
        (insert) => `${relative(SOURCES, path).split(sep).join("/")}: ${insert}`,
      ),
    );
    expect(found.sort()).toEqual([
      "db/queries/events.ts: .insert(events)",
      "db/queries/plugin-board.ts: .insert(pluginEvents)",
    ]);
    for (const [file, stream, table] of [
      ["db/queries/events.ts", "console", "events"],
      ["db/queries/plugin-board.ts", "plugin", "pluginEvents"],
    ] as const) {
      const text = readFileSync(join(SOURCES, file), "utf8");
      const held = text.indexOf(`await holdEventOrder(tx, "${stream}");`);
      const inserted = text.search(new RegExp(`\\.insert\\(\\s*${table}\\s*\\)`));
      expect(held, `${file} takes the lock`).toBeGreaterThan(-1);
      expect(inserted, `${file} inserts after the lock`).toBeGreaterThan(held);
      // Between the lock and the insert nothing ends the transaction: the same function, a few lines on.
      expect(text.slice(held, inserted).split("\n").length).toBeLessThan(6);
    }
  });

  it("finds an insert written any other way", () => {
    expect(insertsIn("await tx.insert(events).values(row)")).toEqual([".insert(events)"]);
    expect(insertsIn("handle\n  .insert(\n    pluginEvents,\n  )")).toEqual([
      ".insert( pluginEvents, )",
    ]);
    expect(insertsIn('sql`INSERT INTO "events" (kind) values (1)`')).toEqual([
      'INSERT INTO "events"',
    ]);
    expect(insertsIn("sql`insert into plugin_events(kind) values (1)`")).toEqual([
      "insert into plugin_events(",
    ]);
    // Other tables whose names begin the same are not the feeds.
    expect(insertsIn("tx.insert(transcriptEvents)")).toEqual([]);
    expect(insertsIn("insert into events_archive (id) values (1)")).toEqual([]);
  });
});

describe("the lock of a feed's order", () => {
  it("is two keys, one space and a key a stream, each an integer as PostgreSQL takes them", () => {
    const [space, consoleKey] = orderLockOf("console");
    const [pluginSpace, pluginKey] = orderLockOf("plugin");
    expect(pluginSpace).toBe(space);
    expect(pluginKey).not.toBe(consoleKey);
    for (const part of [space, consoleKey, pluginKey]) {
      expect(Number.isInteger(part) && part >= -(2 ** 31) && part < 2 ** 31).toBe(true);
    }
  });
});
