---
"@skillcdn/console": patch
---

The partitions of a new month of the agent accounts' transcript are made whoever holds the transcript's tables. They were made with `create table ... partition of`, which waits for every other session to let go of the table it partitions: any role of the database, a plugin's with a schema of its own (`storage:sql`) among them, could hold it through a function of the catalog that takes a table's number, and the next month's partitions then failed to be made, leaving an agent account's sessions of that month nowhere to go. Each partition is now made as a table of its own and attached, which waits on no read, no write and no such role. An `analyze` of the transcript's tables by the database's keeper still makes it wait; the worker makes the month at its next pass.
