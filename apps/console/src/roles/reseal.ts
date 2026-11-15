import { createRotation } from "../auth/secrets.js";
import { type Config, ConfigError } from "../config/config.js";
import { createDatabase } from "../db/client.js";
import { resealAll } from "../db/queries/reseal.js";
import type { Logger } from "../logger.js";
import { APP_NAME } from "../version.js";

/**
 * `migrate reseal`, the step of the `migrate` role that ends a rotation of the deployment's
 * secret (ADR-0127): seals again, under the current secret, every value the console keeps that
 * only the secret before opens, says how many of each kind, and exits. Run by hand once every
 * replica runs with the new secret, never with a rollout's own `migrate`: a replica still on the
 * old configuration opens nothing the step has sealed again.
 *
 * Its one line is what a deployment reads: `left` is how many values the secret before still
 * opens alone, and at `0` that secret can be taken out of the configuration. A value neither
 * secret opens is counted (`unopened`) and left as it is. Never a value, never a secret.
 */
export async function runReseal(
  config: Config,
  logger: Logger,
): Promise<{ readonly left: number }> {
  const secret = config.auth?.secret;
  const previous = config.auth?.previousSecret;
  if (secret === undefined || previous === undefined) {
    // Said as a setting at fault, and never as a step done: an answer of "nothing left" from a
    // container that was handed no secret would have the secret before taken out too early.
    throw new ConfigError([
      "AUTH_SECRET_PREVIOUS: migrate reseal reads the secret before beside the current one, and this role was given none: run it with the settings the api runs with, while the rotation lasts",
    ]);
  }
  const database = createDatabase({
    connectionString: config.database.url,
    ca: config.database.ca,
    maxConnections: 2,
    applicationName: `${APP_NAME}-migrate`,
  });
  try {
    const counts = await resealAll(database, createRotation(secret, previous));
    const sum = (of: (count: (typeof counts)[number]) => number): number =>
      counts.reduce((total, count) => total + of(count), 0);
    const said = {
      resealed: sum((count) => count.resealed),
      unopened: sum((count) => count.unopened),
      left: sum((count) => count.left),
      kinds: Object.fromEntries(counts.map(({ kind, ...count }) => [kind, count] as const)),
    };
    if (said.left > 0) {
      logger.error(said, "sealed again");
    } else if (said.unopened > 0) {
      logger.warn(said, "sealed again");
    } else {
      logger.info(said, "sealed again");
    }
    return { left: said.left };
  } finally {
    await database.close();
  }
}
