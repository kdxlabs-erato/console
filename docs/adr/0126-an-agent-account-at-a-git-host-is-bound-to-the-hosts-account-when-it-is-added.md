# ADR-0126: An agent account at a git host is bound to the host's account when it is added

- Status: Accepted
- Date: 2026-11-15
- Amends point 3 of [ADR-0084](0084-an-agent-account-is-a-member-of-its-own-with-a-manager-above-it.md), under which the first sign-in with the login an agent account was made with binds the provider's account to it, whoever holds that login; and the consequence of [ADR-0094](0094-the-account-an-agent-signs-in-with-is-named-and-who-makes-it-is-the-organizations-to-say.md) that what the console cannot see, whether the account is there at its provider, it does not claim. Builds on [ADR-0022](0022-who-is-in-is-the-consoles-own-record-and-an-administrator-keeps-it.md) (who is in, and the organization at the git host that vouches for its members). The contract is in [specs/rest.md](../specs/rest.md).

## Context

An administrator adds an agent account by naming the account it signs in with. The console wrote that login down and nothing else, and the first account to sign in under it became the agent account, with whatever its supervisors had put in its secret store for it.

At a Workspace that is safe: only the domain's administrator makes an address there. At a git host a login is whoever's registers it. An account added under a login that nobody held yet, or that its holder gave up before the first sign-in, went to whoever registered the name and signed in first. The pages, the command and the guide have said since 0.5.0 that the account has to be the organization's before it is added here. That was a sentence, and nothing held it.

The console already asks the host one thing with a credential of the deployment's own: who is a member of the organization the operator names, each with the host's immutable id of the account (ADR-0022). That id is what a member is known by once they have signed in, so that a renamed account stays the same person.

## Decision

1. **The organization is asked which account the login is, when the account is added.** Where the deployment names the organization at the host, `POST /api/v1/agents` asks it for the member called by that login (`OrganizationDirectory.findMember`: whether the login is a member, then which account carries it) and binds the member's row to the host's id of that account at once. The row is found by that id at every sign-in, the first as any later one.
2. **That account alone is let in as the agent account.** It is let in under whatever name it carries by then: an organization's account that was renamed is still the account. Whoever else comes to carry the name is not let in by it: the account's listing admits the account it is bound to, and while the agent account waits for its first sign-in, a sign-in under its login by another account of the host is refused whatever else would admit it, in the words a refused sign-in has, and writes nothing.
3. **What the host did not say is not confirmed, and the organization's word at the sign-in decides.** Where the organization has no member called so, or cannot be asked, the account is added all the same, bound to no account. Its first sign-in then binds it only where the organization says, at that very sign-in, that the login is a member. A sign-in under the login that the organization does not vouch for, or while it cannot be asked, is refused and writes nothing; it is tried again once the account is a member.
4. **Where no organization is read, nothing can say, and the console says so.** A deployment that signs people in at a git host and names no organization has nobody to ask. There the account is bound to none, and until it has signed in the console lets in whoever holds the login, as before this decision and as a listing does.
5. **The answer says which it is.** An agent account answers `firstSignIn` while it waits for that sign-in at a git host: `account` (the host said, point 2), `member` (not confirmed, point 3) or `login` (not confirmed, point 4). The account's page says it in its first step, with a mark where it is not confirmed; `console agent new` says it in its answer and the account's line in a word.
6. **A member is found by the account they are.** A login that is, by the host's id, an account some member already signed in with, under whatever name the console last saw, is that member: `agent.login_is_member`, or the member made the account where `convert` asks ([ADR-0104](0104-a-member-is-made-an-agent-account-only-where-that-is-asked-for.md)). No account of the host is ever two rows.
7. **A provider that makes its own addresses is as it was.** Nothing is asked and nothing is held of an account that signs in at a Workspace.

## Consequences

- **No migration.** The column that binds a member to the host's account was there, null until the first sign-in. It is now written when the account is added, where the host says. Whether anyone has signed in is read from `last_login_at`, which is what `invited` now says.
- **Accounts added before this stand as they are.** One that has signed in is bound, and nothing changes for it. One that has not is bound to no account, and its first sign-in goes by point 3 or point 4. Under point 3 that is stricter than before: such an account signs in once it is a member of the organization.
- **Under an organization, an agent account's login is a member of it** by its first sign-in. An account outside the organization could be added and signed in with before; it is no longer let in on the name alone.
- **Adding an account asks the host two questions** where an organization is named, and waits for them. A host that does not answer costs the time of its timeout, and the account is added not confirmed.
- **Point 4 leaves the hole where the console has nobody to ask.** It is said on the page and by the command. A deployment that signs people in at a git host closes it by naming its organization.
- **The name's new holder waits.** While an agent account waits bound to an account, someone else who came to carry its login is refused even where the organization has them as a member. They are let in once the account has signed in, which writes its new name, or once the waiting account is deactivated.
- **Rejected:**
  - A column for the expected id beside the login, on the listing or on the member: two places for one fact, and a listing goes with a deactivation.
  - Asking the host for any account called so, a member or not: an account registered under the name before the organization made its own would be confirmed, which is the case this closes.
  - Refusing to add an account the host does not confirm: an organization that adds the account in the console first, and to its organization after, would be stopped for nothing, since point 3 already lets nobody else in.
  - Refusing the first sign-in of every unconfirmed account where no organization is read: no agent account could be used at such a deployment, and the consoles a person runs on their own machine are of that kind.
  - Confirming an account that waits when the organization is next read whole: its first sign-in asks the organization anyway.
