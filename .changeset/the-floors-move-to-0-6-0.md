---
"@skillcdn/console": patch
---

Breaking: the console takes commands from 0.6.0 on, and the command consoles from 0.6.0 on (ADR-0038, ADR-0043): a command and a console go together within one line, and both floors begin the 0.6 line at its first version. A console from 0.6.0 answers a command of the line before with `426` and `client.outdated`, naming the version to install (`npm install -g @skillcdn/console@latest`), and a command from 0.6.0 is refused by a console of the 0.5 line as too new. Move a deployment and the commands that work with it in one sitting: the console first, each machine's command after it, an agent account's machine included, whose runner ends by itself once the command it runs from was updated and is started again by its service. Where one machine's command serves several consoles, they move together; a console still on the line before is reached meanwhile with `npm exec --package=@skillcdn/console@<its version> -- console ...`.

A plugin whose manifest names the consoles it runs on within the 0.5 line (`"console": ">=0.5.0 <0.6.0"`) is refused by a 0.6.0 console until its range is raised: publish the plugin for the 0.6 line before the deployment that installs it moves.
