// A schema and a login role of a plugin's own (ADR-0051, docs/specs/plugins.md, "SQL"): what the
// capability `storage:sql` opens. Enabling creates `plugin_<key>` and the role of the same name,
// with rights on that schema and nothing else, a search path of its own, a statement timeout and
// a connection limit; the console draws the role's password at every boot and keeps it in memory
// alone. The plugin's migrations are applied as the role, and `ctx.sql` runs on a pool of the
// role in the parent, its results bounded. Purge drops the schema and the role.
//
// The role may use no schema of the console's (ADR-0133): a role that may use a schema may name a
// table in it, and naming a table takes a lock on it before any right on the table is asked for.
// What every role holds through PUBLIC is taken from PUBLIC, which only a schema's owner may do;
// where the console's role may not, provisioning is refused with what the owner runs.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MAX_PLUGIN_SQL_ROWS,
  PLUGIN_SQL_CONNECTIONS,
  PLUGIN_SQL_STATEMENT_MS,
  PluginRefusal,
} from "@skillcdn/console/plugin";
import { sql } from "drizzle-orm";
import { Client, Pool, type PoolClient } from "pg";
import { type Database, drizzleOf, sslOf } from "../db/client.js";
import type { Logger } from "../logger.js";

/** The bytes a result may hold as JSON: `MAX_PLUGIN_MESSAGE_BYTES`, measured before it crosses to the host. */
const RESULT_BYTES_AT_MOST = 4 * 1024 * 1024;
/** How long an open transaction waits for its plugin before it is rolled back. */
const TRANSACTION_TTL_MS = 60_000;
/** The console's own migration lock, which the plugins' migrations run under too. */
const MIGRATION_LOCK_KEY = 5_434_002;
const MIGRATION_NAME = /^\d{4}-[a-z0-9-]+\.sql$/;
/** What a role may hold that a plugin's never does: the column that says so, and how it is taken. */
const ROLE_POWERS = [
  ["rolsuper", "nosuperuser"],
  ["rolcreatedb", "nocreatedb"],
  ["rolcreaterole", "nocreaterole"],
  ["rolreplication", "noreplication"],
  ["rolbypassrls", "nobypassrls"],
] as const;

export interface PluginSqlOptions {
  readonly database: Database;
  /** The console's own connection string and authority, from which the role's connections are made. */
  readonly connectionString: string;
  readonly ca: string | undefined;
  readonly logger: Logger;
}

export interface SqlResult {
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
}

/**
 * The console's own schemas: its tables, the record of its migrations, the transcript and the
 * feeds' order. No plugin's role may use any of them, nor another plugin's schema (ADR-0133).
 */
export const CONSOLE_SCHEMAS: readonly string[] = ["public", "drizzle", "transcript", "feed_order"];

/** The schema and the role of a plugin: its key, with `-` as `_`, after `plugin_`. */
export function sqlNameOf(key: string): string {
  return `plugin_${key.replaceAll("-", "_")}`;
}

/** An identifier quoted for a statement that cannot take it as a parameter. */
function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Schemas as a refusal names them. */
function schemasNamed(schemas: readonly string[]): string {
  return `${schemas.length === 1 ? "the schema" : "the schemas"} ${schemas.map(quoted).join(", ")}`;
}

/**
 * What the database's owner runs, once, where the console's role may not take from PUBLIC what
 * it holds on the schemas named: the console's role is given by name what it may have had through
 * PUBLIC, then PUBLIC loses it.
 */
export function closingStatement(schemas: readonly string[], consoleUser: string): string {
  return schemas
    .map(
      (schema) =>
        `GRANT USAGE, CREATE ON SCHEMA ${quoted(schema)} TO ${quoted(consoleUser)}; REVOKE ALL ON SCHEMA ${quoted(schema)} FROM PUBLIC;`,
    )
    .join(" ");
}

/**
 * Whether the database refused a statement for want of a right (`42501`): a revoke by a role that
 * holds nothing on the schema. The ORM throws an error of its own with the driver's as its cause.
 */
function refusedForWantOfRight(error: unknown): boolean {
  for (let at: unknown = error, depth = 0; depth < 4; depth += 1) {
    if (typeof at !== "object" || at === null) {
      return false;
    }
    if ("code" in at && at.code === "42501") {
      return true;
    }
    at = "cause" in at ? at.cause : undefined;
  }
  return false;
}

/** A literal quoted for a statement that cannot take it as a parameter: a role's verifier, a setting. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** How many rounds a verifier's key is derived with: what PostgreSQL derives its own with. */
const SCRAM_ITERATIONS = 4096;

/**
 * A password as PostgreSQL keeps one (SCRAM-SHA-256, RFCs 5802 and 7677): a salt, and two keys
 * derived from the password, by which the server tells that a login knows it and from which the
 * password cannot be had. A plugin's role is given its password in this form, never as it is: a
 * server that logs its statements (`log_statement` of `ddl` or more) writes the statement down
 * whole, and what stands in it then is no credential. The password is drawn here from letters,
 * digits, `-` and `_`, which the preparation the protocol asks of a password leaves as they are.
 */
export function scramVerifier(password: string, salt: Buffer = randomBytes(16)): string {
  const salted = pbkdf2Sync(password, salt, SCRAM_ITERATIONS, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${SCRAM_ITERATIONS}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

/**
 * What a statement that gave the plugin's role its password failed with, as a refusal that names
 * the role and gives the database's code and words, and nothing of the statement: the ORM's error
 * quotes the statement whole, what it gave as the password in it, in its message, beside it and
 * in its stack, and whatever is thrown here goes on to the log and to the plugin's
 * `plugin.failed` event. The words are the driver's own error's, beneath the ORM's: its message
 * and its detail, which say why without quoting the statement, and are cleared of what was given
 * (`password`, which is the verifier the statement carried) all the same. Nothing of what was
 * thrown is kept as the refusal's cause.
 */
export function roleRefusal(
  name: string,
  doing: "made" | "changed",
  error: unknown,
  password: string,
): PluginRefusal {
  let driver: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    const cause =
      typeof driver === "object" && driver !== null && "cause" in driver ? driver.cause : undefined;
    if (typeof cause !== "object" || cause === null) {
      break;
    }
    driver = cause;
  }
  // The ORM's error with nothing beneath it says nothing: its message is the statement.
  const told = driver === error && error instanceof Error && "query" in error ? undefined : driver;
  const field = (key: string): string | undefined => {
    const value =
      typeof told === "object" && told !== null
        ? (told as Readonly<Record<string, unknown>>)[key]
        : undefined;
    return typeof value === "string" && value.length > 0
      ? value.replaceAll(password, "[password]").slice(0, 300)
      : undefined;
  };
  const code = field("code");
  const message = field("message");
  const detail = field("detail");
  const words =
    message === undefined ? "" : `, ${message}${detail === undefined ? "" : ` (${detail})`}`;
  return new PluginRefusal(
    "plugin.unavailable",
    `the role ${quoted(name)} could not be ${doing}: the database answered ${code ?? "without a code"}${words}`,
  );
}

export class PluginSqlService {
  private readonly options: PluginSqlOptions;
  private readonly passwords = new Map<string, string>();
  private readonly pools = new Map<string, Pool>();
  private readonly transactions = new Map<string, { client: PoolClient; timer: NodeJS.Timeout }>();
  private counter = 0;

  constructor(options: PluginSqlOptions) {
    this.options = options;
  }

  /** Whether the console's database user may make roles: without `CREATEROLE`, no plugin gets a schema. */
  async available(): Promise<boolean> {
    try {
      const result = await drizzleOf(this.options.database).execute<{ able: boolean }>(
        sql`select (rolcreaterole or rolsuper) as able from pg_roles where rolname = current_user`,
      );
      return result.rows[0]?.able === true;
    } catch (error) {
      this.options.logger.warn(
        { err: error },
        "whether plugins may have schemas could not be read",
      );
      return false;
    }
  }

  /**
   * The console's schemas and the plugins' that PUBLIC holds a right on: every role may use
   * such a schema, a plugin's among them.
   */
  private async openToPublic(): Promise<string[]> {
    const result = await drizzleOf(this.options.database).execute<{ schema: string }>(sql`
      select n.nspname as schema from pg_namespace n
      where (n.nspname in (${sql.join(
        CONSOLE_SCHEMAS.map((schema) => sql`${schema}`),
        sql`, `,
      )}) or starts_with(n.nspname, 'plugin_'))
        and exists (
          select 1 from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
          where a.grantee = 0)
      order by n.nspname`);
    return result.rows.map((row) => row.schema);
  }

  /**
   * The console's schemas and the other plugins' that the plugin's role may use or create in,
   * by a grant of its own or through PUBLIC: none, once it is provisioned.
   */
  private async reachableBy(name: string): Promise<string[]> {
    const result = await drizzleOf(this.options.database).execute<{ schema: string }>(sql`
      select n.nspname as schema from pg_namespace n
      where (n.nspname in (${sql.join(
        CONSOLE_SCHEMAS.map((schema) => sql`${schema}`),
        sql`, `,
      )}) or (starts_with(n.nspname, 'plugin_') and n.nspname <> ${name}))
        and has_schema_privilege(${name}::name, n.oid, 'USAGE, CREATE')
      order by n.nspname`);
    return result.rows.map((row) => row.schema);
  }

  /**
   * Takes from PUBLIC what it holds on the console's schemas and the plugins', so that no
   * plugin's role can name a table there (ADR-0133). Only a schema's owner may: where the
   * console's role is not, and PUBLIC keeps its right, `storage:sql` is refused with the statement
   * the database's owner runs. Every role of the database loses what it had through PUBLIC, which
   * the log says.
   */
  private async closeToPublic(): Promise<void> {
    const open = await this.openToPublic();
    if (open.length === 0) {
      return;
    }
    const db = drizzleOf(this.options.database);
    for (const schema of open) {
      try {
        await db.execute(sql.raw(`revoke all on schema ${quoted(schema)} from public`));
      } catch (error) {
        // A role with no right on the schema is refused outright; one with a right it may not
        // pass on is only warned, and nothing is revoked. Both are seen below.
        if (!refusedForWantOfRight(error)) {
          throw error;
        }
      }
    }
    const still = await this.openToPublic();
    const closed = open.filter((schema) => !still.includes(schema));
    if (closed.length > 0) {
      this.options.logger.warn(
        { schemas: closed },
        "PUBLIC may no longer use these schemas, so that no plugin's role can name a table of the console's; a role of this database that used them through PUBLIC is to be granted USAGE by name",
      );
    }
    if (still.length > 0) {
      const user = await db.execute<{ user: string }>(sql`select current_user as user`);
      throw new PluginRefusal(
        "plugin.unavailable",
        `storage:sql needs ${schemasNamed(still)} closed to every role not granted it by name, and only a schema's owner may close it, which the console's database user is not. The database's owner runs, once: ${closingStatement(still, user.rows[0]?.user ?? "")}`,
      );
    }
  }

  /**
   * Makes the plugin's schema and role, or brings them to what they must be, and draws the role's
   * password anew. The role may use and create in its schema and use no other of the console's or
   * the plugins'; its statements time out and its connections are few. Refused, with nothing
   * made, where the console's schemas cannot be closed to PUBLIC.
   */
  async provision(key: string): Promise<void> {
    const name = sqlNameOf(key);
    await this.closeToPublic();
    const password = randomBytes(32).toString("base64url");
    const db = drizzleOf(this.options.database);
    await db.execute(sql.raw(`create schema if not exists ${quoted(name)}`));
    // The schema is its role's alone, whatever default privileges the database's keeper set.
    await db.execute(sql.raw(`revoke all on schema ${quoted(name)} from public`));
    const roles = await db.execute<Record<(typeof ROLE_POWERS)[number][0], boolean>>(
      sql`select ${sql.raw(ROLE_POWERS.map(([column]) => column).join(", "))} from pg_roles where rolname = ${name}`,
    );
    const role = roles.rows[0];
    // Only a power the role holds is named to be taken: a database user that is no superuser
    // may not name SUPERUSER at all, nor CREATEDB without holding it, even to say "no".
    const taken = ROLE_POWERS.filter(([column]) => role?.[column] === true).map(
      ([, without]) => without,
    );
    // The statement carries what the server keeps of the password, not the password: a server
    // that logs its statements writes this one down, and so does whatever the ORM throws.
    const verifier = scramVerifier(password);
    const statement =
      role !== undefined
        ? `alter role ${quoted(name)} with login noinherit ${taken.join(" ")} connection limit ${PLUGIN_SQL_CONNECTIONS} password ${literal(verifier)}`
        : `create role ${quoted(name)} with login noinherit nocreatedb nocreaterole nosuperuser connection limit ${PLUGIN_SQL_CONNECTIONS} password ${literal(verifier)}`;
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      // What the ORM throws quotes the statement whole, the verifier in it.
      throw roleRefusal(name, role === undefined ? "made" : "changed", error, verifier);
    }
    await db.execute(sql.raw(`alter role ${quoted(name)} set search_path = ${quoted(name)}`));
    await db.execute(
      sql.raw(
        `alter role ${quoted(name)} set statement_timeout = ${literal(`${PLUGIN_SQL_STATEMENT_MS}ms`)}`,
      ),
    );
    await db.execute(sql.raw(`grant usage, create on schema ${quoted(name)} to ${quoted(name)}`));
    // What the role was given by name elsewhere, by whoever gave it.
    for (const schema of await this.reachableBy(name)) {
      try {
        await db.execute(sql.raw(`revoke all on schema ${quoted(schema)} from ${quoted(name)}`));
      } catch (error) {
        if (!refusedForWantOfRight(error)) {
          throw error;
        }
      }
    }
    const pool = this.pools.get(key);
    if (pool !== undefined) {
      this.pools.delete(key);
      await pool.end().catch(() => undefined);
    }
    const reachable = await this.reachableBy(name);
    if (reachable.length > 0) {
      this.passwords.delete(key);
      throw new PluginRefusal(
        "plugin.unavailable",
        `the role ${quoted(name)} may use ${schemasNamed(reachable)}, which no plugin's role may, and the console's database user may not take it back. The database's owner runs, once: ${reachable.map((schema) => `REVOKE ALL ON SCHEMA ${quoted(schema)} FROM ${quoted(name)};`).join(" ")}`,
      );
    }
    this.passwords.set(key, password);
  }

  /** The pool of the plugin's role, made with the password drawn at this boot. */
  private pool(key: string): Pool {
    let pool = this.pools.get(key);
    if (pool !== undefined) {
      return pool;
    }
    const password = this.passwords.get(key);
    if (password === undefined) {
      throw new PluginRefusal(
        "plugin.unavailable",
        "the plugin's schema is not provisioned in this process",
      );
    }
    const url = new URL(this.options.connectionString);
    url.username = sqlNameOf(key);
    url.password = password;
    pool = new Pool({
      connectionString: url.href,
      ssl: sslOf(this.options.ca),
      max: PLUGIN_SQL_CONNECTIONS,
      application_name: `console-${sqlNameOf(key)}`,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: PLUGIN_SQL_STATEMENT_MS,
    });
    pool.on("error", () => {});
    this.pools.set(key, pool);
    return pool;
  }

  private bounded(result: { rows: unknown[]; rowCount: number | null }): SqlResult {
    if (result.rows.length > MAX_PLUGIN_SQL_ROWS) {
      throw new PluginRefusal(
        "plugin.too_many",
        `a result holds ${MAX_PLUGIN_SQL_ROWS} rows at most`,
      );
    }
    if (Buffer.byteLength(JSON.stringify(result.rows), "utf8") > RESULT_BYTES_AT_MOST) {
      throw new PluginRefusal(
        "plugin.too_many",
        `a result holds ${RESULT_BYTES_AT_MOST} bytes at most`,
      );
    }
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? result.rows.length,
    };
  }

  /** What the database said of a statement, as the plugin may read it; its own schema is its own business. */
  private refusal(error: unknown): PluginRefusal {
    const code = (error as { code?: unknown }).code;
    const message = error instanceof Error ? error.message : String(error);
    if (code === "57014") {
      return new PluginRefusal("plugin.timeout", "the statement ran past its time");
    }
    return new PluginRefusal(
      "plugin.invalid_args",
      `the database refused the statement: ${message}`,
    );
  }

  /** Runs a statement as the plugin's role, in a transaction of the plugin's where `tx` names one. */
  async query(
    key: string,
    text: string,
    params: readonly unknown[],
    tx?: string,
  ): Promise<SqlResult> {
    if (typeof text !== "string" || text.length === 0 || text.length > 100_000) {
      throw new PluginRefusal(
        "plugin.invalid_args",
        "a statement is text, up to 100,000 characters",
      );
    }
    try {
      if (tx !== undefined) {
        const open = this.transactions.get(tx);
        if (open === undefined) {
          throw new PluginRefusal("plugin.not_found", "the transaction is not open");
        }
        return this.bounded(await open.client.query(text, [...params]));
      }
      return this.bounded(await this.pool(key).query(text, [...params]));
    } catch (error) {
      if (error instanceof PluginRefusal) {
        throw error;
      }
      throw this.refusal(error);
    }
  }

  /** Opens a transaction on a connection of the plugin's role; rolled back on its own after a minute. */
  async begin(key: string): Promise<string> {
    const client = await this.pool(key).connect();
    try {
      await client.query("begin");
    } catch (error) {
      client.release();
      throw this.refusal(error);
    }
    this.counter += 1;
    const id = `${key}:${this.counter}`;
    const timer = setTimeout(() => {
      void this.rollback(id).catch(() => undefined);
    }, TRANSACTION_TTL_MS);
    timer.unref();
    this.transactions.set(id, { client, timer });
    return id;
  }

  private async end(id: string, statement: "commit" | "rollback"): Promise<void> {
    const open = this.transactions.get(id);
    if (open === undefined) {
      throw new PluginRefusal("plugin.not_found", "the transaction is not open");
    }
    this.transactions.delete(id);
    clearTimeout(open.timer);
    try {
      await open.client.query(statement);
    } catch (error) {
      open.client.release(error instanceof Error ? error : new Error(String(error)));
      throw this.refusal(error);
    }
    open.client.release();
  }

  commit(id: string): Promise<void> {
    return this.end(id, "commit");
  }

  rollback(id: string): Promise<void> {
    return this.end(id, "rollback");
  }

  /**
   * Applies the plugin's migrations, in the order of their names, as the plugin's role, under the
   * console's migration lock; those applied are recorded in the schema's own `_migrations`.
   * Answers how many were applied now.
   */
  async applyMigrations(key: string, dir: string): Promise<number> {
    const names = (await readdir(dir)).filter((name) => MIGRATION_NAME.test(name)).sort();
    const lock = new Client({
      connectionString: this.options.connectionString,
      ssl: sslOf(this.options.ca),
      application_name: "console-plugin-migrate",
    });
    await lock.connect();
    const pool = this.pool(key);
    let applied = 0;
    try {
      await lock.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
      await pool.query(
        "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
      );
      const done = new Set(
        (await pool.query<{ name: string }>("select name from _migrations")).rows.map(
          (row) => row.name,
        ),
      );
      for (const name of names) {
        if (done.has(name)) {
          continue;
        }
        const text = await readFile(join(dir, name), "utf8");
        const client = await pool.connect();
        try {
          await client.query("begin");
          await client.query(text);
          await client.query("insert into _migrations (name) values ($1)", [name]);
          await client.query("commit");
        } catch (error) {
          await client.query("rollback").catch(() => undefined);
          throw new PluginRefusal(
            "plugin.failed",
            `the migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          client.release();
        }
        applied += 1;
      }
    } finally {
      await lock.end();
    }
    return applied;
  }

  /** Drops the plugin's schema with everything in it, ends the role's connections, and drops the role. */
  async purge(key: string): Promise<void> {
    const name = sqlNameOf(key);
    const pool = this.pools.get(key);
    this.pools.delete(key);
    this.passwords.delete(key);
    await pool?.end().catch(() => undefined);
    const db = drizzleOf(this.options.database);
    await db.execute(sql.raw(`drop schema if exists ${quoted(name)} cascade`));
    await db.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity where usename = ${name} and pid <> pg_backend_pid()`,
    );
    await db.execute(sql.raw(`drop role if exists ${quoted(name)}`));
  }

  /** Ends every pool and rolls back what is open. */
  async stop(): Promise<void> {
    for (const id of [...this.transactions.keys()]) {
      await this.rollback(id).catch(() => undefined);
    }
    for (const [key, pool] of this.pools) {
      this.pools.delete(key);
      await pool.end().catch(() => undefined);
    }
  }
}
