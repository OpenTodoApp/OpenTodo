# Spec Delta

## ADDED Requirements

### Requirement: Accounts created through a project invite link
`POST /api/v1/auth/register` SHALL accept a `projectInvite` secret. When the link may create accounts, a `member` account SHALL be created, joined to the project with the link's role, and the link spent, all in one transaction, so a link creates at most one account and membership. Bound emails and the creator's project rights are checked as for joining. SSO-only mode SHALL refuse it.

#### Scenario: New person joins in one step
- **WHEN** sign-up is closed and someone registers with a valid project link created by the server owner
- **THEN** a `member` account exists, it is a member of the project with the link's role, a session is started and the link is spent

#### Scenario: Link may not create accounts
- **WHEN** the link's creator is a plain member, sign-up is closed and the owner switch is off
- **THEN** the response is a 403 `project_invite_not_allowed` error, no account is created and the link stays pending

#### Scenario: Concurrent registrations
- **WHEN** two registrations carrying the same project link arrive concurrently
- **THEN** exactly one account is created and joined, and the other request gets a 404 `invitation_invalid` error

#### Scenario: Single sign-on only
- **WHEN** the server requires single sign-on and someone registers with a project link
- **THEN** the response is a 403 `sso_required` error; the person signs in with the provider and then joins

### Requirement: Members can invite new people with project links
The owner SHALL control the setting "Members can invite new people with project links" (off by default) through `PUT /api/v1/settings/project-invites`. A project link may create an account when its creator is the owner or an admin, when open sign-up is on, or when this setting is on. Every signed-in account MAY read it; only the owner changes it, and the change is audited.

#### Scenario: Default off
- **WHEN** a member creates a project link on a server with closed sign-up and default settings
- **THEN** the preview reports `canCreateAccount: false`

#### Scenario: Owner turns it on
- **WHEN** the owner turns the setting on
- **THEN** previews of links created by members report `canCreateAccount: true` and registration through them succeeds

#### Scenario: Not the owner
- **WHEN** an admin or a member sends the PUT, or a request has no credentials
- **THEN** the admin or member gets 403 `forbidden`, the anonymous request 401 `unauthorized`, and the setting is unchanged

#### Scenario: Toggle in Settings
- **WHEN** the owner opens Settings → Administration
- **THEN** a switch "Members can invite new people with project links" shows the current value and changes it
