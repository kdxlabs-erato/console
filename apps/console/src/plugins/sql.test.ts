import { describe, expect, it } from "vitest";
import { CONSOLE_SCHEMAS, closingStatement, sqlNameOf } from "./sql.js";

// What a refusal of `storage:sql` tells the database's owner to run (ADR-0133): the statement is
// read by a person and run as it is written, so its names are quoted as PostgreSQL reads them.

describe("the statement the database's owner runs", () => {
  it("gives the console's user by name what it had through PUBLIC, then takes it from PUBLIC", () => {
    expect(closingStatement(["public"], "console")).toBe(
      'GRANT USAGE, CREATE ON SCHEMA "public" TO "console"; REVOKE ALL ON SCHEMA "public" FROM PUBLIC;',
    );
  });

  it("says each schema in turn", () => {
    expect(closingStatement(["public", "transcript"], "app")).toBe(
      'GRANT USAGE, CREATE ON SCHEMA "public" TO "app"; REVOKE ALL ON SCHEMA "public" FROM PUBLIC; GRANT USAGE, CREATE ON SCHEMA "transcript" TO "app"; REVOKE ALL ON SCHEMA "transcript" FROM PUBLIC;',
    );
  });

  it("quotes a name that holds a quote, a semicolon or a capital as one identifier", () => {
    expect(closingStatement(["public"], 'Ops"; DROP ROLE x; --')).toBe(
      'GRANT USAGE, CREATE ON SCHEMA "public" TO "Ops""; DROP ROLE x; --"; REVOKE ALL ON SCHEMA "public" FROM PUBLIC;',
    );
  });
});

describe("the console's schemas", () => {
  it("are closed to every plugin's role, and none of them is a plugin's", () => {
    expect([...CONSOLE_SCHEMAS].sort()).toEqual(["drizzle", "feed_order", "public", "transcript"]);
    expect(CONSOLE_SCHEMAS.some((schema) => schema.startsWith(sqlNameOf("")))).toBe(false);
  });
});
