## MODIFIED Requirements

### Requirement: Changing the email
`POST /api/v1/me/email` with the new address SHALL require a recently confirmed session (the `recent` route policy), SHALL be denied on the demo instance, and SHALL refuse an address another account uses (`email_taken`) or that is not a valid address (`invalid_input`). When outgoing email is configured and the server has a base URL, the server SHALL store the address as pending, send a confirmation link valid for 24 hours to the new address and a notice to the old one, and change the email only when the link is opened by the same account (`POST /api/v1/me/email/confirm` with the link's token, which answers `invalid_token` when it is unknown, used or expired); a newer request replaces a pending one. While the account's address is not verified, the same request with the current address SHALL send that link to it, without a notice, and opening it SHALL mark the address verified; the Profile card SHALL say the address is not confirmed and offer **Send a confirmation link**. A request with the current, verified address is refused (`invalid_input`). Without outgoing email the change SHALL apply at once after the recent confirmation. The sign-in email is what changes; existing sessions stay signed in. An account that signs in only through single sign-on SHALL see its email as managed by the provider and SHALL not be offered the change. Errors: `unauthorized`, `reauth_required`, `email_taken`, `invalid_input`, `rate_limited` (at most 5 requests per hour per account).

#### Scenario: Confirmed by link
- **WHEN** a user on a server with outgoing email changes their email to `new@example.com` after confirming their password
- **THEN** the card shows "Waiting for confirmation: new@example.com", the old address gets a notice, and after the user opens the link the email is `new@example.com` and sign-in with it works

#### Scenario: Confirming the current address
- **WHEN** an owner created with the setup token, whose address was never verified, chooses **Send a confirmation link** on a server with outgoing email and opens the link
- **THEN** the link goes to the current address, no change notice is sent, and afterwards the address is verified and features that need a verified address, such as a routine's Email me step, are offered

#### Scenario: Without outgoing email
- **WHEN** the server has no outgoing email and a user changes their email after confirming their password
- **THEN** the email changes at once and `account.email_changed` is recorded

#### Scenario: Address in use
- **WHEN** the new address belongs to another account
- **THEN** the response is 409 `email_taken` and nothing is sent

#### Scenario: Stale session
- **WHEN** the session was confirmed more than the recent window ago
- **THEN** the response is 403 `reauth_required` and the client asks for the password or a passkey before retrying

#### Scenario: Without a session
- **WHEN** a request without credentials posts a new email address, or opens a confirmation link while signed in as another account
- **THEN** the response is 401 `unauthorized` (or, for the link, 403 `forbidden`) and the email is unchanged
