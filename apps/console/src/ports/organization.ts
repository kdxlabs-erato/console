import type { ProviderKey } from "@skillcdn/console/api";

/** A member of the organization as the host knows them: by its immutable id of the account, and the login it carries now. */
export interface OrganizationMember {
  readonly accountId: string;
  readonly login: string;
}

/**
 * The organization at the git host that vouches for who is in (ADR-0022): asked at sign-in
 * whether an account is a member, and read whole by the worker on a schedule, which takes out
 * those who left and back in those who returned. An adapter of the host, acting with a
 * credential of the deployment's own; nothing of the host is kept but a token that expires.
 * What the host cannot answer is a `ProviderError`, and changes nothing.
 */
export interface OrganizationDirectory {
  readonly host: ProviderKey;
  /** What the organization is called at the host. */
  readonly name: string;
  /** Whether the account called `login` is a member now. */
  isMember(login: string): Promise<boolean>;
  /**
   * The member of the organization called `login` now, by the host's immutable id of the
   * account (ADR-0126): what an agent account is bound to when it is added, so that its first
   * sign-in is that account's and nobody else's who comes to carry the name. Nothing where the
   * organization has no member called so.
   */
  findMember(login: string): Promise<OrganizationMember | undefined>;
  /** Everyone of the organization. */
  listMembers(): Promise<readonly OrganizationMember[]>;
}
