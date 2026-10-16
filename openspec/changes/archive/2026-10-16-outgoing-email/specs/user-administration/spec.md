# Spec Delta

## MODIFIED Requirements

### Requirement: Password reset links
`POST /api/v1/users/{id}/password-reset` SHALL create a single-use reset link for an active account. The link expires after 24 hours, or 1 to 72 hours if `expiresInHours` is given. It is returned exactly once and only its hash is stored. A new link SHALL invalidate any unused earlier link for the same account. Issuing a link does not change the password or sessions. With `"send": true` and outgoing email configured, the server mails the link to the account's address instead of returning it.

#### Scenario: Owner issues a reset link
- **WHEN** the owner requests a reset for an active member
- **THEN** the response is 201 with `expiresAt` and a `link` of the form `<origin>/reset/<secret>` that is never returned again

#### Scenario: Reset sent by email
- **WHEN** the owner requests a reset with `"send": true` on a server with outgoing email
- **THEN** the response is 201 with `expiresAt` and `sent: true` and no `link`, the member receives a `password_reset` message, and `password.reset_issued` and `email.sent` are recorded

#### Scenario: Sending fails
- **WHEN** `"send": true` is given and the message cannot be sent, or outgoing email is not configured
- **THEN** the response is 502 `email_failed` or 409 `smtp_disabled` respectively, no link stays pending, and the administrator can request a link to copy instead

#### Scenario: Reset for a deactivated account or an invalid expiry
- **WHEN** the target is deactivated, or `expiresInHours` is outside 1 to 72
- **THEN** the response is a 409 `account_deactivated` error or a 400 `invalid_input` error naming the field respectively

#### Scenario: Anonymous reset request
- **WHEN** a request without credentials sends the password reset request
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Users panel in Settings
The web app SHALL show a Users section in Settings to the owner and admins. It lists accounts with role, status, creation and last sign-in, and shows only the actions the viewer may take on each row. Delete asks for the email. Reset and new-password links are shown once with a copy button. When outgoing email is configured, the reset action SHALL offer "Send reset email" beside "Create reset link". All actions SHALL work by keyboard. The section is online-only: offline, actions are disabled, and no user data is stored in IndexedDB.

#### Scenario: Admin sees member actions only
- **WHEN** an admin opens the Users section
- **THEN** rows for members show deactivate, reset and delete actions, rows for admins and the owner show none, and no role or transfer controls appear

#### Scenario: Send reset email
- **WHEN** outgoing email is configured and the owner chooses "Send reset email" for a member and confirms
- **THEN** the row reports that a message was sent to the member's address and no link is shown; a failure shows the server's error and offers the link instead

#### Scenario: Member sees no Users section
- **WHEN** an account with the role `member` opens Settings
- **THEN** the Users section is absent and the Password section is present

#### Scenario: Offline users panel
- **WHEN** the owner opens the Users section without a network connection
- **THEN** every action is disabled with a message that user administration needs a connection, and nothing about other accounts is read from or written to IndexedDB
