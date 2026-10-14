# Spec Delta

## MODIFIED Requirements

### Requirement: Invitation creation
An account with the owner or admin role SHALL be able to create an invitation through `POST /api/v1/invitations`, optionally bound to one email address, with an expiry between one hour and 30 days (default seven days). The response SHALL contain the invitation secret exactly once; the server SHALL store only a hash of it. With `"send": true`, an email and outgoing email configured, the server SHALL also mail the link to that address. Invitations SHALL be server-side account data: they are not written to the operation log, never sync to devices, and creating one requires a network connection.

#### Scenario: Owner creates an open invitation
- **WHEN** the owner posts `{}` to `/api/v1/invitations`
- **THEN** the response is 201 with the invitation's `id`, `expiresAt`, status `pending`, and a `link` containing the secret that is never returned again

#### Scenario: Admin creates an invitation
- **WHEN** an account with the role `admin` posts `{}` to `/api/v1/invitations`
- **THEN** the response is 201 and the invitation admits an account with the role `member`

#### Scenario: Invitation sent by email
- **WHEN** an admin posts `{"email":"bob@example.com","send":true}` on a server with outgoing email
- **THEN** the response is 201 with the link and `sent: true`, bob@example.com receives an `invitation` message naming the admin, and `invitation.created` and `email.sent` are recorded

#### Scenario: Send without an email, unconfigured or failing
- **WHEN** `send` is true without an `email`, or outgoing email is not configured, or the message cannot be sent
- **THEN** the response is 400 `invalid_input`, 409 `smtp_disabled` or 502 `email_failed` respectively and no pending invitation remains

#### Scenario: Member is refused
- **WHEN** a signed-in account with the role `member` posts to `/api/v1/invitations`
- **THEN** the response is a 403 `forbidden` error and no invitation is created

#### Scenario: Anonymous request
- **WHEN** a request without credentials posts to `/api/v1/invitations`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Invalid expiry or email
- **WHEN** the body carries `expiresInHours` outside 1–720 or an `email` that is not a valid address
- **THEN** the response is a 400 `invalid_input` error naming the field

### Requirement: Invitation management in Settings
The web app SHALL show the owner and admins a Members section in Settings that lists invitations with status, creates an invitation with an optional email and expiry, copies the link to the clipboard, and revokes pending ones. When outgoing email is configured and an email is given, the form SHALL offer "Send by email", on by default, and report that the message was sent. Every action SHALL be reachable with the keyboard. While offline the section SHALL show the last fetched list read-only with the actions disabled and an explanation; the server list is authoritative when the network returns.

#### Scenario: Create and copy a link
- **WHEN** the owner creates an invitation in Settings
- **THEN** the link is shown once with a copy button, and a notice says it will not be shown again

#### Scenario: Create and send
- **WHEN** outgoing email is configured and the owner creates an invitation for bob@example.com with "Send by email" on
- **THEN** the panel says the invitation was sent to bob@example.com and still shows the link once with its copy button

#### Scenario: No outgoing email
- **WHEN** the authentication status reports `outgoingEmail.enabled: false`
- **THEN** the form shows no "Send by email" option

#### Scenario: Member sees no Members section
- **WHEN** an account with the role `member` opens Settings
- **THEN** the Members section is absent

#### Scenario: Admin sees the Members section
- **WHEN** an account with the role `admin` opens Settings
- **THEN** the Members section is present with the same create, copy and revoke actions as for the owner

#### Scenario: Offline settings
- **WHEN** the owner opens the Members section without a network connection
- **THEN** the create and revoke controls are disabled and a message explains that invitations need a connection
