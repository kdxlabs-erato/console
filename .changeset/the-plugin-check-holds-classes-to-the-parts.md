---
"@skillcdn/console": patch
---

Breaking: `console-plugin check` holds the `sc-` classes of a plugin's web bundle to the console's parts (ADR-0106). It reads every script and stylesheet of the bundle, the entry, its chunks and its styles, and fails on a class of one of the console's own pages, which lays that page out and changes with it; a name in the console's prefix that nothing of the console styles is a warning. The parts are the rows of the catalogue the package ships, `src/styles/README.md`, read where the command is installed, so a part added there is one a plugin may use. A plugin built from the parts, as the template and the example are, passes as before.
