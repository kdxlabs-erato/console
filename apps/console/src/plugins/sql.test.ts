import { createHash, createHmac, randomBytes } from "node:crypto";
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import type { Database } from "../db/client.js";
import { errorForLog } from "../logger.js";
import {
  CONSOLE_SCHEMAS,
  closingStatement,
  PluginSqlService,
  rolePassword,
  roleRefusal,
  scramVerifier,
  sqlNameOf,
} from "./sql.js";

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

describe("what a role is given in place of its password", () => {
  const keysOf = (verifier: string): { stored: Buffer; server: Buffer } => {
    const [stored = "", server = ""] = (verifier.split("$")[2] ?? "").split(":");
    return { stored: Buffer.from(stored, "base64"), server: Buffer.from(server, "base64") };
  };

  it("is what the server keeps of a password: the example exchange of RFC 7677 holds against it", () => {
    // The RFC's own example: the user `user`, the password and the salt it names, 4096 rounds.
    const salt = Buffer.from("W22ZaJ0SNY7soEsUEjb6gQ==", "base64");
    const verifier = scramVerifier(["pen", "cil"].join(""), salt);
    expect(verifier.startsWith("SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$")).toBe(true);
    const { stored, server } = keysOf(verifier);
    const nonce = "rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0";
    const exchange = [
      "n=user,r=rOprNGfwEbeRWgbNEkqO",
      `r=${nonce},s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096`,
      `c=biws,r=${nonce}`,
    ].join(",");
    // The proof the RFC's client sent proves the password to a server that holds these keys.
    const proof = Buffer.from("dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=", "base64");
    const signature = createHmac("sha256", stored).update(exchange).digest();
    const clientKey = Buffer.from(proof.map((byte, index) => byte ^ (signature[index] ?? 0)));
    expect(createHash("sha256").update(clientKey).digest().equals(stored)).toBe(true);
    // And the server proves itself to that client with the signature the RFC's server sent.
    expect(createHmac("sha256", server).update(exchange).digest("base64")).toBe(
      "6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=",
    );
  });

  it("holds nothing of the password, and a salt of its own each time", () => {
    const password = randomBytes(32).toString("base64url");
    const one = scramVerifier(password);
    expect(one).toMatch(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/,
    );
    expect(one).not.toContain(password);
    expect(scramVerifier(password)).not.toBe(one);
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

describe("the password of a plugin's role (ADR-0148)", () => {
  // Invented for the test, and built from parts: no line of this file is shaped like a credential.
  const words = ["an", "invented", "word", "for", "tests"].join("-");
  const address = (password: string, rest = "@db.example:5432/console") =>
    `postgres://console:${password}${rest}`;

  it("is the same wherever the database's address is the same, and kept nowhere", () => {
    const first = rolePassword(address(words), "plugin_tally");
    expect(first).toBe(rolePassword(address(words), "plugin_tally"));
    // Letters, digits, `-` and `_`: what the preparation the protocol asks of a password leaves
    // as it is, and 256 bits of them.
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The host, the port and the database are not the key: a replica reached by another name
    // arrives at the same password.
    expect(
      rolePassword(address(words, "@replica.example:6432/console?sslmode=require"), "plugin_tally"),
    ).toBe(first);
  });

  it("is another for another role, and for another password of the console's", () => {
    const first = rolePassword(address(words), "plugin_tally");
    expect(rolePassword(address(words), "plugin_tally2")).not.toBe(first);
    expect(rolePassword(address(words), "plugin_tall")).not.toBe(first);
    expect(rolePassword(address(`${words}x`), "plugin_tally")).not.toBe(first);
    // The key and the name are two fields: what one ends with is not what the other begins with.
    expect(rolePassword(address("ab"), "cplugin")).not.toBe(rolePassword(address("abc"), "plugin"));
  });

  it("says nothing of the console's own password", () => {
    const derived = rolePassword(address(words), "plugin_tally") ?? "";
    expect(derived).not.toContain(words);
    expect(Buffer.from(derived, "base64url").toString("latin1")).not.toContain(words);
  });

  it("reads a password as the driver does, written with its escapes or without", () => {
    const plain = rolePassword(address("p-q_r.s"), "plugin_tally");
    expect(rolePassword(address("p%2Dq%5Fr%2Es"), "plugin_tally")).toBe(plain);
    // One that is escaped as no text is escaped is taken as it is written.
    expect(rolePassword(address("100%zz"), "plugin_tally")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rolePassword(address("100%zz"), "plugin_tally")).not.toBe(
      rolePassword(address("100"), "plugin_tally"),
    );
  });

  it("is nothing where the address carries no password, or is no address", () => {
    expect(rolePassword("postgres://console@db.example:5432/console", "plugin_tally")).toBe(
      undefined,
    );
    expect(rolePassword("postgres://console:@db.example:5432/console", "plugin_tally")).toBe(
      undefined,
    );
    expect(rolePassword("postgres://db.example/console", "plugin_tally")).toBe(undefined);
    expect(rolePassword("", "plugin_tally")).toBe(undefined);
    expect(rolePassword("not an address", "plugin_tally")).toBe(undefined);
    expect(rolePassword("x".repeat(100_000), "plugin_tally")).toBe(undefined);
  });

  it("is nothing where a parameter of the address says who signs in, which the driver takes over what stands before the host", () => {
    // With either, the console signs in with another user or password than the address shows:
    // a key read from before the host would be the wrong one, and a pool made from the address
    // for the plugin's role would sign in as the parameter's user, the console's own.
    for (const query of [
      "?user=console",
      "?password=x",
      "?sslmode=require&user=console&password=x",
      "?password=",
    ]) {
      expect(rolePassword(address("p-q", `@db.example:5432/console${query}`), "plugin_tally")).toBe(
        undefined,
      );
    }
    // Any other parameter is the address's own, and changes nothing of the key.
    expect(
      rolePassword(address("p-q", "@db.example:5432/console?sslmode=require"), "plugin_tally"),
    ).toBe(rolePassword(address("p-q", "@db.example:5432/console"), "plugin_tally"));
  });

  it("holds against a name and a password of any length and any character", () => {
    const long = rolePassword(address("p".repeat(50_000)), `plugin_${"k".repeat(50_000)}`);
    expect(long).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const odd = rolePassword(
      address(encodeURIComponent(`a"b'c${String.fromCodePoint(92, 0x1f512)} d`)),
      'plugin_"; drop role x; --',
    );
    expect(odd).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("a deployment whose database address carries no password", () => {
  const lines: string[] = [];
  // Never reached: the service answers before it asks the database anything.
  const service = new PluginSqlService({
    database: undefined as unknown as Database,
    connectionString: "postgres://console@db.example:5432/console",
    ca: undefined,
    logger: pino({ level: "warn" }, { write: (line: string) => void lines.push(line) }),
  });

  it("gives no plugin a schema, and says why once", async () => {
    expect(await service.available()).toBe(false);
    expect(await service.available()).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(
      "storage:sql needs the database's address to carry its user and password before the host",
    );
  });

  it("refuses to provision, to run a statement and to open a transaction", async () => {
    for (const refused of [
      service.provision("tally"),
      service.query("tally", "select 1", []),
      service.begin("tally"),
    ]) {
      await expect(refused).rejects.toMatchObject({
        code: "plugin.unavailable",
        message: expect.stringContaining("to carry its user and password before the host"),
      });
    }
  });
});
