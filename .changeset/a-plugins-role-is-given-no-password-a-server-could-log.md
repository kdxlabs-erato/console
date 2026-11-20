---
"@skillcdn/console": patch
---

The image gives a plugin's database role its password in the form the server keeps one. With `storage:sql`, the statement that makes or changes the role carried the password the console draws at every boot, and a PostgreSQL that logs its statements (`log_statement` of `ddl` or more) wrote it into the server's log. The statement now carries a SCRAM-SHA-256 verifier, a salt and two keys from which no login can be made, and the password stays in the console's memory alone. Nothing changes for a plugin or for whoever operates the database; a server whose log held such a statement holds a password that was replaced at the console's next boot.
