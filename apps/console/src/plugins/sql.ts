// A schema and a login role of a plugin's own (ADR-0051, docs/specs/plugins.md, "SQL"): what the
// capability `storage:sql` opens. Enabling creates `plugin_<key>` and the role of the same name,
// with rights on that schema and nothing else, a search path of its own, a statement timeout and
// a connection limit. The role's password is a keyed hash every process of the deployment arrives
// at by itself, kept nowhere (ADR-0148): the `api`, the `worker` and the `migrate` role each
// provision what they find enabled, and none of them takes the role from another. The plugin's
// migrations are applied as the role, and `ctx.sql` runs on a pool of the role in the parent, its
// results bounded. Purge drops the schema and the role with whatever the role owns.
//
// The role may use no schema of the console's (ADR-0133): a role that may use a schema may name a
// table in it, and naming a table takes a lock on it before any right on the table is asked for.
// What every role holds through PUBLIC is taken from PUBLIC, which only a schema's owner may do;
// where the console's role may not, provisioning is refused with what the owner runs.
import { createHash, createHmac, pbkdf2Sync, randomBytes, randomInt } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  MAX_PLUGIN_SQL_ROWS,
  PLUGIN_LIFECYCLE_MS,
  PLUGIN_SQL_CONNECTIONS,
  PLUGIN_SQL_STATEMENT_MS,
  PluginRefusal,
} from "@skillcdn/console/plugin";
import { sql } from "drizzle-orm";
import { Client, Pool, type PoolClient, type QueryConfig } from "pg";
import { type Database, drizzleOf, sslOf } from "../db/client.js";
import type { Logger } from "../logger.js";

/** The bytes a result may hold as JSON: `MAX_PLUGIN_MESSAGE_BYTES`, measured before it crosses to the host. */
const RESULT_BYTES_AT_MOST = 4 * 1024 * 1024;
/** How long an open transaction waits for its plugin before it is ended. */
const TRANSACTION_TTL_MS = 60_000;
/** How long purge waits for a session of the role to be gone, once it told the server to end it. */
const SESSION_END_MS = 5_000;
/** How often provisioning goes round again where another process changed the same thing at once. */
const PROVISION_ATTEMPTS = 8;
/**
 * How long a session of the role a process is done with stays in that process's pool. The role's
 * sessions are the deployment's, four in all, and each process may open as many: a session kept
 * idle for long is one another process's statement is refused for. Long enough for the
 * statements of one command to share a session, short enough to give it back between two.
 */
const IDLE_SESSION_MS = 2_000;
/**
 * How long a statement waits, step by step, where the server said every session of the role is
 * taken: past the time an idle one is given back in, so that a process that is only done with
 * its sessions holds nobody up, and no longer than a caller waits for a connection anyway.
 */
const SESSION_WAITS_MS = [100, 200, 400, 800, 1_600, 1_600];
/** What a statement is told once it waited that long and every session was still taken. */
const SESSIONS_TAKEN =
  "every connection of the plugin's role is taken, across the processes of the deployment, and stayed so while this statement waited for one: fewer of the plugin's statements at once, or shorter transactions, leave one free";
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
  /**
   * The console's own connection string and authority, from which the role's connections are
   * made, and whose password the role's is derived from (ADR-0148).
   */
  readonly connectionString: string;
  readonly ca: string | undefined;
  readonly logger: Logger;
  /** How long an open transaction waits for its plugin; a minute unless a test says otherwise. */
  readonly transactionMs?: number | undefined;
  /** How long one migration of a plugin's may run; what a step of a plugin's life has unless a test says otherwise. */
  readonly migrationMs?: number | undefined;
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

/** What the derivation is for: nothing else hashes these words with the database's password. */
const ROLE_PASSWORD_LABEL = "skillcdn-console plugin role password v1";

/**
 * The password of a plugin's role (ADR-0148): a keyed hash of the role's name, keyed with the
 * password the console itself signs in to the database with. Every process of a deployment holds
 * that one, the `migrate` role and a `worker` given nothing but the database's address among
 * them, so each arrives at the same password with nothing kept anywhere and nothing passed
 * between them. Whoever holds the key may give the role any password already, so the hash hands
 * nobody a power they lacked, and it says nothing of the key to whoever learned its result.
 * Nothing where the address carries no password: no plugin gets a schema there. Letters, digits,
 * `-` and `_`, which the preparation the protocol asks of a password leaves as they are.
 */
export function rolePassword(connectionString: string, name: string): string | undefined {
  let key: string;
  try {
    const { password } = new URL(connectionString);
    try {
      // As the driver reads it, so that one password written two ways is one key.
      key = decodeURIComponent(password);
    } catch {
      key = password;
    }
  } catch {
    return undefined;
  }
  if (key.length === 0) {
    return undefined;
  }
  // The label and the name are two fields: a zero byte, which neither holds, stands between them.
  return createHmac("sha256", key)
    .update(ROLE_PASSWORD_LABEL)
    .update(Buffer.from([0]))
    .update(name)
    .digest("base64url");
}

/** What a deployment whose database address carries no password is told. */
const NO_PASSWORD =
  "storage:sql needs a password in the database's address: a plugin's role is given one derived from it, which every process of the deployment arrives at";

/**
 * Whether the database refused a statement because another session changed the same thing at
 * the same moment: two processes that start together provision the same plugins, and a role, a
 * schema or a grant changed by two at once is refused for one of them ("tuple concurrently
 * updated", or the name taken meanwhile). Whoever was refused goes round again and finds it made.
 */
function metAnother(error: unknown): boolean {
  for (let at: unknown = error, depth = 0; depth < 4; depth += 1) {
    if (typeof at !== "object" || at === null) {
      return false;
    }
    const code = "code" in at ? at.code : undefined;
    const message = "message" in at && typeof at.message === "string" ? at.message : "";
    if (
      code === "23505" ||
      code === "42710" ||
      code === "42P06" ||
      code === "40001" ||
      code === "40P01" ||
      (code === "XX000" && /tuple concurrently (?:updated|deleted)/.test(message))
    ) {
      return true;
    }
    at = "cause" in at ? at.cause : undefined;
  }
  return false;
}

/** The statement that gives a role its password met another process's: said without the statement. */
class RoleChangedAtOnce extends Error {}

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

/** A transaction a plugin opened and has not ended. */
interface OpenTransaction {
  /** The plugin that opened it, and the only one it answers. */
  readonly key: string;
  readonly client: PoolClient;
  timer: NodeJS.Timeout | undefined;
  /** How many of its statements are with the database now. */
  running: number;
  /** Why the console ended it, where it did: what a statement cut short is told. */
  over: "time" | "stopped" | undefined;
}

export class PluginSqlService {
  private readonly options: PluginSqlOptions;
  /**
   * The plugins whose role this process found fit to sign in as: provisioned here, or made by
   * another process of the deployment and seen to reach nothing of the console's.
   */
  private readonly ready = new Set<string>();
  private readonly pools = new Map<string, Pool>();
  private readonly transactions = new Map<string, OpenTransaction>();
  private counter = 0;
  private saidNoPassword = false;

  constructor(options: PluginSqlOptions) {
    this.options = options;
  }

  /**
   * Whether a plugin may get a schema here: the console's database user may make roles
   * (`CREATEROLE`), and its address carries the password a plugin's role's is derived from.
   */
  async available(): Promise<boolean> {
    if (rolePassword(this.options.connectionString, "plugin_") === undefined) {
      if (!this.saidNoPassword) {
        this.saidNoPassword = true;
        this.options.logger.warn(NO_PASSWORD);
      }
      return false;
    }
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
   * Makes the plugin's schema and role, or brings them to what they must be, the role's password
   * among it: the one every process of the deployment arrives at (ADR-0148), so that a process
   * that provisions takes the role from no other. The role may use and create in its schema and
   * use no other of the console's or the plugins'; its statements time out and its connections
   * are few. Refused, with nothing made, where the console's schemas cannot be closed to PUBLIC.
   * Where another process changed the same role, schema or grant at the same moment, it goes
   * round again: every statement here brings a thing to what it must be, whoever ran it last.
   */
  async provision(key: string): Promise<void> {
    const name = sqlNameOf(key);
    const password = rolePassword(this.options.connectionString, name);
    if (password === undefined) {
      throw new PluginRefusal("plugin.unavailable", NO_PASSWORD);
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.provisionOnce(key, name, password);
        return;
      } catch (error) {
        const again = error instanceof RoleChangedAtOnce || metAnother(error);
        if (again && attempt < PROVISION_ATTEMPTS) {
          await delay(randomInt(10, 60 * attempt));
          continue;
        }
        if (error instanceof RoleChangedAtOnce) {
          throw new PluginRefusal(
            "plugin.unavailable",
            `the role ${quoted(name)} could not be made or changed: other processes kept changing it at the same moment`,
          );
        }
        throw error;
      }
    }
  }

  private async provisionOnce(key: string, name: string, password: string): Promise<void> {
    await this.closeToPublic();
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
      if (metAnother(error)) {
        throw new RoleChangedAtOnce();
      }
      // What the ORM throws quotes the statement whole, the verifier in it.
      throw roleRefusal(name, role === undefined ? "made" : "changed", error, verifier);
    }
    // The console's user holds what the role holds, which whoever made a role may give itself:
    // only so may a user that is no superuser end the role's sessions, at purge and when a
    // transaction ran past its time, and drop what the role owns. Never the other way round: the
    // role is a member of nothing, and the console's user may not become it (`set false`).
    await db.execute(sql.raw(`grant ${quoted(name)} to current_user with inherit true, set false`));
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
    const reachable = await this.reachableBy(name);
    if (reachable.length > 0) {
      // Refused for every process of the deployment, not for this one alone: the role signs in
      // nowhere until it is provisioned again, and what it holds open is ended.
      this.ready.delete(key);
      await this.shut(key, name);
      throw new PluginRefusal(
        "plugin.unavailable",
        `the role ${quoted(name)} may use ${schemasNamed(reachable)}, which no plugin's role may, and the console's database user may not take it back. The database's owner runs, once: ${reachable.map((schema) => `REVOKE ALL ON SCHEMA ${quoted(schema)} FROM ${quoted(name)};`).join(" ")}`,
      );
    }
    this.ready.add(key);
  }

  /**
   * Keeps a role that may not be used from signing in, in this process and in every other, and
   * ends the sessions it has: what a refusal of provisioning leaves behind it. What cannot be
   * done of it is said in the log, and the refusal stands either way.
   */
  private async shut(key: string, name: string): Promise<void> {
    const pool = this.pools.get(key);
    if (pool !== undefined) {
      this.pools.delete(key);
      void pool.end().catch(() => undefined);
    }
    const db = drizzleOf(this.options.database);
    try {
      await db.execute(sql.raw(`alter role ${quoted(name)} nologin`));
      await db.execute(
        sql`select pg_terminate_backend(pid) from pg_stat_activity where usename = ${name} and pid <> pg_backend_pid()`,
      );
    } catch (error) {
      this.options.logger.error(
        { err: error, plugin: key },
        "a plugin's role that may not be used could not be kept from signing in",
      );
    }
  }

  /**
   * Whether this process may sign in as the plugin's role: it provisioned the plugin itself, or
   * another process of the deployment did, a `worker` started before an administrator enabled the
   * plugin in the `api` say, and the role is seen here to be what provisioning leaves: one that
   * signs in, holds no power, has its schema and may use none of the console's. Nothing is made
   * or changed on this way; a role that is not so waits for whoever provisions it.
   */
  private async fit(key: string): Promise<void> {
    if (this.ready.has(key)) {
      return;
    }
    const name = sqlNameOf(key);
    if (rolePassword(this.options.connectionString, name) === undefined) {
      throw new PluginRefusal("plugin.unavailable", NO_PASSWORD);
    }
    const found = await drizzleOf(this.options.database).execute<{ fit: boolean }>(
      sql`select (r.rolcanlogin
                  and not (${sql.raw(ROLE_POWERS.map(([column]) => `r.${column}`).join(" or "))})
                  and exists (select 1 from pg_namespace n where n.nspname = ${name})) as fit
          from pg_roles r where r.rolname = ${name}`,
    );
    if (found.rows[0]?.fit !== true || (await this.reachableBy(name)).length > 0) {
      throw new PluginRefusal("plugin.unavailable", "the plugin's schema is not provisioned");
    }
    this.ready.add(key);
  }

  /** The pool of the plugin's role, signed in with the password every process arrives at. */
  private pool(key: string): Pool {
    let pool = this.pools.get(key);
    if (pool !== undefined) {
      return pool;
    }
    const password = rolePassword(this.options.connectionString, sqlNameOf(key));
    if (password === undefined) {
      throw new PluginRefusal("plugin.unavailable", NO_PASSWORD);
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
      idleTimeoutMillis: IDLE_SESSION_MS,
      statement_timeout: PLUGIN_SQL_STATEMENT_MS,
    });
    pool.on("error", () => {});
    // A session ended at the server, at purge by another process or past a transaction's time,
    // says so to whoever ran a statement on it, and as an event of its connection as well. The
    // pool hears that event only of a connection that is idle: one a statement or a transaction
    // holds has nobody listening, and an event nobody hears ends the process.
    pool.on("connect", (client) => {
      client.on("error", () => {});
    });
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

  /**
   * Gives a connection of the plugin's role back to its pool as a new one would be (`DISCARD
   * ALL`): what a statement set for its session, its timeout among it, is the role's own again,
   * and what it took for its session, an advisory lock, a temporary table, a listen, is let go.
   * The pool hands the connection it was given last to the next call, so without this a lock
   * taken for a session was held for as long as the plugin kept asking, and a timeout set to
   * nothing stayed set. A connection that cannot be reset, inside a transaction a statement of
   * the plugin's opened and left, is ended, and the server lets go of all it held.
   */
  private async giveBack(client: PoolClient): Promise<void> {
    try {
      await client.query("discard all");
      client.release();
    } catch (error) {
      client.release(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Sends one statement of a plugin's, as a statement with its parameters whether it has any
   * or not: the server then takes a text that holds several for none of them, and refuses it
   * before any ran. Sent as plain text, a text with no parameters ran every statement in it,
   * a `begin` that left the pool's connection inside a transaction among them, and answered a
   * list no caller could read.
   */
  private one(
    client: PoolClient,
    text: string,
    params: readonly unknown[],
  ): Promise<{ rows: unknown[]; rowCount: number | null }> {
    // The driver reads `queryMode`; its types do not name it yet.
    const statement: QueryConfig & { readonly queryMode: "extended" } = {
      text,
      values: [...params],
      queryMode: "extended",
    };
    return client.query(statement);
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
    if (tx !== undefined) {
      const open = this.opened(key, tx);
      open.running += 1;
      try {
        return this.bounded(await this.one(open.client, text, params));
      } catch (error) {
        throw this.cutShort(open) ?? (error instanceof PluginRefusal ? error : this.refusal(error));
      } finally {
        open.running -= 1;
      }
    }
    const client = await this.connect(key);
    try {
      return this.bounded(await this.one(client, text, params));
    } catch (error) {
      throw error instanceof PluginRefusal ? error : this.refusal(error);
    } finally {
      await this.giveBack(client);
    }
  }

  /** A connection of the plugin's role, for a process that may sign in as it. */
  private async connect(key: string): Promise<PoolClient> {
    await this.fit(key);
    for (const wait of SESSION_WAITS_MS) {
      try {
        return await this.pool(key).connect();
      } catch (error) {
        // The role's limit of sessions is the deployment's: another process holds them, and one
        // that is only done with them gives them back shortly. Anything else is said below.
        if ((error as { code?: unknown }).code !== "53300") {
          throw this.notConnected(key, error);
        }
        await delay(wait);
      }
    }
    try {
      return await this.pool(key).connect();
    } catch (error) {
      throw this.notConnected(key, error);
    }
  }

  /** Why a connection of the plugin's role could not be had, as the plugin is told. */
  private notConnected(key: string, error: unknown): PluginRefusal {
    if (error instanceof PluginRefusal) {
      return error;
    }
    const code = (error as { code?: unknown }).code;
    // Taken at the server, by any process, or in this process's own pool, whose wait for one
    // ran out: the database's words for the first name the role's limit, and are not said.
    if (
      code === "53300" ||
      (error instanceof Error && error.message === "timeout exceeded when trying to connect")
    ) {
      return new PluginRefusal("plugin.unavailable", SESSIONS_TAKEN);
    }
    if (code === "28P01") {
      // The role answers another password than the one this process arrives at: the role
      // changed it itself, or a process reaches the database with another password.
      return new PluginRefusal(
        "plugin.unavailable",
        "the plugin's role could not sign in to the database: its password is not the one this process arrives at. Every process of a deployment reaches the database with one address, and the role is given its password again when a process starts or the plugin is enabled",
      );
    }
    if (code === "28000") {
      // The role was shut meanwhile: whether it is fit is asked again at the next statement.
      this.ready.delete(key);
      return new PluginRefusal(
        "plugin.unavailable",
        "the plugin's role may not sign in to the database: its schema waits to be provisioned again",
      );
    }
    return this.refusal(error);
  }

  /**
   * The transaction a plugin names, where that plugin opened it and it is still open. The name
   * comes from the plugin's own thread, which may send any: another plugin's transaction is not
   * found, as one that never was.
   */
  private opened(key: string, id: string): OpenTransaction {
    const open = this.transactions.get(id);
    if (open === undefined || open.key !== key) {
      throw new PluginRefusal("plugin.not_found", "the transaction is not open");
    }
    return open;
  }

  /** What a statement is told that failed because the console ended its transaction, or nothing. */
  private cutShort(open: OpenTransaction): PluginRefusal | undefined {
    if (open.over === "time") {
      return new PluginRefusal("plugin.timeout", "the transaction ran past its time");
    }
    if (open.over === "stopped") {
      return new PluginRefusal(
        "plugin.unavailable",
        "the transaction was ended by the console, which stops or purges the plugin's schema",
      );
    }
    return undefined;
  }

  /**
   * Opens a transaction on a connection of the plugin's role. One its plugin does not end is
   * ended after a minute, with the statement it runs.
   */
  async begin(key: string): Promise<string> {
    const client = await this.connect(key);
    try {
      await client.query("begin");
    } catch (error) {
      client.release();
      throw this.refusal(error);
    }
    this.counter += 1;
    const id = `${key}:${this.counter}`;
    const open: OpenTransaction = { key, client, timer: undefined, running: 0, over: undefined };
    open.timer = setTimeout(() => {
      void this.expire(id, "time").catch(() => undefined);
    }, this.options.transactionMs ?? TRANSACTION_TTL_MS);
    open.timer.unref();
    this.transactions.set(id, open);
    return id;
  }

  private async end(key: string, id: string, statement: "commit" | "rollback"): Promise<void> {
    const open = this.opened(key, id);
    this.transactions.delete(id);
    clearTimeout(open.timer);
    try {
      await open.client.query(statement);
    } catch (error) {
      open.client.release(error instanceof Error ? error : new Error(String(error)));
      throw this.cutShort(open) ?? this.refusal(error);
    }
    await this.giveBack(open.client);
  }

  commit(key: string, id: string): Promise<void> {
    return this.end(key, id, "commit");
  }

  rollback(key: string, id: string): Promise<void> {
    return this.end(key, id, "rollback");
  }

  /**
   * Ends a transaction its plugin did not end: past its minute, or because the process stops or
   * the plugin is purged. Where it runs nothing it is rolled back and its connection kept. Where
   * a statement of it is with the database, the rollback would wait behind that statement, which
   * may have set itself any timeout: the session is ended at the server instead, which rolls
   * back and lets go of every lock at once, and the statement is told why. The console's user
   * may end the role's sessions since provisioning gave it what the role holds.
   */
  private async expire(id: string, why: "time" | "stopped"): Promise<void> {
    const open = this.transactions.get(id);
    if (open === undefined) {
      return;
    }
    // No statement is taken for it from here on.
    this.transactions.delete(id);
    clearTimeout(open.timer);
    open.over = why;
    if (open.running === 0) {
      try {
        await open.client.query("rollback");
      } catch (error) {
        open.client.release(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      await this.giveBack(open.client);
      return;
    }
    try {
      await this.endSession(open.key, open.client, "a transaction");
    } finally {
      // Its connection is not one to hand to the next statement.
      open.client.release(new Error("the transaction was ended by the console"));
    }
  }

  /**
   * Ends the session a connection of the plugin's role holds, at the server: whatever it runs
   * stops, what it changed is rolled back and every lock it held is let go, at once and whatever
   * timeout its statements set themselves. The console's user may, since provisioning gave it
   * what the role holds. What could not be done is said in the log, and the statement then runs
   * until it ends by itself.
   */
  private async endSession(key: string, client: PoolClient, what: string): Promise<void> {
    // The driver knows the number of the session's process at the server; its types do not say so.
    const pid = (client as unknown as { readonly processID?: unknown }).processID;
    if (typeof pid !== "number") {
      return;
    }
    try {
      // By its number and its role both: a number is given to another session once one ended.
      await drizzleOf(this.options.database).execute(
        sql`select pg_terminate_backend(pid) from pg_stat_activity where pid = ${pid} and usename = ${sqlNameOf(key)}`,
      );
    } catch (error) {
      this.options.logger.error(
        { err: error, plugin: key },
        `${what} of a plugin's could not be ended at the database; its statement runs until it ends by itself`,
      );
    }
  }

  /**
   * Applies the plugin's migrations, in the order of their names, as the plugin's role, under the
   * console's migration lock; those applied are recorded in the schema's own `_migrations`.
   * Answers how many were applied now.
   */
  async applyMigrations(key: string, dir: string): Promise<number> {
    const names = (await readdir(dir)).filter((name) => MIGRATION_NAME.test(name)).sort();
    await this.fit(key);
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
        // A migration is the plugin's own text and may set itself any timeout, and it runs under
        // the lock every migration of the console's waits for: one that runs past the time a
        // step of a plugin's life has is ended at the server, and the lock goes on to the next.
        let late = false;
        const timer = setTimeout(() => {
          late = true;
          void this.endSession(key, client, "a migration");
        }, this.options.migrationMs ?? PLUGIN_LIFECYCLE_MS);
        timer.unref();
        try {
          await client.query("begin");
          await client.query(text);
          await client.query("insert into _migrations (name) values ($1)", [name]);
          await client.query("commit");
        } catch (error) {
          await client.query("rollback").catch(() => undefined);
          throw late
            ? new PluginRefusal("plugin.timeout", `the migration ${name} ran past its time`)
            : new PluginRefusal(
                "plugin.failed",
                `the migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
              );
        } finally {
          clearTimeout(timer);
          // A migration is the plugin's own text: what it set or took for its session goes too.
          await this.giveBack(client);
        }
        applied += 1;
      }
    } finally {
      await lock.end();
    }
    return applied;
  }

  /**
   * Drops the plugin's schema with everything in it, and the role with everything it owns. The
   * role is first kept from signing in, so that no process of the deployment comes back as it,
   * and its sessions are ended, another process's among them. What the role owns outside its
   * schema goes before the role does: a large object, which any role may make, and the privileges
   * it set for what it makes later each keep a role from being dropped, and no right keeps a role
   * from either. The console's user may do all of it since it holds what the role holds, which a
   * role made before that was given to it is given here. Purged twice is purged.
   */
  async purge(key: string): Promise<void> {
    const name = sqlNameOf(key);
    for (const [id, open] of [...this.transactions]) {
      if (open.key === key) {
        await this.expire(id, "stopped").catch(() => undefined);
      }
    }
    const pool = this.pools.get(key);
    this.pools.delete(key);
    this.ready.delete(key);
    await pool?.end().catch(() => undefined);
    const db = drizzleOf(this.options.database);
    const role = await db.execute(sql`select 1 from pg_roles where rolname = ${name}`);
    if (role.rows.length > 0) {
      await db.execute(sql.raw(`alter role ${quoted(name)} nologin`));
      await db.execute(
        sql.raw(`grant ${quoted(name)} to current_user with inherit true, set false`),
      );
      // Waited for: what a session holds open is in the way of dropping it.
      await db.execute(
        sql`select pg_terminate_backend(pid, ${SESSION_END_MS}::bigint) from pg_stat_activity where usename = ${name} and pid <> pg_backend_pid()`,
      );
      await db.execute(sql.raw(`drop owned by ${quoted(name)}`));
    }
    await db.execute(sql.raw(`drop schema if exists ${quoted(name)} cascade`));
    await db.execute(sql.raw(`drop role if exists ${quoted(name)}`));
  }

  /** Ends what is open, a statement that still runs with it, and every pool. */
  async stop(): Promise<void> {
    for (const id of [...this.transactions.keys()]) {
      await this.expire(id, "stopped").catch(() => undefined);
    }
    for (const [key, pool] of this.pools) {
      this.pools.delete(key);
      await pool.end().catch(() => undefined);
    }
  }
}
