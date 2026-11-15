# ADR-0129: A login under an agent says its code and ends, and the next call waits

- Status: Accepted
- Date: 2026-11-15
- Amends [ADR-0011](0011-an-agent-connects-with-a-short-code-a-person-approves-and-the-token-is-never-shown.md), points 1 and 3 (the command printed the code and waited in the one call, and its secret lived in that process alone). Builds on [ADR-0027](0027-the-command-keeps-a-login-per-console-and-a-token-goes-only-to-the-console-that-issued-it.md) (where the command keeps what a login was given). The contract is in [specs/cli.md](../specs/cli.md).

## Context

`console login` printed the address and the code and then asked the console every few seconds until a person approved, in one call. That is right at a terminal, where a person reads the two lines as they are printed. An agent runs the command through a host, and a host shows a command's output when the command ends. A fresh agent told to connect ran the command in the foreground, and its person was handed the address and the code two minutes later, when the host cut the call off: the code was good, the wait was the host's limit. An agent that happened to run it in the background relayed both in half a minute. The words on the Agents page told the agent to relay the code and could not tell it how its host runs a command.

## Decision

1. **Where no terminal shows the command's words as they are printed, the call that begins a connection says the address and the code and ends at once**, with `0`. Its second line says what is next: tell the person both now, and run the same command once more. Whether a terminal is there is asked of the command's standard output, in its entry point, and handed to the command as everything else of the process is.
2. **The next `console login` for that console goes on with the connection.** It begins no new code, claims the one kept at once, since the person may have approved between the two calls, and waits for the approval ninety seconds a call: within the two minutes the hosts measured give a command. A wait that runs out ends with `3`, the code of a wait as `decision --wait` has it, saying the code and the address again and that the same command waits on while the code lasts. `--wait <seconds>` says another wait for either call.
3. **At a terminal the command waits where it stands, as before**, and keeps nothing meanwhile. A wait said there (`--wait`) that runs out keeps the connection the same way, so that a person may go on with it too.
4. **The connection that waits is kept with the logins**: its secret, its code, the page's address and its end, one a console at most, in the credentials file, written whole under the mode a token is kept under. It is never printed: `console logins` names the console, the code and its end; `console logout` forgets it; a login kept at that console ends it; and whatever the command keeps anew carries none whose code ran out.
5. **A connection kept that is over is forgotten and said, and a new code begun in the same call**: one whose code ran out on this machine's clock, without asking the console, and one the console no longer knows, whose code ran out there or whose person said it was not theirs. A call that asks to be the account itself (`--self`) does not go on with an agent's connection, nor the other way round.
6. **Nothing new is asked of the console.** The two routes of ADR-0011 are used as they were, the second from another process than the first. A command of this decision connects to a console from before it, and the words on the pages of a console from before it, which have the agent relay the address and the code, are still followed by what the command prints.

## Consequences

- **A person has the address and the code as soon as the agent's first call ends**, whatever the host does with a command that waits. The agent's second call is the wait, and its host's limit no longer decides when a person is told.
- **A secret rests on the machine for as long as its code lasts.** ADR-0011 kept it in the process so that nothing secret would rest anywhere during the wait. What rests now is the command's half of a connection: it is good for nothing until a person signed in at the console approves the code they were shown, it is spent by the claim that follows, and it lies in the file, under the mode, where the token it becomes will lie for as long as the agent is connected. Whoever can read that file reads the tokens kept there already. The console still stores only the hash of it (point 3 of ADR-0011 stands on the server's side).
- **A command from before this decision reads the credentials file without the connections that wait and writes it back without them**: a connection begun by a newer command and gone on with by an older one is begun again. The file's version stays 2.
- **A script that ran `console login` with no terminal and waited on its exit code now needs `--wait <seconds>`**, or `--token-stdin`, which is what a job uses and is unchanged. An agent account's setup signs in with its own flow and is unchanged.
- **The words that tell an agent to connect name no step of the flow**: the block on the Agents page and the one on the Connect page say to run the commands and to do what each says, and the command says the rest.
- **Rejected:**
  - telling agents to run the command in the background: how a host runs a command is not the console's to say, and the two hosts measured differ;
  - printing the code to standard error, or flushing sooner: a host shows neither stream before the command ends;
  - a separate command for the second call (`login --finish`): the same command twice is one thing to remember, and the first call's line names it whole;
  - keeping the connection in a file of its own: one more file to give the mode of a secret, for what the credentials file already is;
  - waiting less than the host's limit in the one call and printing then: the person would still wait as long as the command does.
