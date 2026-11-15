# ADR-0133: The console's schemas are closed to every role when a plugin first gets a schema of its own

- Status: Accepted
- Date: 2026-11-16
- Amends point 4 of [ADR-0051](0051-a-plugin-keeps-its-data-in-records-the-console-holds-or-in-a-schema-of-its-own-by-consent.md) (the plugin's role holds no right on `public`), which said what the role was granted and not what every role holds. Builds on [ADR-0125](0125-a-feed-is-read-no-further-than-its-settled-end-which-its-writers-hold-a-lock-for.md), which put the feeds' order in a schema nobody else may use. The contract is in [specs/plugins.md](../specs/plugins.md#sql) and [deploy/README.md](../../deploy/README.md#plugins-in-the-image).

## Context

A plugin that declares `storage:sql` runs its statements as a login role of the console's database ([ADR-0051](0051-a-plugin-keeps-its-data-in-records-the-console-holds-or-in-a-schema-of-its-own-by-consent.md)). Provisioning granted the role its own schema and revoked from it what it had been granted on `public`. That revoked nothing it held through `PUBLIC`, the group every role belongs to, and a new database gives `PUBLIC` the use of `public`, where the console's tables are.

A role that may use a schema may name a table in it, and some statements that name a table take a lock on it before they ask for any right on it. [ADR-0125](0125-a-feed-is-read-no-further-than-its-settled-end-which-its-writers-hold-a-lock-for.md) found that of the feeds' order and moved it into a schema of its own. The review before 0.5.1 found it of every table in `public`: a plugin with `storage:sql` could make the console's own reads and writes of a table of the board wait until they timed out, as often as it liked, with no right it was given. The documents said the role had nothing on `public`, which was true of its grants and not of the schema.

The console has three more schemas: the record of its migrations (`drizzle`), the transcript and the feeds' order. Each is made by the console's role and, as made, gives `PUBLIC` nothing; a keeper of the database who gives `PUBLIC` rights on new schemas by default opens them, and a plugin's own schema with them.

Only a schema's owner may take from `PUBLIC` what it holds there. From PostgreSQL 15 `public` is owned by `pg_database_owner`, which is whoever owns the database: the console's user in the compose files, the smallest install and a managed database whose master user made it. A revoke by a role that is not the owner and holds some right on the schema is not refused: PostgreSQL warns and revokes nothing.

Asked of PostgreSQL 18 as a plugin's role, while a writer of the console held the tables as a migration does: once the role may not use a schema, every way that was tried of naming a table in it (reading it, preparing a statement over it, locking it, deriving a table, a view, a function, a trigger, a rule or a constraint from it, changing it or its statistics, commenting on it, analysing, vacuuming or explaining it, casting its name) is refused for the schema at once, before any lock is asked for.

## Decision

1. **A plugin's role may use no schema of the console's, nor another plugin's.** The console's schemas are `public`, `drizzle`, `transcript` and `feed_order`, named in one place in the code; a migration that makes another adds it there, and a test fails on a schema the list does not name.
2. **Provisioning takes from `PUBLIC` what it holds on them**, whenever a plugin with `storage:sql` is provisioned (when it is enabled, at every boot after, and by the `migrate` role), before anything of the plugin is made. Not in the console's own migrations: a console with no such plugin leaves the database as its keeper set it, since other roles of the database, one made to read the console's tables say, may use `public` through `PUBLIC`, and a revoke there would take that from all of them at every console's next `migrate`. When provisioning takes something, it says so in the log, a warning that names the schemas.
3. **Where the console's user may not, `storage:sql` is refused in words that give the statement the database's owner runs once**: the console's user is granted by name the use of the schema and the right to create in it, which it may have held through `PUBLIC` alone, and `PUBLIC` loses what it held. A revoke is never taken for done: what `PUBLIC` holds is read again after it. Nothing of the plugin is made; enabling it is refused (`plugin.unavailable`), a plugin enabled before is held failed at the next boot with those words as its problem, and its statements are refused until it is provisioned.
4. **What the plugin's role was given by name on one of those schemas is taken back**, and refused the same way, with the revoke the owner runs, where the console's user may not.
5. **A plugin's schema is its role's alone**: `PUBLIC` is left nothing on it, whatever default rights the database's keeper set.

## Consequences

- **A plugin cannot hold up the board, its feeds, the transcript or the console's migrations by naming a table of the console's**: it cannot name one.
- **Every other role of the database loses what it held through `PUBLIC` on the console's schemas** once the first plugin with `storage:sql` is provisioned, and uses them only by a grant of its own. The deployment contract says so; a role made for reading is granted the use of `public` by name.
- **A deployment whose console user does not own the database** runs one statement before its first plugin with a schema of its own works, and is told which. One whose user owns it runs nothing.
- **What remains.** The catalog's functions that take a table's number, not its name, are not governed by the schema's rights, and a role cannot be kept from them. Nothing they take conflicts with the board's reads and writes: a lock for the length of the call, and for a few of them until the transaction ends, the weakest there is on a table or a write's on a sequence. It conflicts with a change to a table's structure, which the console makes while it runs only when it makes the partitions of a new month of the transcript, and then waits no longer than its lock timeout. The advisory locks are as [ADR-0125](0125-a-feed-is-read-no-further-than-its-settled-end-which-its-writers-hold-a-lock-for.md) left them.
- **Rejected:**
  - revoking in the console's own migrations, for every console: it changes every database at its next `migrate`, with plugins or without, and takes from every other role of it what it held through `PUBLIC`;
  - moving the console's tables out of `public` into a schema of the console's own: every table, query and migration moves, for what a revoke does;
  - revoking the schema from the plugin's role alone: a right held through `PUBLIC` is not revoked from one of its members;
  - guarding the console's tables one by one: the lock is taken before any right on a table is asked for;
  - letting a refused revoke pass on PostgreSQL's warning: the plugin would run with the schema open while the documents say it is closed.
