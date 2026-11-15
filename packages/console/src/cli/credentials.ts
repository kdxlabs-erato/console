import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import * as z from "zod/mini";

// Where the command keeps what `login` was given (ADR-0027): for every console a person signed
// it in to, the console's address, the account there and the token, in the person's own
// configuration directory, readable by them alone where the system can say so. A token is a
// secret the person made; this file is the one place it rests, and a token goes only to the
// console that issued it: the command resolves which console a command talks to first, and then
// looks for a login there, never the other way round.

/** One sign-in: a console, an account there, and the token the console handed over. */
export interface Login {
  /** The origin of the console, without a path. */
  readonly url: string;
  /** The person's login at the console, as the console named them; unknown for a login kept before accounts were. */
  readonly account: string | undefined;
  readonly token: string;
  /** What the token is called at the console, when known. */
  readonly agent: string | undefined;
  /** When the command was signed in, when known. */
  readonly since: string | undefined;
  /**
   * Whether what is kept is a session of the command's own, signed in as the account itself
   * (ADR-0084), where it is otherwise a token a person made for an agent.
   */
  readonly self?: boolean | undefined;
  /**
   * The workspace's time zone as the console last said it, at login or whoami (ADR-0035): what
   * the command prints moments in, without asking again; none when the workspace names none.
   */
  readonly timeZone?: string | undefined;
}

/**
 * A connection begun and not yet approved (ADR-0129): what a later `login` needs to go on
 * waiting for it, kept for the few minutes its code lasts where the call that began it ended
 * before a person approved. Its secret is good for nothing until a person signed in at the
 * console approves the code, and is kept as a token is: here, and never printed.
 */
export interface PendingConnection {
  /** The origin of the console the connection was begun at. */
  readonly url: string;
  /** What the command claims the token with, once a person approved. */
  readonly secret: string;
  /** The code the person checks on the page, to say again. */
  readonly code: string;
  /** The page the person opens to approve. */
  readonly page: string;
  /** When the code runs out, as the console said it. */
  readonly expiresAt: string;
  /** How many seconds the console asked for between two claims. */
  readonly interval: number;
  /** Whether the command asked to be the account itself (ADR-0084). */
  readonly self?: boolean | undefined;
  /** Whether the login is to be the default console here. */
  readonly default?: boolean | undefined;
}

/** Everything the command keeps: the logins, and the console a directory that names none works at. */
export interface Credentials {
  readonly default: string | undefined;
  readonly logins: readonly Login[];
  /** The connections begun and waiting for a person, one a console at most (ADR-0129); left out when none is. */
  readonly pending?: readonly PendingConnection[] | undefined;
}

export const EMPTY_CREDENTIALS: Credentials = { default: undefined, logins: [] };

/** How many consoles one machine may be signed in to: far more than anyone has. */
export const MAX_LOGINS = 100;
/** How large the file may be before it is not read: far above a hundred logins. */
const MAX_FILE_BYTES = 64 * 1024;

export interface CredentialStore {
  /**
   * What is kept, or nothing. A file that is there and cannot be read is a `CredentialsError`,
   * so that the command stops and never writes over what it did not understand.
   */
  load(): Promise<Credentials | undefined>;
  /** Keeps the credentials, whole, and answers where. */
  save(credentials: Credentials): Promise<string>;
  /** Forgets everything kept. */
  clear(): Promise<void>;
}

export class CredentialsError extends Error {
  readonly code: "credentials.malformed" | "credentials.too_large" | "credentials.unfit";
  readonly path: string;

  constructor(code: CredentialsError["code"], path: string) {
    super(
      code === "credentials.too_large"
        ? `The credentials file ${path} is larger than the command reads.`
        : code === "credentials.unfit"
          ? "What was to be kept is not what the command reads back, so nothing was written."
          : `The credentials file ${path} could not be read as one.`,
    );
    this.name = "CredentialsError";
    this.code = code;
    this.path = path;
  }
}

const loginSchema = z.object({
  url: z.string().check(z.minLength(1), z.maxLength(2048)),
  account: z.optional(z.string().check(z.minLength(1), z.maxLength(254))),
  token: z.string().check(z.minLength(1), z.maxLength(1024)),
  agent: z.optional(z.string().check(z.maxLength(200))),
  since: z.optional(z.string().check(z.maxLength(40))),
  self: z.optional(z.boolean()),
  timeZone: z.optional(z.string().check(z.minLength(1), z.maxLength(64))),
});
const pendingSchema = z.object({
  url: z.string().check(z.minLength(1), z.maxLength(2048)),
  secret: z.string().check(z.minLength(1), z.maxLength(1024)),
  code: z.string().check(z.minLength(1), z.maxLength(64)),
  page: z.string().check(z.minLength(1), z.maxLength(2048)),
  expiresAt: z.string().check(z.minLength(1), z.maxLength(40)),
  interval: z.number().check(z.gte(1), z.lte(600)),
  self: z.optional(z.boolean()),
  default: z.optional(z.boolean()),
});
const fileSchema = z.object({
  version: z.literal(2),
  default: z.optional(z.string().check(z.minLength(1), z.maxLength(2048))),
  logins: z.array(loginSchema).check(z.maxLength(MAX_LOGINS)),
  // Left out by a command from before ADR-0129, which reads the file without it and writes it
  // back without it: a connection that waited is begun again.
  pending: z.optional(z.array(pendingSchema).check(z.maxLength(MAX_LOGINS))),
});
/** The file as the command kept it before 2026-10: one console, one token. */
const firstFileSchema = z.object({
  url: z.string().check(z.minLength(1)),
  token: z.string().check(z.minLength(1)),
});

/** The file as it is written: what `save` writes, and `load` reads back with `fileSchema`. */
function fileOf(credentials: Credentials) {
  return {
    version: 2,
    default: credentials.default,
    logins: credentials.logins.map((login) => ({
      url: login.url,
      account: login.account,
      token: login.token,
      agent: login.agent,
      since: login.since,
      // What a login is read back with: whether the command is the account itself, and the
      // zone the workspace keeps its times in.
      ...(login.self === true ? { self: true } : {}),
      ...(login.timeZone === undefined ? {} : { timeZone: login.timeZone }),
    })),
    // The connections that wait for a person (ADR-0129), each with its secret, in this file
    // and under its mode as a token is.
    ...(credentials.pending === undefined || credentials.pending.length === 0
      ? {}
      : {
          pending: credentials.pending.map((waiting) => ({
            url: waiting.url,
            secret: waiting.secret,
            code: waiting.code,
            page: waiting.page,
            expiresAt: waiting.expiresAt,
            interval: waiting.interval,
            ...(waiting.self === true ? { self: true } : {}),
            ...(waiting.default === true ? { default: true } : {}),
          })),
        }),
  };
}

/**
 * Whether what is to be kept reads back as the file's own shape. What a console answers comes
 * to rest here, a code, a token, a name, and anything at an address may answer to nobody: a
 * file written beyond its own bounds is one the command stops on from then on, at every
 * console. So it is asked before anything is written, and what does not fit is not kept.
 */
export function fitsFile(credentials: Credentials): boolean {
  return fileSchema.safeParse(fileOf(credentials)).success;
}

/** What a file says, in the current shape; one in the first shape reads as one login, the default. Nothing for anything else. */
export function parseCredentials(json: unknown): Credentials | undefined {
  const current = fileSchema.safeParse(json);
  if (current.success) {
    return {
      default: current.data.default,
      logins: current.data.logins.map((login) => ({
        url: login.url,
        account: login.account,
        token: login.token,
        agent: login.agent,
        since: login.since,
        ...(login.self === true ? { self: true } : {}),
        ...(login.timeZone === undefined ? {} : { timeZone: login.timeZone }),
      })),
      ...(current.data.pending === undefined || current.data.pending.length === 0
        ? {}
        : {
            pending: current.data.pending.map((waiting) => ({
              url: waiting.url,
              secret: waiting.secret,
              code: waiting.code,
              page: waiting.page,
              expiresAt: waiting.expiresAt,
              interval: waiting.interval,
              ...(waiting.self === true ? { self: true } : {}),
              ...(waiting.default === true ? { default: true } : {}),
            })),
          }),
    };
  }
  const first = firstFileSchema.safeParse(json);
  if (first.success) {
    return {
      default: first.data.url,
      logins: [
        {
          url: first.data.url,
          account: undefined,
          token: first.data.token,
          agent: undefined,
          since: undefined,
        },
      ],
    };
  }
  return undefined;
}

/** The logins at one console. */
export function loginsAt(credentials: Credentials, url: string): readonly Login[] {
  return credentials.logins.filter((login) => login.url === url);
}

/** The consoles signed in to, each once, in the order they were signed in to. */
export function consolesOf(credentials: Credentials): readonly string[] {
  return [...new Set(credentials.logins.map((login) => login.url))];
}

/**
 * With a login kept: in place of the one at the same console for the same account, else added.
 * The first login kept is the default console, and one kept as the default is.
 */
export function withLogin(
  credentials: Credentials,
  login: Login,
  options: { readonly default?: boolean | undefined } = {},
): Credentials {
  const rest = credentials.logins.filter(
    (kept) => !(kept.url === login.url && kept.account === login.account),
  );
  const first = credentials.logins.length === 0 ? login.url : undefined;
  return {
    default: options.default === true ? login.url : (credentials.default ?? first),
    logins: [...rest, login],
    ...carried(credentials.pending),
  };
}

/** The connections that wait, as a field of what is kept: left out when none does. */
function carried(pending: readonly PendingConnection[] | undefined): {
  readonly pending?: readonly PendingConnection[];
} {
  return pending === undefined || pending.length === 0 ? {} : { pending };
}

/** Whether a connection's code still lasts at a moment; one whose end does not read as a moment does not. */
export function lasts(pending: PendingConnection, now: number): boolean {
  const end = Date.parse(pending.expiresAt);
  return Number.isFinite(end) && end > now;
}

/** The connection that waits at a console, whether or not its code still lasts. */
export function pendingAt(
  credentials: Credentials | undefined,
  url: string,
): PendingConnection | undefined {
  return credentials?.pending?.find((waiting) => waiting.url === url);
}

/**
 * With a connection that waits: in place of the one at the same console, and without any whose
 * code ran out, so that a secret rests here no longer than its code lasts once anything is kept
 * again (ADR-0129).
 */
export function withPending(
  credentials: Credentials,
  pending: PendingConnection,
  now: number,
): Credentials {
  const rest = (credentials.pending ?? []).filter(
    (waiting) => waiting.url !== pending.url && lasts(waiting, now),
  );
  return {
    default: credentials.default,
    logins: credentials.logins,
    pending: [...rest, pending],
  };
}

/** Without the connection that waits at a console, and without any whose code ran out. */
export function withoutPending(credentials: Credentials, url: string, now: number): Credentials {
  const rest = (credentials.pending ?? []).filter(
    (waiting) => waiting.url !== url && lasts(waiting, now),
  );
  return { default: credentials.default, logins: credentials.logins, ...carried(rest) };
}

/** Whether nothing is kept: no login, and no connection that waits. */
export function keepsNothing(credentials: Credentials): boolean {
  return credentials.logins.length === 0 && (credentials.pending ?? []).length === 0;
}

/**
 * Without the login at a console, for one account or for every account there. The default
 * stays while a login at it remains; else it moves to the one console left, or to none.
 */
export function withoutLogin(credentials: Credentials, url: string, account?: string): Credentials {
  const logins = credentials.logins.filter(
    (kept) => !(kept.url === url && (account === undefined || kept.account === account)),
  );
  const consoles = [...new Set(logins.map((kept) => kept.url))];
  const [only] = consoles;
  const fallback = consoles.length === 1 ? only : undefined;
  return {
    default:
      credentials.default !== undefined && consoles.includes(credentials.default)
        ? credentials.default
        : fallback,
    logins,
    ...carried(credentials.pending),
  };
}

/** Where a command is told which console to talk to, in the order the first one found wins. */
export type AddressSource = "flag" | "environment" | "directory" | "default";

export interface Lookup {
  /** `--url`, as an origin. */
  readonly flagUrl?: string | undefined;
  /** `--account`. */
  readonly flagAccount?: string | undefined;
  /** `CONSOLE_URL`, as an origin, and `CONSOLE_TOKEN`: a pair, for a hook or a job. */
  readonly envUrl?: string | undefined;
  readonly envToken?: string | undefined;
  /** What `.skillcdn-console.json` says of the console and the account, when it does. */
  readonly directoryUrl?: string | undefined;
  readonly directoryAccount?: string | undefined;
  readonly credentials: Credentials | undefined;
}

export type Resolution =
  | {
      readonly ok: true;
      readonly url: string;
      readonly token: string;
      readonly account: string | undefined;
      readonly source: AddressSource;
      /** Where the token came from: the environment's pair, or a login kept here. */
      readonly via: "environment" | "login";
    }
  /** Nothing names a console and nothing is kept. */
  | { readonly ok: false; readonly reason: "nothing" }
  /** One half of the environment's pair is set. */
  | {
      readonly ok: false;
      readonly reason: "environment_half";
      readonly have: "CONSOLE_URL" | "CONSOLE_TOKEN";
    }
  /** A console is named, and nothing here is signed in to it, as that account where one is named. */
  | {
      readonly ok: false;
      readonly reason: "no_login";
      readonly url: string;
      readonly account: string | undefined;
      readonly source: AddressSource;
    }
  /** Several accounts are signed in at the console, and nothing says which. */
  | {
      readonly ok: false;
      readonly reason: "ambiguous";
      readonly url: string;
      readonly accounts: readonly string[];
    };

/**
 * Which console a command talks to, and with what (ADR-0027). The address comes first: the
 * flag, else the environment, else the directory, else the default login. The token is then
 * the one for that address and no other: the environment's token where its address is that
 * one, else the login kept for it, for the account named or the one account there.
 */
export function resolveLogin(lookup: Lookup): Resolution {
  const { envUrl, envToken } = lookup;
  if ((envUrl === undefined) !== (envToken === undefined)) {
    return {
      ok: false,
      reason: "environment_half",
      have: envUrl === undefined ? "CONSOLE_TOKEN" : "CONSOLE_URL",
    };
  }
  const credentials = lookup.credentials ?? EMPTY_CREDENTIALS;
  const consoles = consolesOf(credentials);
  const [source, url]: [AddressSource, string | undefined] =
    lookup.flagUrl !== undefined
      ? ["flag", lookup.flagUrl]
      : envUrl !== undefined
        ? ["environment", envUrl]
        : lookup.directoryUrl !== undefined
          ? ["directory", lookup.directoryUrl]
          : ["default", credentials.default ?? (consoles.length === 1 ? consoles[0] : undefined)];
  if (url === undefined) {
    return { ok: false, reason: "nothing" };
  }
  const account = lookup.flagAccount ?? lookup.directoryAccount;
  if (envUrl !== undefined && envToken !== undefined && envUrl === url) {
    return { ok: true, url, token: envToken, account, source, via: "environment" };
  }
  const at = loginsAt(credentials, url);
  const chosen = account === undefined ? at : at.filter((login) => login.account === account);
  const [login] = chosen;
  if (login === undefined) {
    return { ok: false, reason: "no_login", url, account, source };
  }
  if (chosen.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      url,
      accounts: chosen.map((kept) => kept.account ?? "?"),
    };
  }
  return { ok: true, url, token: login.token, account: login.account, source, via: "login" };
}

const FILE_NAME = "credentials.json";

/** The directory the file lives in: under `XDG_CONFIG_HOME`, or `~/.config`. */
export function defaultConfigDir(env: Readonly<Record<string, string | undefined>>): string {
  const base = env.XDG_CONFIG_HOME;
  return join(
    base === undefined || base.length === 0 ? join(homedir(), ".config") : base,
    "skillcdn-console",
  );
}

export function createFileStore(directory: string): CredentialStore {
  const path = join(directory, FILE_NAME);
  return {
    async load() {
      let size: number;
      try {
        size = (await stat(path)).size;
      } catch {
        return undefined;
      }
      if (size > MAX_FILE_BYTES) {
        throw new CredentialsError("credentials.too_large", path);
      }
      let json: unknown;
      try {
        json = JSON.parse(await readFile(path, "utf8"));
      } catch {
        throw new CredentialsError("credentials.malformed", path);
      }
      const parsed = parseCredentials(json);
      if (parsed === undefined) {
        throw new CredentialsError("credentials.malformed", path);
      }
      return parsed;
    },
    async save(credentials) {
      // Never written in a shape `load` refuses: the file would stop every command after this.
      if (!fitsFile(credentials)) {
        throw new CredentialsError("credentials.unfit", path);
      }
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = fileOf(credentials);
      // Written beside the file and moved over it in one step, so that a command that stops
      // half-way leaves the file as it was, whole.
      const draft = `${path}.${process.pid}.tmp`;
      await writeFile(draft, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
      await rename(draft, path);
      // The mode above applies to a file made now; one that was there keeps its own, so it is set again.
      await chmod(path, 0o600).catch(() => undefined);
      return path;
    },
    async clear() {
      await rm(path, { force: true });
    },
  };
}
