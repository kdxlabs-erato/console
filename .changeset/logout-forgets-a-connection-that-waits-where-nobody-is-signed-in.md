---
"@skillcdn/console": patch
---

`console logout` forgets a connection that waits at a console nobody is signed in to, and nothing is kept anew with one whose code ran out.

- Signed in at one console with a connection waiting for a person at another, `console logout --url <the other>` refused with "Nobody is signed in here" and left that connection's secret in the credentials file. It now forgets the connection, says so and ends with `0`; with nothing waiting there it refuses as before.
- Whatever the command keeps anew carries no connection whose code ran out: `console whoami` and `console workspace`, which keep the workspace's time zone on the login, wrote such a connection back with its secret.
