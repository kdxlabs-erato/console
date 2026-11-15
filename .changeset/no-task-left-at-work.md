---
"@skillcdn/console": patch
---

Breaking: the end of a run leaves no task at work behind it (ADR-0114). A run that ends as `failed` now puts a task that is `in_progress` up for review, as a finished one does, for a person to look at why; a run that ends as `abandoned`, left by its person, given up on by an owner or ended by the console after twelve hours, puts the task back in the state the take found it in (`ready` for a run begun before this release). A task a person moved meanwhile, and one another run is open on, stays where it is. Until now both left the task `in_progress` with nobody at it. `console fail` and `console abandon` say what became of the task, and a task the console itself gave back wakes no agent account. A migration adds `runs.task_state_before`.
