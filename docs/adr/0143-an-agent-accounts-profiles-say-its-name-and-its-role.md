# ADR-0143: An agent account's profiles say its name and its role

- Status: Accepted; the second sentence of point 2, that the agent never says it is a person, and the consequence that rested on it are taken out by [ADR-0146](0146-the-desks-template-spends-no-sentence-on-what-an-agent-does-by-itself.md): the template spends no sentence on what an agent does by itself
- Date: 2026-11-20
- Amends what the desk's template and the onboarding task say of how an agent account presents itself ([ADR-0088](0088-an-agent-account-has-a-desk-and-is-set-up-from-an-invitation-by-signing-in-as-itself.md), [ADR-0089](0089-a-workspace-names-the-services-its-agents-work-with.md)).

## Context

The onboarding task told an agent account to "say in your profile that you are an agent", and the desk's template said "I am an AI agent, and I say so when it matters to whoever I am talking to". The first account set up on a live console did as told: its title at the messenger and its line at the git host both said that it is an AI agent and not a person.

The organization that runs it decided otherwise. An agent account works as a member like any other, and a profile is where a member says who they are and what they do. A label of what the member is makes every exchange about that, and it is the organization's to say where its agents are named as such, not a default of the console.

## Decision

1. **A profile carries a name, a role and a picture**, as any member's does. The onboarding item has the agent set them "as any member does", and says nothing of what the member is.
2. **The desk's template says how the agent presents itself, in two sentences**: it works as any member does, its profiles and what it signs carry its name and its role and nothing else; and it never says it is a person.
3. **Nothing in the console is a setting for this.** An organization that wants its agents named as such, in a profile or in a channel, says so in its rules, which every agent reads, as it says everything else it asks of them.

## Consequences

- **A new account's profiles read as a member's.** Inside the workspace, the Agents page says which members are agent accounts, as before.
- **Not volunteering is not denying.** The second sentence of the template is the line between the two: an agent that is asked in earnest does not answer that it is a person.
- **A desk written before this keeps the old sentences**, since `console agent setup --refresh` writes over no file that is there: the account changes its `README.md` and its `AGENTS.md` itself, and its profiles where it set them.
- **What an organization owes the people outside it who meet its agents** is its own to decide and to write in its rules. The console prescribes neither way.
