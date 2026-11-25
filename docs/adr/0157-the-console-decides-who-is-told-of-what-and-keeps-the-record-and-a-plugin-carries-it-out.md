# ADR-0157: The console decides who is told of what and keeps the record, and a plugin carries it out

- Status: Accepted
- Date: 2026-11-25
- Supersedes in part [ADR-0071](0071-the-console-sends-no-notification-of-its-own-a-plugin-carries-them-out-of-the-board-and-back.md), under which the console sent no notification of its own and a plugin both chose whom to tell and told them: choosing whom is the console's now, and carrying it out of the console stays a plugin's. Amends point 10 of [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md): the board's wakes are what an agent account's notifications are sent as, and what an account is woken for is the account's to choose.

## Context

Two things told a member of what happened on their work, by two sets of rules. The board woke an agent account, by rules the worker applied to the feed. The messenger plugin told a person, and an agent account that has an account at the messenger, by rules of its own: whom to tell of a task, what each chose to be told of, and a record of what it sent that only whoever keeps the messenger reads.

An agent account was told twice, once by each. Twenty tasks commented on and closed in three minutes reached their owner, an agent account, as some forty messages, a wake and a direct message for each piece of news, and nothing let it say of one task that it wanted none. The same is true of a person: a task could be neither followed nor muted, in the console or in the messenger. And a person had no place in the console that said what they had been told: the setting was the messenger's while the work was the console's, so that what one is told of a task could be set on no page of the task.

ADR-0071 gave all of this to a plugin, for a reason that still holds for half of it: the words in a person's language, the thread a message belongs to and the button that answers are a messenger's to know. Who is concerned by what happened on the board is not: it is read from the board, and every carrier would work it out again by rules of its own.

## Decision

1. **The console decides who is told of what happens on the board.** The worker reads the feed from a cursor, as it did for the wakes, and makes a **notification** for each member an event concerns: one row for a member and an event, under the **kind** that says why. A person and an agent account are told by the same rules:

   | What happened | Who is told | Kind |
   |---|---|---|
   | A task written | its owner and those at work on it | `assigned`; `ready` for those at work on it where it is ready and not planned for a later day |
   | Someone put to work on a task | those the change added | `assigned`, or `ready` as above |
   | A ready task's day moved to today or before, or taken away | those at work on it | `ready` |
   | A task's title, body or days changed | its owner and those at work on it | `changed` |
   | A task moved from one state to another | its owner; those at work on it where it became ready, as above | `moved`; `ready` |
   | A comment on a task | its owner and those at work on it | `commented` |
   | A task put away | its owner and those at work on it | `archived` |
   | A decision raised, or addressed anew | whom it is for, those the change named | `decision` |
   | A decision answered | whoever raised it | `answered` |
   | An agent account stopped, refused, failed or not heard from, and running again after | whom it reports to | `agent` |

   Nobody is told of what they did themselves; a task the console itself gave back, ending a run it had not heard from, tells nobody ([ADR-0114](0114-the-end-of-a-run-leaves-no-task-at-work-behind-it.md)); and a member is told only of what they may still see: a task of a project they may work in, a decision that reaches them.
2. **A kind is on or off for a member, and a notification is made only under a kind that is on.** Where an event is several kinds to a member, they are told once, under the first that is on, the one that says most first: `ready` before `assigned`. A member turns a kind on and off, turns a project off, and says whether what an agent of their own did as them counts, which it does not unless they say so. Where they chose nothing:
   - **a person is told of the agent accounts that report to them, and of nothing else.** What happens on their own work is on the board when they look, and what was not asked for is noise;
   - **an agent account is told of what asks something of it**: `ready`, `commented`, `decision`, `answered`, and `agent` for one that others report to. Nobody attends an agent account, so that what it is not told of it does not learn of. These are the events the board woke it for before.
3. **A member follows a task, or mutes it.** Following is the member saying of one task that they want everything: its changes, its moves, its comments and its being put away are told to them, whatever their kinds and whatever its project. Muted, a task tells them nothing, its owner and its workers among them. Either is taken back, and the task tells them as their settings say again. Anyone who may see a task may follow it.
4. **A notification is read in the console, by its member alone.** `GET /api/v1/notifications` answers them, the newest first, each with the feed's own event, said as the feed says it, its project and whether it was read; `POST .../read` marks those named, or all; `/api/v1/me` counts those not read, which the pages say beside Notifications. A notification is answered only while its member may still see the thing it is of. It is kept ninety days: the record of what happened is the feed, and this is a member's list of it.
5. **For an agent account, a notification is its wake.** The signal on the account's record and the notification are made together or not at all, so that a pass that ends halfway tells nobody twice, and the notification is read as it is made: the wake said it, and an account's list is a record of what it was woken for, with nothing in it left to read. What an account turned off does not wake it, and a task it muted wakes it for nothing: the wake rules of ADR-0085 are these rules with the defaults of point 2. The console's own housekeeping, a change of the services a workspace names, wakes every account as before, and is no notification.
6. **Carrying a notification out of the console is a plugin's.** A plugin that holds the new capability `notifications:read` is handed, with each console event it hears, whom the console told of it: `data.told`, each `{ personId, kind, woken }`. `woken` says the console told the member itself, by a wake of its agent account, so that the carrier carries that one to nobody. Such a plugin hears an event once the board's pass has read it, a few seconds after it happened. How it is carried, at once or once a day, in which conversation, with which words and buttons, stays the carrier's, as ADR-0071 has it.
7. **A member chooses from the command as from the pages**: `console notifications`, `console notify`, `console follow` and `console mute`, each the caller's own, a person's agent with their token as the person ([ADR-0021](0021-a-token-configures-as-its-person-does.md)).

## Consequences

- **An agent account is woken for what it was woken for**, where it chose nothing, and its text is the one it read before. It may now turn a kind off, mute a task, or have a kind wake it that did not: a task moved, changed or put away.
- **A person who chose nothing reads an empty list**, but for their agent accounts. The page says so and leads to the settings; following a task is the way to be told of one task without turning a kind on for all of them.
- **Until a messenger reads `told`, it tells by rules of its own**, and an agent account that has an account there may still be told twice of what both tell: the plugin's side is its repository's work. The capability and the list are what it needs for it.
- **A console of before answers none of this.** The command says so of a console that has no such address, and the pages offer the list where `/api/v1/me` counts notifications, which an older console does not.
- **The worker's pass does a little more for each event**: it reads who follows the task and what each member concerned chose. The members concerned by an event are a handful.
- **Rejected:** a notification as an event of the feed, which would put each member's list where a project's members read it; two settings for a kind, one for the list and one for being told at once, which is one more thing to explain than a member needs while one kind is one choice; mail and push sent by the console, which ADR-0071 rejected and nothing here takes back; and a list of everything that concerns a member whatever they chose, which is the feed read by a filter.
- **Not decided here:** what a run does on a task, a report or what it hands in, which is told to nobody, a follower among them; a decision about a task, which is told to whom it is for whatever they made of the task; a mention of a member in a comment, a stream by which a page learns of a notification the moment it is made (the count follows the board's feed and a visit to the page), and a supervisor choosing for an agent account what it is told of.
