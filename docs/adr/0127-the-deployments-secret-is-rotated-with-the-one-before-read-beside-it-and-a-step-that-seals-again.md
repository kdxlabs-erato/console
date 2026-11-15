# ADR-0127: The deployment's secret is rotated with the one before read beside it, and a step that seals again

- Status: Accepted
- Date: 2026-11-15
- Builds on [ADR-0028](0028-the-console-reads-a-projects-pack-through-the-deployments-rest-api-with-a-pack-token-for-a-private-one.md) and [ADR-0036](0036-a-private-pack-is-connected-with-a-code-a-person-approves-from-the-projects-settings.md) (the pack tokens and the connections sealed), [ADR-0070](0070-a-secret-is-sealed-by-the-console-from-an-answer-and-goes-where-its-setting-says.md) and [ADR-0111](0111-a-secret-setting-may-keep-one-value-per-key.md) (a plugin's secret settings), and [ADR-0087](0087-an-agent-account-keeps-its-secrets-in-a-store-of-its-own-that-only-it-reads.md) (an agent account's store). Concerns [ADR-0002](0002-one-image-one-database-and-the-main-repositorys-toolchain.md) (the roles of the one image).

## Context

Everything the console seals is keyed from one setting, `AUTH_SECRET`: a key per purpose, derived in `apps/console/src/auth/secrets.ts` and nowhere else. A console started with another secret opened nothing that was sealed before, and no earlier secret was read beside the current one. So a secret that leaked could not be replaced without losing every sealed value: each pack token, each plugin's secret, and, since agent accounts, every value of every account's store, entered again by whoever held it.

What is keyed from the secret, all of it:

| Purpose | Where the sealed value is kept | A rotation without this decision |
|---|---|---|
| `login` | In the browser, between the two requests of a sign-in, for minutes | A sign-in in flight begins again |
| `pack-token` | `workspaces.pack_token`, `projects.pack_token` | The token is entered or connected again |
| `pack-connect` | `workspace_pack_connects.secret`, `pack_connects.secret`, for the minutes a connection waits | The connection begins again |
| `plugin-secret` | `plugin_secrets.sealed`, `plugin_keyed_secrets.sealed` | Every secret is set again, and what was sealed from an answer is lost |
| `agent-secret` | `agent_secrets.sealed` | Every account's values are set again by their holders |

Nothing else depends on it. A browser's session, a command's session, an agent's token, a connection's secret and an invitation's code are kept as the SHA-256 of what was handed out, with no key; a plugin's signature is keyed from the plugin's own secret; the bucket is signed with its own keys. A rotation signs nobody out.

## Decision

1. **`AUTH_SECRET_PREVIOUS` names the secret the deployment had before.** It is read in the config module with the bounds of `AUTH_SECRET`, as `AUTH_SECRET_PREVIOUS_FILE` too, and refused at start where it stands without `AUTH_SECRET` or equals it. It is no setting of signing in.
2. **Opening tries the current secret, then the one before; sealing uses the current one alone.** `createSecrets(secret, previous)` is the one sealer and opener, and every role that makes one hands it both: a test reads the sources for a second place that derives a key, and for a sealer made without the secret before.
3. **`migrate reseal` seals again what only the secret before opens.** A word of the `migrate` role, which then runs that step and no migration. It reads every row that keeps a sealed value, kind by kind and a page at a time, and writes a value again, under the current secret, where the one before alone opens it. A write names the sealed text it read, so that a value set meanwhile is never written over; the kind is then read again, three times at most. One statement a value: the step can be cut short anywhere and run again, and run again it finds nothing to do.
4. **Its answer says when the secret before can go.** One line, `sealed again`, with how many values it sealed again (`resealed`), how many the secret before opened in this run (`openedByPrevious`), how many neither secret opens (`unopened`), how many only the secret before still opens (`left`), and the same by kind. At `left: 0` the secret before can be taken out of the configuration. A secret before that is not the one the deployment had opens nothing and answers `left: 0` too: where it opened no value while some open with neither, a second line, `the previous secret opened no value`, says to check it before it is taken out, and the exit code stays `0`, since nothing is under it. A value neither opens is left as it is and counted, never deleted: it was lost before the rotation, and its holder sets it again. The line is a warning where one is unopened, an error and exit code `1` where one is left. No value and no secret is ever in it.
5. **Without a secret before, the step is a configuration error** (exit code `78`), not an answer of nothing left: a container handed no secret would otherwise say the rotation is done.
6. **The `api` role says at every start that a secret before is read**, as a warning, so that it does not stay in the configuration for good.

## Why the step has a word of its own

A rollout runs `migrate` before the new replicas start, while replicas of the configuration before still serve. Run then, the step would seal everything under a secret those replicas do not have, and they would open nothing until they were replaced. Run by hand after the rollout, every replica reads both secrets and seals with the new one. The step also needs the two secrets, which a deployment's `migrate` task is often not given, and its answer is one a person reads on purpose.

## Consequences

- **A rotation is three steps, and no value is lost:** the new secret as `AUTH_SECRET` with the old one as `AUTH_SECRET_PREVIOUS`, rolled out; `migrate reseal`, run with the settings the `api` runs with, until it answers `left: 0`; `AUTH_SECRET_PREVIOUS` taken out, rolled out. [deploy/README.md](../../deploy/README.md#rotating-the-secret) has them.
- **While the first rollout lasts**, a replica still on the old configuration does not open what a new one sealed in those minutes. A deployment that cannot bear that names the new secret as `AUTH_SECRET_PREVIOUS` first, under the old `AUTH_SECRET`, rolls out, and then swaps the two.
- **The secret before stays a secret until it is taken out:** whoever holds it and a copy of the database opens what the copy holds. A copy made before the step is opened by it for good, so a secret that leaked is followed by the tokens themselves where they matter: a pack token made anew at the deployment, a plugin's credential at its service.
- **A row that keeps a sealed value is a store of the step** (`apps/console/src/db/queries/reseal.ts`). A test fails on a purpose sealed for that the step does not read; a new column under a purpose it reads is added there by hand, and the rule is in the workspace's README.
- **An agent account's value is sealed again as it was**, with the account and the name it is for, and nothing is noted on the account's record of its store: nobody set, read or removed a value.
- **Rejected:**
  - sealing again with every `migrate`: the rollout's order, above;
  - sealing again as a value is read: a value nobody reads stays under the secret before, and nothing says when it can go;
  - a list of secrets of any length: one secret before is what a rotation needs, and a second rotation begins when the first has ended;
  - a version of the key written into each sealed value: opening already says which secret a value is under, and the format stays what earlier releases read.
