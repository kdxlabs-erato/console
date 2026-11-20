# ADR-0144: A runner takes its `runner.json` as it changes, and says how its wake sources stand

- Status: Accepted
- Date: 2026-11-20
- Amends [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md) in when a desk's `runner.json` is read and in what a heartbeat says.

## Context

`runner.json` is the agent's own file, and the runner read it once, when it started. An agent that added the messenger's wake source to it, as its first task says, had done everything right and was not woken by a message: the change waited for a restart the agent could not give itself, since restarting its runner ends its own session. A person restarted the service on the machine.

Whether a wake source listens was said in the runner's own log and nowhere else. The agent could not check its work, and its manager could not see why a message woke nobody.

## Decision

1. **A runner looks at its `runner.json` with every heartbeat.** One that reads and is another than the runner was started with is taken once it was seen so twice, a heartbeat apart, so that a file being written is not read halfway.
2. **Taken between two turns.** The runner ends the open session as one restarted, with the turn under way finished first, and the command begins the next runner with the file as it is, in the same process and with the same conversation. A runner started by hand does the same; no service is asked to start anything.
3. **A file that does not read changes nothing.** The runner goes on with what it was started with, says so once in its own lines, and tells the agent in its session what is wrong with the file, once for each thing that is: the file is the agent's to put right.
4. **A wake source says how it stands**, in one of three words: `connected`, `waiting`, with a few words of why where it has them, a token the store does not hold, and `failing`, with the name of what ended it. The runner says each change with a heartbeat at once, by the module's name and since when; never what a message said.
5. **The console keeps what the runner last said**, with the runner's row, and answers it to the account's supervisors and the account, as it does the rest of what a runner says of itself. The account's page and `console agent <handle>` show it. A runner of before says nothing of its sources, and none are shown for it.

## Consequences

- **An agent changes how it is run by editing its file**: a wake source, the secrets a session is handed, the browser of its browser tool. Its next turn runs with it.
- **Naming another driver begins a new conversation**, as before: a conversation is a product's own.
- **The first task's item on the messenger says how to see that it worked**: the account's line says the source is connected.
- **A heartbeat is a little larger**, by one short entry for each source, of which a desk names ten at most.
- **Not seen on a machine yet**: written after the run that asked for it, and held by the runner's tests with a file that changes under it.
