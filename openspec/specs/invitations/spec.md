# invitations Specification

## Purpose
Lets the owner admit new members one at a time through single-use, expiring invitation links while the server stays closed to public sign-up, and defines how invitations are created, previewed, accepted, listed, revoked and rate limited, and when a project invite link may create an account.

## Requirements

### Requirement: Invitation creation
An account with the owner or admin role SHALL be able to create an invitation through `POST /api/v1/invitations`, optionally bound to one email address, with an expiry between one hour and 30 days (default seven days). The response SHALL contain the invitation secret exactly once; the server SHALL store only a hash of it. Invitations SHALL be server-side account data: they are not written to the operation log, never sync to devices, and creating one requires a network connection.

#### Scenario: Owner creates an open invitation
- **WHEN** the owner posts `{}` to `/api/v1/invitations`
- **THEN** the response is 201 with the invitation's `id`, `expiresAt`, status `pending`, and a `link` containing the secret that is never returned again

#### Scenario: Admin creates an invitation
- **WHEN** an account with the role `admin` posts `{}` to `/api/v1/invitations`
- **THEN** the response is 201 and the invitation admits an account with the role `member`

#### Scenario: Member is refused
- **WHEN** a signed-in account with the role `member` posts to `/api/v1/invitations`
- **THEN** the response is a 403 `forbidden` error and no invitation is created

#### Scenario: Anonymous request
- **WHEN** a request without credentials posts to `/api/v1/invitations`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Invalid expiry or email
- **WHEN** the body carries `expiresInHours` outside 1–720 or an `email` that is not a valid address
- **THEN** the response is a 400 `invalid_input` error naming the field

### Requirement: Invitation list and revocation
The owner and admins SHALL be able to list all invitations through `GET /api/v1/invitations` with status (`pending`, `accepted`, `expired`, `revoked`), creator, bound email, timestamps and the accepting account, and to revoke a pending one through `DELETE /api/v1/invitations/{id}`. Secrets SHALL never appear in the list. Revocation takes effect on the server immediately; the server is the only replica, so no convergence is involved.

#### Scenario: List shows status
- **WHEN** the owner lists invitations after one was accepted and another expired
- **THEN** each entry carries the matching status, the accepted one names the account that used it, and no entry contains a secret or link

#### Scenario: Revoke a pending invitation
- **WHEN** the owner or an admin deletes a pending invitation and someone later opens its link
- **THEN** the delete returned 204 and the link is refused with an `invitation_invalid` error

#### Scenario: Revoke what is not pending or not yours
- **WHEN** the owner deletes an invitation that is already accepted, or a member sends the delete
- **THEN** the response is 409 `invitation_spent` for the accepted one and 403 `forbidden` for the member, and nothing changes

### Requirement: Invitation preview
`GET /api/v1/invitations/{token}` SHALL require no authentication and SHALL return the inviter's display name, the bound email if any, and the expiry time for a pending, unexpired invitation, so the client can render the acceptance form. It SHALL never return the invitation id or any account data beyond the inviter's name.

#### Scenario: Valid link is previewed
- **WHEN** an anonymous client requests the preview with a pending token
- **THEN** the response is 200 with `inviterName`, `email` (or null) and `expiresAt`

#### Scenario: Unknown, expired or revoked token
- **WHEN** the token is unknown, expired, revoked or already accepted
- **THEN** the response is a 404 `invitation_invalid` error with the same shape in every case

#### Scenario: Preview while the device is offline
- **WHEN** the invite link is opened with no network
- **THEN** the client shows an offline message and retries when the network returns, without caching the preview

### Requirement: Accepting an invitation
`POST /api/v1/auth/register` SHALL accept an optional `invitation` secret. With a valid pending secret the account SHALL be created with the role `member` even when open sign-up is disabled, and the invitation SHALL be marked accepted in the same transaction so that it can create at most one account. A bound email MUST match the registered email case-insensitively. The acceptance SHALL start a session like any registration.

#### Scenario: Accept while sign-up is closed
- **WHEN** sign-up is closed and someone registers with a valid invitation, a free email and a valid password
- **THEN** a `member` account is created, a session cookie is set, and the invitation's status becomes `accepted`

#### Scenario: Second use of the same secret
- **WHEN** two registrations carrying the same secret arrive, concurrently or in sequence
- **THEN** exactly one account is created and the other request is refused with a 404 `invitation_invalid` error

#### Scenario: Email does not match the binding
- **WHEN** the invitation is bound to `a@example.com` and the registration uses `b@example.com`
- **THEN** the response is a 403 `invitation_email_mismatch` error and the invitation stays pending

#### Scenario: Email already has an account
- **WHEN** the registered email already exists
- **THEN** the response is an `email_taken` error and the invitation stays pending

### Requirement: Invitation management in Settings
The web app SHALL show the owner and admins a Members section in Settings that lists invitations with status, creates an invitation with an optional email and expiry, copies the link to the clipboard, and revokes pending ones. Every action SHALL be reachable with the keyboard. While offline the section SHALL show the last fetched list read-only with the actions disabled and an explanation; the server list is authoritative when the network returns.

#### Scenario: Create and copy a link
- **WHEN** the owner creates an invitation in Settings
- **THEN** the link is shown once with a copy button, and a notice says it will not be shown again

#### Scenario: Member sees no Members section
- **WHEN** an account with the role `member` opens Settings
- **THEN** the Members section is absent

#### Scenario: Admin sees the Members section
- **WHEN** an account with the role `admin` opens Settings
- **THEN** the Members section is present with the same create, copy and revoke actions as for the owner

#### Scenario: Offline settings
- **WHEN** the owner opens the Members section without a network connection
- **THEN** the create and revoke controls are disabled and a message explains that invitations need a connection

### Requirement: Acceptance screen
Opening `/invite/<token>` in the web app SHALL show the preview (inviter, bound email, expiry) and a registration form whose email field is pre-filled and locked when the invitation is bound. On success the app SHALL proceed to the signed-in shell. When a user is already signed in, the screen SHALL offer to sign out before accepting rather than attaching the invitation to the current account.

#### Scenario: Bound invitation locks the email
- **WHEN** the invitation is bound to an email
- **THEN** the email field shows that address and cannot be edited

#### Scenario: Invalid link
- **WHEN** the preview returns `invitation_invalid`
- **THEN** the screen explains that the link is no longer valid and links to sign-in, without a form

### Requirement: Invitation rate limits
Invitation preview and acceptance SHALL be rate limited per client address under the same window as sign-in. Invitation creation SHALL be limited per account to 20 per hour.

#### Scenario: Guessing tokens
- **WHEN** a client address exceeds 10 preview or acceptance attempts in one minute
- **THEN** further attempts in that window are refused with a 429 `rate_limited` error

#### Scenario: Mass creation
- **WHEN** the owner creates more than 20 invitations within one hour
- **THEN** the 21st request is refused with a 429 `rate_limited` error

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
