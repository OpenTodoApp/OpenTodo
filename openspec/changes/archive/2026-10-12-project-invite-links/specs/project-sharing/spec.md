# Spec Delta

## ADDED Requirements

### Requirement: Project invite link creation
The project's owner or an admin SHALL create a single-use link through `POST /api/v1/projects/{id}/invites` with role `viewer` or `editor` (`admin` only for the owner), an optional email and an expiry of 1–720 hours (default 168). The secret SHALL be returned once and stored only as a hash. Links are server-side data, never ops: they never sync and need a connection.

#### Scenario: Owner creates a link
- **WHEN** the owner posts `{"role":"editor"}` to the project's invites route
- **THEN** the response is 201 with the link's `id`, `role`, `expiresAt` and a `link` ending in `/invite/p/<secret>` that is never returned again

#### Scenario: Admin cannot grant admin
- **WHEN** a project admin creates a link with role `admin`
- **THEN** the response is a 403 `forbidden` error and no link exists

#### Scenario: Viewer, editor or stranger
- **WHEN** a viewer or editor of the project posts to the invites route, or a non-member does
- **THEN** the viewer or editor gets 403 `forbidden`, the non-member 404 `not_found`, and no link is created

#### Scenario: Anonymous or limited token
- **WHEN** a request without credentials, or with a `read` or `agent` API token, posts to the invites route
- **THEN** the response is 401 `unauthorized` or 403 `insufficient_scope` and no link is created

#### Scenario: Invalid input
- **WHEN** the body has an unknown role, `expiresInHours` outside 1–720 or an invalid `email`
- **THEN** the response is a 400 `invalid_input` error naming the field

### Requirement: Project invite link list and revocation
The project's owner and admins SHALL list its pending links through `GET /api/v1/projects/{id}/invites` (role, bound email, expiry, creator; never a secret) and revoke one through `DELETE /api/v1/projects/{id}/invites/{inviteId}`. Revocation takes effect on the server at once; no device holds links, so nothing has to converge.

#### Scenario: List pending links
- **WHEN** an admin lists the links after one was accepted and one revoked
- **THEN** only the still pending links are listed, each with role, email, expiry and creator name, and none carries a secret

#### Scenario: Revoke a link
- **WHEN** the owner deletes a pending link and someone opens it afterwards
- **THEN** the delete returned 204 and the preview answers 404 `invitation_invalid`

#### Scenario: Revoke refused
- **WHEN** an editor sends the delete, or the link was already accepted
- **THEN** the editor gets 403 `forbidden`, the accepted link answers 409 `invitation_spent`, and nothing changes

#### Scenario: Anonymous list
- **WHEN** a request without credentials lists or revokes links
- **THEN** the response is 401 `unauthorized`

### Requirement: Project invite link preview
`GET /api/v1/project-invites/{token}` SHALL need no authentication and SHALL return the inviter's name, the project name, the role, the bound email and the expiry, plus whether the link may create an account. It SHALL return no ids. Unknown, expired, revoked, used links, deleted projects and creators who lost the right SHALL all answer the same 404.

#### Scenario: Valid link
- **WHEN** an anonymous client previews a pending link
- **THEN** the response is 200 with `inviterName`, `projectName`, `role`, `email`, `expiresAt` and `canCreateAccount`

#### Scenario: Invalid link
- **WHEN** the link is unknown, expired, revoked, used, its project was deleted or its creator is no longer an owner or admin of the project
- **THEN** the response is a 404 `invitation_invalid` error with the same shape in every case

### Requirement: Joining a project with a link
A signed-in account SHALL join through `POST /api/v1/project-invites/{token}/accept` and become a member with the link's role. A bound email MUST match the account's case-insensitively. The creator's right to grant the role SHALL be checked at that moment. Membership and spending the link commit together; devices learn the membership on their next sync, as for any added member.

#### Scenario: Join while signed in
- **WHEN** Bob, signed in, accepts a pending editor link to Alice's project
- **THEN** the response is 200, Bob is an editor, the link is spent, and Bob's and Alice's devices are woken to sync and receive the project

#### Scenario: Already a member
- **WHEN** an existing member of the project accepts a link to it
- **THEN** the response is a 409 `already_member` error and the link stays pending

#### Scenario: Email binding
- **WHEN** a link bound to `a@example.com` is accepted by an account with another email
- **THEN** the response is a 403 `invitation_email_mismatch` error and the link stays pending

#### Scenario: Creator lost the right
- **WHEN** the admin who created a link was removed from the project or made an editor before the link is accepted
- **THEN** the response is a 404 `invitation_invalid` error and nobody is added

#### Scenario: Two acceptances race
- **WHEN** two accounts accept the same link concurrently
- **THEN** exactly one becomes a member and the other gets a 404 `invitation_invalid` error

#### Scenario: Anonymous accept
- **WHEN** a request without credentials posts to the accept route
- **THEN** the response is 401 `unauthorized`

### Requirement: Invite links in the share dialog
The share dialog SHALL offer the owner and admins an "Invite with a link" section: role, optional email and expiry, a created link shown once with a copy button and a notice, whether it can create accounts, and the pending links with revoke. Every action SHALL work with the keyboard. Offline, the controls SHALL be disabled with an explanation.

#### Scenario: Create and copy
- **WHEN** the owner creates a link in the share dialog
- **THEN** the link is shown with a copy button and a notice that it will not be shown again, and it appears in the pending list

#### Scenario: Viewer sees no section
- **WHEN** a viewer or editor opens the member list
- **THEN** no "Invite with a link" section is shown

#### Scenario: Offline
- **WHEN** the dialog is opened without a network connection
- **THEN** creating and revoking are disabled and a message says invite links need a connection

### Requirement: Project invite acceptance screen
Opening `/invite/p/<token>` SHALL show the inviter, project, role and expiry. A signed-in person SHALL see "Join". Without a session the screen SHALL offer sign-in, after which it returns to the link, and account creation only when the preview allows it, else a note that an account is needed first.

#### Scenario: Signed-in join
- **WHEN** a signed-in person opens a valid link and selects Join
- **THEN** they become a member and the app opens the project

#### Scenario: New person may create an account
- **WHEN** an anonymous visitor opens a link whose preview allows account creation
- **THEN** the screen offers both sign-in and a registration form

#### Scenario: Account needed first
- **WHEN** an anonymous visitor opens a link whose preview does not allow account creation
- **THEN** the screen says they need an account on this server first and offers only sign-in

#### Scenario: Invalid or offline
- **WHEN** the preview answers `invitation_invalid`, or the device is offline
- **THEN** the screen says the link is no longer valid, or waits and retries when the network returns

### Requirement: Project invite link limits
Link creation SHALL be limited to 20 per creator per hour. Preview and acceptance SHALL be rate limited per client address in the sign-in window. Secrets SHALL never be logged or audited.

#### Scenario: Mass creation
- **WHEN** an account creates a 21st link within one hour
- **THEN** the response is a 429 `rate_limited` error

#### Scenario: Guessing links
- **WHEN** one address exceeds 10 previews, acceptances or sign-in attempts in a minute
- **THEN** further attempts in that window answer 429 `rate_limited`
