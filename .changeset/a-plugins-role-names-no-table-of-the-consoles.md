---
"@skillcdn/console": patch
---

Breaking: a plugin with a schema of its own (`storage:sql`) can no longer name a table of the console's (ADR-0133). Its role could use the schema `public` through `PUBLIC`, as every role of a new database can, and through it hold up the console's tables: such a plugin could make the board's reads and writes wait until they failed. When a plugin with `storage:sql` is provisioned, at enabling and at every boot, the console now takes from `PUBLIC` what it holds on the console's schemas (`public`, `drizzle`, `transcript`, `feed_order`) and on the plugins', and says so in its log (`PUBLIC may no longer use these schemas`).

- **Every other role of the database** then uses the console's schemas only by a grant of its own: a role made to read the console's tables is granted `USAGE ON SCHEMA public` by name, by the database's owner.
- **A console whose database user does not own the database** may not take that from `PUBLIC`: enabling such a plugin is refused with `plugin.unavailable`, and one enabled before is listed as failed, in words that give the statement the database's owner runs once, `GRANT USAGE, CREATE ON SCHEMA "public" TO "<the console's user>"; REVOKE ALL ON SCHEMA "public" FROM PUBLIC;`. A console whose user owns its database, as in the compose files, the smallest install and a managed database its master user made, runs nothing.

A console with no plugin that asks `storage:sql` leaves its database as it is.
