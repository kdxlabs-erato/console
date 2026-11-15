---
"@skillcdn/console": patch
---

The password the console draws for a plugin's database role (`storage:sql`) no longer reaches the log or the plugin's `plugin.failed` event. Where the database refused the statement that made the role or gave it its new password at a boot, a role of the plugin's name that the console's database user may not change say, what was logged and recorded quoted the statement whole, the password in it. The password never took effect, but none belongs in a log. Now the plugin is refused with `plugin.unavailable`, in words that name the role and give the database's code and words, `the role "plugin_<key>" could not be changed: the database answered 42501, permission denied to alter role (...)`, and the statement is said nowhere.
