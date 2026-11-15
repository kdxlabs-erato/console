# ADR-0119: A take leaves out the rules a session says it holds

- Status: Accepted
- Date: 2026-11-15
- Amends [ADR-0023](0023-the-rules-of-a-board-are-pages-the-workspace-and-its-projects-keep-read-first-by-every-agent.md), point 4: what `console rules` and `console take` print of the rules; the parts it names are those of [ADR-0120](0120-the-consoles-rules-always-hold-and-a-workspace-and-a-project-add-to-them.md). The contract is in [specs/cli.md](../specs/cli.md#commands-for-working-a-task).

## Context

`console take` prints the rules with the task it took, since everything from there acts within them ([ADR-0023](0023-the-rules-of-a-board-are-pages-the-workspace-and-its-projects-keep-read-first-by-every-agent.md)): the workspace's, then what the project adds, then the plugins. That is right for the first task of a session and dear for the fifth. One piece of work often takes several tasks, and each take printed the same few thousand characters again.

Agents answered that themselves, and wrongly. A session that had read the workspace's rules once cut every later print at its head. The workspace's text came first, and the line that said whether the project had rules of its own came last: the session never saw it, never read the project's own rules, and told the project's owner to write them as new.

A switch that turns the rules off would mend the cost and widen the harm: the agent that cuts is the one that would set it, and so would any agent told to save its context, whether it had read the rules or not.

## Decision

1. **The rules begin with a line that says what follows.** `Rules <mark>:`, then which parts there are, in the order they are printed, and how many characters each is: what the project adds, or that it adds nothing; its plugins; what the organization adds, or that it adds nothing; the console's rules. An agent that cuts knows what it cuts.
2. **What differs stands first, and what always holds last**: what the project adds with the plugins' lines, then what the organization adds, then the console's rules. The first are short and are what differs from one project to the next; the console's are the same on every take. The line says that the earlier part holds where they differ, which the order alone would not say.
3. **The rules have a mark**: the first eight hex characters of a SHA-256 over what they say to whoever reads them, the console's rules with what the organization adds, what the project adds and the plugins' lines, in the language they are read in. The same rules have the same mark; a changed rule, another project's rules and another language have another. When a page was written and by whom is no part of it, and a project that adds nothing has the mark of the workspace's alone.
4. **`console take <number> --rules <mark>` leaves the rules out where the mark is the one they have**, and one line stands in their place, with the mark, saying that they stand as the session read them. Where the mark is not theirs, since a rule changed or the mark is of another project's, the rules are printed whole under the mark they have now, after a line that says so.
5. **Without a mark, a take prints the rules whole, as before.** A mark is known only from having been shown the rules: a fresh session, a subagent handed a task, and an agent that follows no skill cannot say one, and get the rules whatever they do. That is why it is a mark and not a switch.
6. **The command does this, and the server does not change.** It reads the rules as before and computes the mark from what it prints; `--json` carries the rules either way, and the mark beside them.

## Consequences

- A session pays for the rules once, and again when they change, when it works in another project and when it reads in another language: each of those is a moment the rules it holds are not the rules that hold.
- A change of the rules reaches a session at work at its next take, whole and said, where a session that had stopped reading would not have seen it.
- What cannot be held to this is a session that reads a mark and not the rules under it, and says it. The mark stands at the head of the rules themselves and nowhere else, and the line it stands on says how long they are; nothing prints it to an agent that did not ask for the rules.
- A mark of eight characters is enough for what it guards: it is compared with one value, the rules of this project now, and a session that guesses it gains nothing a switch would not have given it.
- The skills say in a clause that a later take of the same session carries the mark; the default they rest on is the whole print.
- Rejected: a switch, `--no-rules` (above); printing the rules once per token or per run, kept by the console (the console would claim to know what a session holds, and a session's context is cleared and compacted without telling it); the version of the rules' pages as the mark (the console's own rules have none, the plugins' lines have none, and the language a person reads in changes what is said without a version); leaving the workspace's first and the line last (what the runs showed); printing the project's own alone on a take (an agent would never be shown the organization's rules by the command that begins its work).
