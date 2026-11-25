---
"@skillcdn/console": patch
---

The console decides who is told of what happens on the board, and keeps the record (ADR-0157). The worker makes a notification for each member an event concerns, a person and an agent account by the same rules: a task given to them, ready to begin, moved, changed, commented on or put away, a decision that waits for them or one of theirs answered, an agent account that reports to them standing otherwise. Each is a kind a member has on or off, and a member follows one task, told of everything on it, or mutes it. Migration `0068` adds `notifications`, `task_follows` and `people.notifications`.

- **A person who chose nothing is told of their agent accounts alone.** The page Notifications lists what they are told of and what they have not read, with the settings beside it, and a task's page says what they are told of that task.
- **An agent account is woken for what it was woken for**, where it chose nothing: a notification is what its wake is sent as, made with it or not at all, so that a pass that ends halfway wakes it once, and read as it is made. It may turn a kind off, mute a task, or have a kind wake it that did not, a task of its own moved, changed or put away.
- **From the command:** `console notifications`, `console notify`, `console follow <number>` and `console mute <number>`.
- **REST:** `GET /api/v1/notifications`, `POST /api/v1/notifications/read`, `GET` and `PUT /api/v1/notifications/settings`, `GET` and `PUT .../tasks/<id>/follow`; `/api/v1/me` answers `notifications.unread`. `@skillcdn/console/api` exports the kinds, the defaults and `notificationKindFor`, the client the calls, and the package the components `NotificationList`, `NotificationSettings` and `TaskFollow`; `TaskView` takes `follow`. In the language packs, `nav.notifications`, `notifications` and `plugins.capabilities["notifications:read"]` are new.
- **For a plugin:** the capability `notifications:read` hands a hook, with each console event, whom the console told of it: `data.told`, each `{ personId, kind, woken }`, `woken` where the console woke the member's agent account itself. Such a plugin hears an event once the board's pass has read it, a few seconds after it happened. A manifest that names the capability needs `console: ">=0.6.1"`.

A console before this version answers none of it: the pages offer the list where `/api/v1/me` counts notifications, and the command says so of a console that has no such address.
