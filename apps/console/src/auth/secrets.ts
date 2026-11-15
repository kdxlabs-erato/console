import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// What the deployment keeps secret for people: values it seals so that only it reads them back,
// and tokens it hands out and remembers only as hashes.

/** What a sealed value is for. Each purpose has a key of its own, so one cannot stand in for another. */
export type SealPurpose =
  /** What a sign-in is remembered by while the browser is away at the git host. */
  | "login"
  /** The pack token a project holds (ADR-0028), kept sealed in its row. */
  | "pack-token"
  /** The secret the deployment handed the console to claim a pack token with (ADR-0036), while the person has not approved. */
  | "pack-connect"
  /** A secret setting of a plugin (docs/specs/plugins.md, "Settings"), never handed to plugin code. */
  | "plugin-secret"
  /** A value of an agent account's secret store (ADR-0087), read back by the account alone. */
  | "agent-secret";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const TOKEN_BYTES = 32;

/**
 * Encrypts and authenticates with keys derived from the deployment's secret. A sealed value is
 * opaque and tamper-evident: `open` answers `undefined` for anything `seal` did not write for
 * the same purpose under the same secret, and never says why. Where the deployment names the
 * secret it had before (ADR-0127), `open` reads what that one sealed too, and `seal` still
 * writes under the current one alone.
 */
export interface Secrets {
  seal(purpose: SealPurpose, plaintext: string): string;
  open(purpose: SealPurpose, sealed: string): string | undefined;
}

/** One secret's keys, a key to a purpose, derived once. */
function keysOf(secret: string): (purpose: SealPurpose) => Buffer {
  const keys = new Map<SealPurpose, Buffer>();
  return (purpose) => {
    let key = keys.get(purpose);
    if (key === undefined) {
      key = Buffer.from(hkdfSync("sha256", secret, "console", purpose, KEY_BYTES));
      keys.set(purpose, key);
    }
    return key;
  };
}

function sealWith(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")}`;
}

function openWith(key: Buffer, sealed: string): string | undefined {
  const [version, encoded, ...rest] = sealed.split(".");
  if (version !== VERSION || encoded === undefined || rest.length > 0) {
    return undefined;
  }
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.byteLength < IV_BYTES + TAG_BYTES) {
    return undefined;
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES));
    decipher.setAuthTag(bytes.subarray(bytes.byteLength - TAG_BYTES));
    return Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES, bytes.byteLength - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

/**
 * The one sealer and opener of the deployment: every value the console seals goes through what
 * this answers, so that a secret read beside the current one is read everywhere at once.
 * `previous` is the secret the deployment had before, while a rotation lasts (ADR-0127).
 */
export function createSecrets(secret: string, previous?: string): Secrets {
  const current = keysOf(secret);
  const before = previous === undefined ? undefined : keysOf(previous);
  return {
    seal: (purpose, plaintext) => sealWith(current(purpose), plaintext),
    open: (purpose, sealed) =>
      openWith(current(purpose), sealed) ??
      (before === undefined ? undefined : openWith(before(purpose), sealed)),
  };
}

/**
 * What a rotation finds of one sealed value (ADR-0127): the current secret opens it and it stays;
 * the previous one alone does, and here it is sealed again under the current; or neither does.
 * The value itself never leaves this function.
 */
export type Resealed =
  | { readonly by: "current" }
  | { readonly by: "previous"; readonly sealed: string }
  | { readonly by: "neither" };

/** Reads a sealed value under the two secrets of a rotation, the current one first. */
export interface Rotation {
  reseal(purpose: SealPurpose, sealed: string): Resealed;
}

export function createRotation(secret: string, previous: string): Rotation {
  const current = keysOf(secret);
  const before = keysOf(previous);
  return {
    reseal(purpose, sealed) {
      if (openWith(current(purpose), sealed) !== undefined) {
        return { by: "current" };
      }
      const plaintext = openWith(before(purpose), sealed);
      return plaintext === undefined
        ? { by: "neither" }
        : { by: "previous", sealed: sealWith(current(purpose), plaintext) };
    },
  };
}

/**
 * Seals a small JSON value that is only good until `expiresAt`: what travels through a browser
 * between two requests to this deployment.
 */
export function sealJson(
  secrets: Secrets,
  purpose: SealPurpose,
  value: unknown,
  expiresAt: Date,
): string {
  return secrets.seal(purpose, JSON.stringify({ value, expiresAt: expiresAt.getTime() }));
}

/** What `sealJson` sealed, while it has not expired; the caller validates its shape. */
export function openJson(
  secrets: Secrets,
  purpose: SealPurpose,
  sealed: string,
  now: Date,
): unknown {
  const text = secrets.open(purpose, sealed);
  if (text === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("expiresAt" in parsed) ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now.getTime() ||
      !("value" in parsed)
    ) {
      return undefined;
    }
    return parsed.value;
  } catch {
    return undefined;
  }
}

/**
 * A new secret to hand out once: random, unguessable, and prefixed so that a scanner that
 * finds one in a log or a repository knows what it found.
 */
export function newToken(prefix: string): string {
  return `${prefix}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

/** How a handed-out secret is remembered. It is random and long, so a plain hash is enough. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Equal without leaking how far the comparison got; the hashes make the lengths equal. */
export function sameSecret(presented: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/** The S256 challenge of a PKCE verifier (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
