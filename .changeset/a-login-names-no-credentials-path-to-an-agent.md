---
"@skillcdn/console": patch
---

`console login` names the credentials file to a person at a terminal, and not to an agent.

Once connected, the command ended with "The token is kept in" and the full path of its credentials file. Where no terminal shows the command's words, an agent reads them, and that handed it the path of the one file it must never open. There the line now says that the token is kept on this machine by the command, and never shown, with no path; the same for the session's secret of `console login --self` and for a token given with `--token-stdin`. At a terminal the line is as it was. `console logins` names no path either way.
