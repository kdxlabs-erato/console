import { randomBytes } from "node:crypto";
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { describe, expect, it } from "vitest";
import { errorForLog } from "../logger.js";
import { CONSOLE_SCHEMAS, closingStatement, roleRefusal, sqlNameOf } from "./sql.js";

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

describe("what a statement that gave a role its password failed with", () => {
  // Drawn as the console draws one, so that no literal shaped like a secret stands in the file.
  const password = randomBytes(32).toString("base64url");
  const statement = `create role "plugin_tally" with login noinherit nocreatedb nocreaterole nosuperuser connection limit 4 password '${password}'`;

  /** The driver's error as node-postgres makes it, with the fields it may carry. */
  function driverError(fields: Readonly<Record<string, string>>): DatabaseError {
    const error = new DatabaseError(fields.message ?? "", 100, "error");
    Object.assign(error, fields);
    return error;
  }

  /** Everything a log line or an event could be made of: the refusal, as a line keeps it, and whole. */
  const everything = (refusal: Error): string =>
    [refusal.message, refusal.stack, JSON.stringify(errorForLog(refusal)), JSON.stringify(refusal)]
      .map(String)
      .join("\n");

  it("names the role and gives the database's code and words, and nothing of the statement", () => {
    const refusal = roleRefusal(
      "plugin_tally",
      "made",
      new DrizzleQueryError(
        statement,
        [],
        driverError({
          message: "permission denied to create role",
          code: "42501",
          detail: "Only roles with the CREATEROLE attribute may create roles.",
        }),
      ),
      password,
    );
    expect(refusal).toMatchObject({ code: "plugin.unavailable", status: 503 });
    expect(refusal.message).toBe(
      'the role "plugin_tally" could not be made: the database answered 42501, permission denied to create role (Only roles with the CREATEROLE attribute may create roles.)',
    );
    expect(refusal.cause).toBeUndefined();
    expect(everything(refusal)).not.toContain(password);
    expect(everything(refusal)).not.toContain("connection limit");
  });

  it("takes the password out of the driver's words, and leaves its other fields", () => {
    const refusal = roleRefusal(
      "plugin_tally",
      "changed",
      new DrizzleQueryError(
        statement,
        [password],
        driverError({
          message: `syntax error at or near "'${password}'"`,
          code: "42601",
          detail: `the literal '${password}'`,
          hint: `'${password}'`,
          where: `SQL statement "${statement}"`,
          internalQuery: statement,
          position: "120",
        }),
      ),
      password,
    );
    expect(refusal.message).toBe(
      `the role "plugin_tally" could not be changed: the database answered 42601, syntax error at or near "'[password]'" (the literal '[password]')`,
    );
    expect(everything(refusal)).not.toContain(password);
  });

  it("says nothing of what was thrown where the ORM's error has nothing beneath it", () => {
    const refusal = roleRefusal(
      "plugin_tally",
      "made",
      new DrizzleQueryError(statement, []),
      password,
    );
    expect(refusal.message).toBe(
      'the role "plugin_tally" could not be made: the database answered without a code',
    );
    expect(everything(refusal)).not.toContain("create role");
  });

  it("holds against what is no error, a cause that is itself, and words without end", () => {
    expect(roleRefusal("plugin_tally", "made", statement, password).message).toBe(
      'the role "plugin_tally" could not be made: the database answered without a code',
    );
    const looped = new DrizzleQueryError(statement, []);
    looped.cause = looped;
    expect(everything(roleRefusal("plugin_tally", "made", looped, password))).not.toContain(
      password,
    );
    const long = roleRefusal(
      "plugin_tally",
      "made",
      new DrizzleQueryError(
        statement,
        [],
        driverError({ message: "x".repeat(100_000), code: "XX000" }),
      ),
      password,
    );
    expect(long.message.length).toBeLessThan(400);
  });
});

describe("the console's schemas", () => {
  it("are closed to every plugin's role, and none of them is a plugin's", () => {
    expect([...CONSOLE_SCHEMAS].sort()).toEqual(["drizzle", "feed_order", "public", "transcript"]);
    expect(CONSOLE_SCHEMAS.some((schema) => schema.startsWith(sqlNameOf("")))).toBe(false);
  });
});
