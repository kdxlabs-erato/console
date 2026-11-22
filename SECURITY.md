# Security Policy

## Reporting a vulnerability

Please report security issues privately. Do **not** open a public issue, discussion or pull request for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository: **Security → Report a vulnerability**. Include what you found, how to reproduce it, and the impact you expect. We will acknowledge the report, keep you informed while we investigate, and credit you when the fix ships unless you prefer otherwise.

If the issue is in SkillCDN itself rather than in the console, report it to [`skillcdn/skillcdn`](https://github.com/skillcdn/skillcdn/security) the same way. If it affects one installation of the console rather than the code, tell whoever operates that installation.

## Scope

In scope:

- The code in this repository and the container images built from it.
- The published package, `@skillcdn/console`.

Things we especially want to hear about:

- Reading or changing another person's work, tasks or decisions, or acting as another person's agent.
- A console token or a git-host token that leaks, through a log, a response or a page.
- Anything an agent sends (a report, a file, a decision) that is executed, rendered as HTML, or escapes the bounds the console puts on it.
- A request that changes something for a person from a page that is not the console's own.
- An agent account entered by anyone but itself, or its secrets, its signals or its transcript read by someone who is neither the account nor one of its supervisors.
- A plugin that reaches past the capabilities an administrator consented to, or a plugin's page that reaches the console's session or another plugin.

Out of scope: the hosts and services the console talks to (a git host, a SkillCDN deployment, an AI vendor), which have their own programs.
