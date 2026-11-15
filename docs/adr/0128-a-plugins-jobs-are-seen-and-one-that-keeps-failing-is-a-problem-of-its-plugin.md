# ADR-0128: A plugin's jobs are seen, and one that keeps failing is a problem of its plugin

- Status: Accepted
- Date: 2026-11-15
- Builds on [ADR-0049](0049-a-plugin-is-an-npm-package-installed-into-the-image-and-enabled-by-an-administrator.md) (a plugin's state and its problems), [ADR-0050](0050-plugin-code-runs-in-a-host-process-of-its-own-and-reaches-the-console-only-through-the-capabilities-it-declared.md) (its jobs run in a host, with the `jobs` capability) and [ADR-0053](0053-agents-reach-a-plugin-through-one-command-whose-definitions-the-console-holds.md) (the one command an agent reaches a plugin through).

## Context

A plugin's job that fails leaves a line in the log and a `plugin.failed` event, at most one an hour. Neither reached anyone. On a deployment, two jobs of one plugin failed at every run for more than four days: the plugin was enabled, its state said so, `problems` was empty, the settings page showed nothing of it, and the plugin had no board project, so that its events stood in no project's feed. The row the scheduler keeps for a job held the last run, its outcome and the next time, and no route, page or command answered it. The plugin's events were read by a route no command called.

## Decision

1. **Each job is answered as the scheduler keeps it.** `GET /api/v1/plugins/<key>` answers `jobs`: for every job the plugin's module declares, how often it runs (`every`, `at`), its last run and outcome, its next time, and since when it has failed. `console plugin <key>` prints a line per job, and the plugin's settings page a row of them. The next time is answered only where the scheduler runs the jobs, the plugin enabled with `jobs`: a time kept from before is no promise.
2. **The row keeps since when a job has failed, run after run** (`plugin_jobs.failed_since`): its first failure after it went well, cleared by its next run that goes well. A job whose last run had failed when the column was added has failed since that run.
3. **A job that failed twice running is a problem of its plugin.** `the job <name> has failed since <moment>`, with where the reason is, stands among the plugin's `problems` until the job's next run goes well: in `GET /api/v1/plugins` and `console plugins`, for whoever lists the plugins, on the plugin's settings page, and beside the plugin's state in the list of the settings pages. The plugin stays enabled, and its state is unchanged: what works in it goes on working. One failure is not a problem: a host away for a moment fails a run and the next goes well, and a problem that comes and goes is one nobody reads.
4. **A plugin's events are read from the command.** `console plugin <key> events [--kind <kind>]` reads `GET /api/v1/plugins/<key>/events`, which takes a kind to narrow by: `plugin.failed` is what went wrong, with why. The route answers for a plugin with no board project as for any. `events` is a subcommand from now on, so that no command or query of a plugin is named so.
5. **The settings page says "Problems" of a plugin that runs.** "Why it cannot run" heads the problems of a plugin that failed; a plugin that runs with a job failing is not one that cannot run.

## Consequences

- An administrator who lists the plugins, on the pages or through an agent, sees a job that stopped working at its second failure, and reads why with one command.
- The command of this version reads a console of before: such a console answers no `jobs`, and nothing is printed of them; it does not narrow events by kind, and the command keeps the kind asked for of the page it read and says so.
- A plugin whose module names a command or a query `events` no longer loads, and `console-plugin check` says so; none of the plugins published beside the console has one.
- One more column, written at every run of a job; the listing of the plugins reads the jobs of the workspace once.
- **Not changed:** a plugin whose records are behind its code stays enabled and is said among its problems, as the specification's "Lifecycle" has it since 0.5.0. Holding such a plugin as failed was considered again here, since the failures above began with an upgrade that had not run: it would take down the commands and the pages of a plugin written to read the records of the version before, to stop the writes that fail, and those now show, as this problem and the job's.
- **Rejected:**
  - a problem at the first failure: a job that reaches another service fails now and then, and the problem would be on and off;
  - a count of failures, or a number of hours, as the bound: the second failure running is the first moment a failure is known not to be one of those, whatever the job's period, and the moment it began says the rest;
  - reading the run of failures from the `plugin.failed` events: one is written an hour at most, and a run that went well writes none, so that where the run began is not in them;
  - a state of its own for a plugin with a failing job: a state decides what runs, and nothing here stops running.
