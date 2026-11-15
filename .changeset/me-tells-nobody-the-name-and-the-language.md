---
"@skillcdn/console": patch
---

Breaking: `GET /api/v1/me` tells nobody signed in the workspace's name and its language alone, which is what the sign-in page shows. For nobody, `tokenDaysAtMost` is `null`, `skills` is `{ "source": "", "address": null }`, and `peopleVisibility`, `weekStart`, `timeZone` and `skills.packToken` are left out, as the short name, the domain and the services already were. A member's answer is as it was, and the schema is unchanged: a console built on an earlier version of the package reads both.
