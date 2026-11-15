import { randomBytes } from "node:crypto";
import process from "node:process";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createTestDatabase, DEV_DATABASE_URL } from "./testing.js";

// The database a preview keeps between runs (`pnpm dev --keep`): left where it is when the
// console ends, and dropped all the same when what was being made in it was left half made,
// since the next run would start from it as if it were whole.

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL;

async function isThere(name: string): Promise<boolean> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    const found = await admin.query("select 1 from pg_database where datname = $1", [name]);
    return found.rowCount === 1;
  } finally {
    await admin.end();
  }
}

describe("a database made to be kept", () => {
  it("is left when it is dropped, started from again, and gone once it is discarded", async () => {
    const name = `console_test_kept_${randomBytes(6).toString("hex")}`;
    const first = await createTestDatabase(ADMIN_URL, { name, keep: true });
    await first.drop();
    expect(await isThere(name)).toBe(true);
    // The next run starts from it, and discards it: nothing of it is left to start from.
    const second = await createTestDatabase(ADMIN_URL, { name, keep: true });
    await second.drop({ discard: true });
    expect(await isThere(name)).toBe(false);
    // Made and migrated like every test's database: given the time a hook has, and more.
  }, 120_000);
});
