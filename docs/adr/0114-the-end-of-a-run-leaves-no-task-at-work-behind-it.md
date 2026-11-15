# ADR-0114: The end of a run leaves no task at work behind it

- Status: Accepted
- Date: 2026-11-15
- Amends point 2 of [ADR-0020](0020-the-console-does-not-claim-an-agent-is-at-work-a-run-says-when-it-was-last-heard-from-and-a-new-run-takes-over.md) and point 1 of [ADR-0041](0041-a-run-not-heard-from-for-twelve-hours-is-ended-by-the-console.md), where each has an abandoned run leave the task as it is, and adds a move that wakes nobody to point 10 of [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md).

## Context

Taking a task moves it to `in_progress`, and only a finished run moved it on, to `in_review`. A run that failed, a run its person gave up on and a run the console ended for silence all left the task `in_progress`: at work, with nobody at it. Whoever reads the board to continue the work, a collaborator or their agent, sees such a task beside those a run is open on, and tells them apart only by opening each. A task taken by mistake and left at once stood at work from then on. The skills have an agent never move a task by hand around a run, so nothing an agent was told to do put it right, and a run the console ends has no agent to do it.

## Decision

1. **A run that ends as `failed` puts a task that is `in_progress` up for review (`in_review`), as a finished one does.** A run ends with a verdict, done or could not be done, and either way a person looks at what it ended with: the summary of a failed run says why and what is left, and the person rewrites the task, drops it, or sends it on.
2. **A run that ends as `abandoned` puts a task that is `in_progress` back in the state the take found it in**, whoever ended it: its person leaving it, an owner giving up on it, or the console after twelve hours of silence (ADR-0041). The run keeps that state (`runs.task_state_before`). A run that takes another over while the task is at work keeps the state that one found, so that a chain of takeovers gives the task back to the state no run had touched. A run from before this decision kept none and gives the task back as `ready`.
3. **Only a task still at work, and only when no other run is open on it.** A task a person moved meanwhile is theirs to place, and the end of a run moves nothing. A run taken over ends as abandoned while the new one works, and the task stays at work. A task a person had put at work by hand before the take was found at work, and is left so.
4. **The move is the ender's.** It is `task.moved` on the feed as every move is: by the agent, under the name of its run, for its own ending; by the person who gave the run up; by nobody for the console's.
5. **A task the console itself gave back wakes nobody.** A task moved to `ready` wakes the agent accounts at work on it, except the one who moved it (ADR-0085, point 10). An agent that leaves its own run is the mover, and is not woken. An agent whose run the console ended for silence would be woken at once, take the task, fall silent and be woken again, every twelve hours with nobody looking; so a move that names no actor and no plugin wakes no one. The task is `ready` on the agent's plate and in its next briefing, and its manager sees the run ended as not heard from. A person who gives up on an agent's run moves the task as themselves, and the agent is woken as for any task a person makes ready: a person did it, each time.

## Consequences

- `in_progress` says that a run is open on the task, or that a person put it there. `in_review` holds what a run finished and what a run could not do; the run's status and its summary say which, on the task and in the feed. No page changes.
- What a person says of a task up for review, their agent writes: `console task edit <number> --state done` when it passes; when more is asked, a comment with what is asked and the task taken again, or set `ready` for whoever takes it next. The skill working-the-board says so. This is the plan set by hand on a person's word, never a move around a run.
- `POST .../runs/<id>/end` takes and answers what it did. What differs is the task afterwards, which a client that read "a failed or abandoned run leaves the task in progress" sees: the changeset says so.
- The end of a run locks the task's row before the run's, the order a take locks them in, so that an end and a take of one task never wait on each other; the console's own pass finds the silent runs first and locks each task before its run.
- A task's moments are unchanged: the first move past ready is kept as when it was started, also for a task given back, as for one a person moves back by hand ([ADR-0019](0019-a-task-is-planned-in-days-the-board-keeps-its-moments-and-goals-and-categories-give-the-work-its-shape.md)).
- Rejected:
  - A failed run giving the task back as `ready`: it would say the task can be taken as it is written, when the run has just said it cannot, and the next agent, or the same one at its next briefing, would take it and fail again.
  - A failed run making the task an `idea`: out of sight, among what was never begun, where the person who must look does not look.
  - A state of its own for a task whose run failed: another word for every page, filter and command to know, where "up for review, the run failed" says it.
  - An abandoned run always giving the task back as `ready`: a task that was an idea, which no person had made ready, would be made ready by a mistaken take.
  - Leaving the task and telling agents to move it: the console's own ending has no agent, and an agent that never moves a task around a run is what keeps the board's moves true.
