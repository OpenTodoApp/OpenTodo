# Spec Delta

## MODIFIED Requirements

### Requirement: Per-user secret inbox address
When enabled by the operator, each user SHALL be able to have an inbox address formed from the operator's address pattern and a per-user random secret of at least 128 bits. The address SHALL be created only by an explicit change: turning capture on or asking for a new address. Reading the settings SHALL NOT create or enable an inbox. The user SHALL be able to see it, rotate it (which invalidates the old one immediately), switch capture off and on, and set an optional sender allowlist, all from Settings. These settings SHALL be stored per account on the server and SHALL not be part of the operation log; they need a connection and are read-only offline.

#### Scenario: First visit shows the switch
- **WHEN** a user opens the email section of Settings for the first time on an enabled server
- **THEN** the section shows capture as off with a switch and no address, and no inbox exists for the account

#### Scenario: First visit creates the address
- **WHEN** a user opens the email section of Settings for the first time on an enabled server and turns capture on
- **THEN** an address such as `todo+k3f9…@example.com` is created and shown with copy and rotate controls

#### Scenario: Rotate
- **WHEN** the user rotates the address and a message is later sent to the old address
- **THEN** the message is discarded and no task is created

### Requirement: Email inbox API
The server SHALL expose `GET /api/v1/email-inbox` (address, enabled, allowlist, operator status; `address` is null and `enabled` false while the account has no inbox), `PATCH /api/v1/email-inbox` (`enabled`, `allowlist`; creates the inbox when there is none) and `POST /api/v1/email-inbox/rotate`, all acting only on the caller's account. Because the address can create tasks, these routes SHALL require a session or a `full` (or `admin`) API token and SHALL refuse `read` and `agent` tokens with a 403 `insufficient_scope` error, also on `GET`. `GET` SHALL have no side effects. Validation errors SHALL use the standard error envelope.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches any `/api/v1/email-inbox` route
- **THEN** the response is 401 `unauthorized`

#### Scenario: Limited token
- **WHEN** a `read` or `agent` token calls any `/api/v1/email-inbox` route
- **THEN** the response is 403 `insufficient_scope`, no inbox is created and no address is returned

#### Scenario: Reading creates nothing
- **WHEN** a session or a `full` token calls `GET /api/v1/email-inbox` for an account without an inbox
- **THEN** the response has `address: null` and `enabled: false`, and the account still has no inbox

#### Scenario: Invalid allowlist
- **WHEN** a PATCH sets `allowlist` to a value that is not an array of email addresses
- **THEN** the response is 400 `invalid_input` and the stored settings are unchanged

#### Scenario: Not enabled by operator
- **WHEN** a user calls `POST /api/v1/email-inbox/rotate` on a server without email configuration
- **THEN** the response is 409 `email_disabled`
