# Spec Delta

## MODIFIED Requirements

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
