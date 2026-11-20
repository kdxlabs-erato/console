# ADR-0144: A runner takes its `runner.json` as it changes, and says how its wake sources stand

- Status: Accepted
- Date: 2026-11-20
- Amends [ADR-0085](0085-a-runner-on-the-agents-machine-is-told-by-signals-and-runs-one-session-at-a-time.md) in when a desk's `runner.json` is read and in what a heartbeat says.

## Context

`runner.json` is the agent's own file, and the runner read it once, when it started. An agent that added the messenger's wake source to it, as its first task says, had done everything right and was not woken by a message: the change waited for a restart the agent could not give itself, since restarting its runner ends its own session. A person restarted the service on the machine.

Whether a wake source listens was said in the runner's own log and nowhere else. The agent could not check its work, and its manager could not see why a message woke nobody.

## Decision

1. **A runner looks at its `runner.json` with every heartbeat.** How the file stands, another that reads or one that does not, is taken once it was seen the same way twice, a heartbeat apart, so that a file being written is not read halfway. The look goes on until the runner ends: a file put back as it was, or one that stopped reading, ends nothing.
2. **Taken between two turns.** The runner ends the open session as one restarted, with the turn under way finished first, and the command begins the next runner with the file as it is, in the same process and with the same conversation. A runner started by hand does the same; no service is asked to start anything. Where the file stopped reading between the runner's end and the next one's beginning, the agent having written it again in the turn that was under way, the next runner begins with the file as it last read: there is always a runner, since a session is the only way the agent is told what is wrong with its file.
3. **A file that does not read changes nothing.** The runner goes on with what it was started with, says so once in its own lines, and tells the agent what is wrong with the file, once for each thing that is, in the session that is open or in the next one that opens: the file is the agent's to put right.
4. **A wake source says how it stands**, in one of three words: `connected`, `waiting`, with a few words of why where it has them, a token the store does not hold, and `failing`, with the name of what ended it. A source that listened and ended with nothing wrong, a connection the other side closed, is `waiting` until it says that it listens again. The runner says each change with a heartbeat at once, by the module's name and since when; never what a message said.
5. **The console keeps what the runner last said**, with the runner's row, and answers it to the account's supervisors and the account, as it does the rest of what a runner says of itself. The account's page and `console agent <handle>` show it. A runner of before says nothing of its sources, and none are shown for it.

## Consequences

- **An agent changes how it is run by editing its file**: a wake source, the secrets a session is handed, the browser of its browser tool. Its next turn runs with it.
- **Naming another driver begins a new conversation**, as before: a conversation is a product's own.
- **The first task's item on the messenger says how to see that it worked**: the account's line says the source is connected.
- **A heartbeat is a little larger**, by one short entry for each source, of which a desk names ten at most.
- **Not seen on a machine yet**: written after the run that asked for it, and held by the runner's tests with a file that changes under it.
