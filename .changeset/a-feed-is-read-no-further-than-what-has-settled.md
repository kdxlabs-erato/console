---
"@skillcdn/console": patch
---

The console reads its feeds no further than what has settled (ADR-0125). An event is numbered when it is written and seen when its change is committed, so a change numbered first could be committed last, and a reader that had gone past its number never read it: an agent account was not woken until the task's next event or its next briefing, a plugin's hook never heard of the event, and a page stayed stale until the next one.

- **Writers:** whatever writes an event holds a lock, shared with the other writers, until its change is committed. Writers never wait for each other, and never behind a reader.
- **Readers:** every read by number ends at the highest number below which no change is still under way: the board's wakes, the plugins' hooks on both streams, `GET .../events` with `after` or `latest=true`, the stream, a `--wait` for an answer, and `GET .../plugin-events`. An event committed while an earlier one is still under way is carried a moment later, in the order of the numbers. What the API answers is otherwise as it was.
- **A job no longer stops for good at one event:** an event whose wakes fail in twelve passes in a row is passed over, with an error in the log that names its number and kind; an event the console could not make ready for a plugin's hook is skipped after its tries with a `plugin.failed` event, as one whose hook fails is.

No migration.
