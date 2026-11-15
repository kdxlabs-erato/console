---
"@skillcdn/console": patch
---

A plugin with a schema of its own (`storage:sql`) works past the console's first restart where the console's database user is no superuser, as a managed database's is. Every boot draws the plugin's role a new password, and the statement that did so named every power the role must not hold, which only a superuser may name: from the second boot on, the plugin's schema could not be provisioned and its statements were refused. Now only a power the role holds is taken from it.
