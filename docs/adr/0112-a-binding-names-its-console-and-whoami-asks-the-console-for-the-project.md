# ADR-0112: A binding names its console, and whoami asks the console for the project

- Status: Accepted
- Date: 2026-11-15
- Amends [ADR-0027](0027-the-command-keeps-a-login-per-console-and-a-token-goes-only-to-the-console-that-issued-it.md), point 4: what `console use` writes. The contract is in [specs/cli.md](../specs/cli.md#the-project).

## Context

A checkout says which project it works in with `.skillcdn-console.json`, committed in a private repository so that every clone is bound from its first command. `console use` wrote the console's address into it only where that console was not the default login of the machine it ran on, and the account wherever the machine held several logins at the console.

Both follow the machine that wrote the file, and the file is read on other machines. A file with the project alone works at whatever console is the default login of the machine that reads it: a teammate signed in to two consoles, with the other one as their default, gets every command refused as `project.not_found`, and where both consoles have a project of that key, the work is written to the wrong organization's board with no refusal at all. An account written because the first machine held two logins is the first person's, in a file every clone reads.

The agreement of such a checkout has its agents check the binding before the first command on the board: `console whoami` names the project. It did, by repeating the key it read from the file, the environment or the flag, without asking the console. A key the console did not have passed the check, and the command said nothing of where the key came from, which is the first thing to know when the wrong project is named: the checkout's own file, a file of a folder above it, or a variable of the shell.

## Decision

1. **`console use` writes the console's address every time**: the origin of the console the command talked to, whether it is the default login here or not. A file from before, with the project alone, is still read and still means the default login; binding the directory again writes the address.
2. **It writes the account only where one was asked for**: `--account <login>`, or a directory whose file named that account before. A machine that holds several logins at the console and names none is told to say which, as before; the file gains none by itself.
3. **`console whoami` asks the console for the project** the directory names (`GET /api/v1/projects/<key>`), and says its name beside its key, and where the key came from: `.skillcdn-console.json` in which directory, `CONSOLE_PROJECT`, or `--project`.
4. **A project the console does not have, or does not show the member, ends `whoami` with exit `1` and `project.not_found`**, after the lines that say who, at which console and with which versions, which are what the person needs to mend it. The message names the key, the console and where the key came from. The two cases stay one answer, as everywhere ([ADR-0008](0008-a-workspace-holds-projects-and-what-a-person-may-see-and-change-is-decided-per-project.md)).
5. **A directory that names no project is as it was**: `whoami` says so and exits with `0`, since an agent account's desk names none, and neither does a folder a repository is about to be made in.
6. **The server does not change.** The file's schema is the same three settings; nothing of a console learns where a command's project came from.

## Consequences

- A clone works at the console its repository was bound to, on every machine, whatever that machine's default login is. A machine not signed in there is told so, with the address, instead of asking another console for a project it never had.
- The address of an organization's console is in every file `console use` writes. That is what the file was already left out of a public repository for; a private repository commits it, and nothing in it is a credential.
- A committed file carries nobody's account unless somebody asked for it. A team whose members hold several logins at one console each say which on their own machine.
- The check an agreement asks for holds something: a `whoami` that exits with `0` and names a project means the console has that project and shows it to this member. A wrong binding is a refusal with the place it came from, where it was a line that looked right.
- `whoami` makes one more request where a project is named, and none where none is.
- Rejected: `whoami` printing the key and a warning with exit `0` (a check that warns passes, and an agent that reads the exit code goes on); refusing to read a file without an address (every checkout bound before would stop working, for a hazard its own machine does not have); writing the address only into files of repositories with a remote (the command does not know which files will be committed, and an ignored file loses nothing by naming its console); checking the project in every command instead (every command on the board already does, by being refused; `whoami` is the one that is asked before any of them).
