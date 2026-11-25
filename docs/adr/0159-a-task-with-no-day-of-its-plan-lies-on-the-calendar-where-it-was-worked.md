# ADR-0159: A task with no day of its plan lies on the calendar where it was worked

- Status: Accepted
- Date: 2026-11-25
- Amends point 4 of [ADR-0019](0019-a-task-is-planned-in-days-the-board-keeps-its-moments-and-goals-and-categories-give-the-work-its-shape.md), where a calendar shows a task on the days of its plan and on no other. Its point 1 stands: the plan and the moments are two things, and neither is written from the other.

## Context

A calendar laid a task on its plan, its start and its due day ([ADR-0019](0019-a-task-is-planned-in-days-the-board-keeps-its-moments-and-goals-and-categories-give-the-work-its-shape.md)). A task with neither was on no day: named under a project's month as having no day set, and on the week of a plate not at all. Much work is never planned in days. An agent given work that has no task writes the task and takes it in one command, as the rules have it, and sets no day, since the plan is the person's; a person whose agent works connected to the console begins the same way; a task written without days is taken weeks later. The week of an agent account was nearly empty while the account worked every day, and a project's month showed what was planned and nothing of what was done beside it. The board knows when such a task was worked: it keeps the moment a task was started and the moment it was done.

## Decision

1. **A task with no day of its plan lies on a calendar on the days it was worked**, read from the moments the board keeps: from the day it was started (`startedAt`) through the day it was done (`doneAt`); through today while it is in progress or in review; and on the day it was started alone once it was given back or dropped, since the board keeps no moment for either. A task done before the board kept its start lies on the day it was done. A task neither planned nor started lies on no day, as before.
2. **A task with a day of its plan lies on its plan, as before**, whatever happened to it and when: a start, a due day or both decide. A task given a day later leaves the days it was worked for its plan.
3. **Nothing is written.** The plan stays as people left it: such a task is still among those with no day set, under a project's month and on a plate, is never late, and is counted by who has what as before. It is drawn with the parts a planned task is drawn with, a bar across its days or a mark on its one day, struck through once it is over; the card under the pointer says which it is, with the plan where there is one and the moments.
4. **Every calendar reads it the same way**, from one function (`daysOf`): a project's month, the month of a goal's tasks, and the week of a plate, a person's own, another's and an agent account's. The day a moment fell on is the reader's, by the browser's clock, as today is.
5. **The pages alone change.** Every task the API answers carried `startedAt` and `doneAt` already; the command, the REST contract and the rules are as they were.

## Consequences

- The week of an agent account and a project's month show what was worked without anyone planning it, the tasks from before this decision included.
- A bar on a month may be a record and not a plan. Whoever reads the plan reads it where it was: what is late, what has no day set, who has what, the days on a task. Whether a record is drawn with a look of its own is a decision of design, left open.
- The moments are only as true as the moves (ADR-0019): a task given back and taken again weeks later lies from its first start once it is at work, and a task that waits for its review grows by a day every day until a person says it passes.
- Rejected:
  - The command writing today as the start day of a task written and taken at once (`task new --take`): a plan nobody made, the planned start kept in step with the actual one that ADR-0019 rejected; one way of beginning among several, where a task taken later, a card moved by hand and a plugin's move stay off the calendar, as every task from before does; and a task on one day however long it was worked.
  - The same asked of agents by the rules: every agent of every member would have to follow it for the calendar to be true, and the plan would be the person's but for this.
  - The console writing a start day itself when a task is started: the same plan nobody made, kept for good, and not told apart afterwards from one a person set.
  - The end of a task dropped or given back read from when it was last changed: any later change to it would move the day.
  - A calendar of what happened beside the calendar of the plan: two pages to read one week of work from.
