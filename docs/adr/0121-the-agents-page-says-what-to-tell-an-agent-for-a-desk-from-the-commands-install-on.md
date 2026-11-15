# ADR-0121: The Agents page says what to tell an agent for a desk, from the command's install on

- Status: Accepted
- Date: 2026-11-15
- Amends [ADR-0116](0116-a-desks-dashboard-is-a-page-of-a-console-of-ones-own-read-as-it-is-looked-at.md), point 7: what the organization's console says of where a desk comes from.

## Context

The Agents page said where a desk comes from in one line: the command that makes one, `console desk`, shown to be copied ([ADR-0116](0116-a-desks-dashboard-is-a-page-of-a-console-of-ones-own-read-as-it-is-looked-at.md), point 7). A command is for someone at a terminal. The person this page is written for is not there: they work through an agent, and the page already tells them so one block higher, where connecting an agent is a sentence to say to it, with the commands under it ([ADR-0011](0011-an-agent-connects-with-a-short-code-a-person-approves-and-the-token-is-never-shown.md)). A person who read the desk's line had to know that the command wants the `console` command installed and connected first, where to run it, and that its last line is for their agent and not for them.

## Decision

1. **The block says what to tell an agent, and the agent runs the commands.** Under "Connecting an agent", in the same shape: what a desk is in a sentence, where to start the agent, and one block to copy whole, which is a sentence for the agent with three commands under it: the command's install, the connection to this console, and `console desk --web`.
2. **The words begin from nothing.** They hold for an agent on a machine that has no `console` command yet, so that one block is all a person needs; the sentence says that the connection is left out where `console whoami` already names the person, since a login repeated asks for an approval again.
3. **The agent is told to go on as the last command says.** `console desk` ends with what sets the desk up, the skill of the organization's pack ([ADR-0115](0115-a-person-has-a-desk-too-written-by-the-command-and-set-up-by-a-skill-of-the-organizations-pack.md)); the page names no skill and no git host, and what it says the agent will ask, the git account, is the one thing the person has to know.
4. **The desk is made with its pages.** The words name `--web`: a person's desk is where they look at what they made, and an agent that needs none of it has no page to read here. The command's help says the rest.
5. **Nothing is typed by hand beside it.** Connecting keeps its commands for a person without an agent that runs them; a desk is set up by an agent, so the block has no such second half.

## Consequences

- The block is longer than a line, and is the one place on the organization's console that speaks of a desk.
- `DeskWords` takes the console's origin, as `ConnectWords` does, and takes the place of `DeskCommand` and `DESK_COMMAND`, which were in no release.
- What the words promise is the command's and the pack's to keep: `console desk --web` and what it prints are held by their own tests, and the page's test holds the three commands and their order.
- Rejected: a second block of commands to type by hand (the last step is an agent's either way); naming the setup skill on the page (the organization's pack may hold another, and the command already says how it is found).
