# outgoing-email Specification

## Purpose
The optional SMTP transport of a server: how the owner or operator configures it, which messages the server can send and in which languages, the sending limits, failure and audit behaviour, and the guarantees that nothing is sent without configuration and that no task content is mailed to an account with end-to-end encryption.

## Requirements

### Requirement: Outgoing email configuration
The owner SHALL read and change the SMTP configuration through `GET` and `PUT /api/v1/settings/smtp`: host, port, security (`tls`, `starttls` or `none`), optional username and password, and the From address with an optional display name. Each field set through `OPENTODO_SMTP_*` SHALL override the stored value and be reported as managed by the environment. The configuration is server data: it is never synced and needs a connection.

#### Scenario: Owner saves a configuration
- **WHEN** the owner, in a fresh session, puts `{"host":"smtp.example.com","port":587,"security":"starttls","username":"todo","password":"…","from":"OpenTodo <todo@example.com>"}`
- **THEN** the response is 200 with the stored values, `passwordSet: true` and no password, `configured: true`, and a `settings.changed` audit event per changed field whose password entry records only that it was set

#### Scenario: Field managed by the environment
- **WHEN** `OPENTODO_SMTP_HOST` is set and the owner puts a different host
- **THEN** the response is a 409 `managed_by_env` error naming the variable and nothing is stored, and `GET` reports `managedBy.host: "env"`

#### Scenario: Invalid value
- **WHEN** the body has a port outside 1–65535, an unknown security value, a From that is not one valid address, or a username without a password
- **THEN** the response is a 400 `invalid_input` error naming the field and nothing is stored

#### Scenario: Admin, member or anonymous
- **WHEN** an admin or member session, any API token, or a request without credentials reads or writes the configuration
- **THEN** the response is 403 `forbidden` for signed-in non-owners and 401 `unauthorized` without credentials, and no field of the configuration is revealed

### Requirement: Password kept out of the database
The SMTP password SHALL be stored only in the secrets directory under the data directory, never in the database, a backup snapshot, a log line or an API response. `GET /api/v1/settings/smtp` SHALL report only whether it is set.

#### Scenario: Backup excludes the password
- **WHEN** a backup archive is created after the owner saved an SMTP password
- **THEN** the archive contains the SMTP host and From address in the settings table and no password

#### Scenario: Password removed
- **WHEN** the owner puts `"password": ""`
- **THEN** the stored password is deleted, `passwordSet` is false, and a `settings.changed` event records that it was unset

### Requirement: Nothing is sent without configuration
With no host and From address configured, the server SHALL send no message, SHALL open no outbound connection for email, SHALL answer every route whose only purpose is to send with 404 `smtp_disabled`, SHALL refuse `send` flags on other routes with 409 `smtp_disabled`, and SHALL report `outgoingEmail.enabled: false` so clients hide every email action.

#### Scenario: Fresh server
- **WHEN** a server starts with no `OPENTODO_SMTP_*` variable and no stored configuration
- **THEN** the authentication status reports `outgoingEmail: {"enabled": false}`, the sign-in screen has no "Forgot password?" link, and registration, invitations and resets behave exactly as before this change

#### Scenario: Send flag while unconfigured
- **WHEN** the owner creates an invitation with `"send": true` on an unconfigured server
- **THEN** the response is a 409 `smtp_disabled` error and no invitation is created

### Requirement: Transport security
The server SHALL connect with implicit TLS for security `tls`, SHALL require the STARTTLS extension and upgrade before any authentication for `starttls`, and SHALL refuse to send credentials over a connection that is not encrypted. Security `none` SHALL be accepted only without a username, for an unauthenticated relay. The From address SHALL be used as the envelope sender.

#### Scenario: STARTTLS not offered
- **WHEN** security is `starttls` and the server does not advertise STARTTLS
- **THEN** no credentials are sent, the message is not sent, and the outcome names the missing STARTTLS

#### Scenario: Plaintext relay without credentials
- **WHEN** security is `none`, no username is set and the host is a relay on the local network
- **THEN** the message is sent without TLS and the Outgoing email panel shows a visible notice that the connection is not encrypted

#### Scenario: Plaintext with credentials refused
- **WHEN** the owner puts security `none` together with a username
- **THEN** the response is a 400 `invalid_input` error explaining that credentials need `tls` or `starttls`

### Requirement: Test message
`POST /api/v1/settings/smtp/test` SHALL send one test message to the owner's own address with the saved configuration and answer 200 with outcome `sent`, or `failed` with the stage (`connect`, `tls`, `auth`, `send`) and the server's reply, within a bounded time. It SHALL require the owner's session or full-access token, SHALL be limited to 5 per 10 minutes, and SHALL answer 404 `smtp_disabled` when nothing is configured.

#### Scenario: Test delivered
- **WHEN** the owner posts to the test route with a working configuration
- **THEN** the response is 200 with outcome `sent`, the owner's mailbox receives a message titled as a test from this server, and an `email.sent` event of kind `test` is recorded

#### Scenario: Wrong password
- **WHEN** the SMTP server rejects the credentials
- **THEN** the response is 200 with outcome `failed`, stage `auth` and the server's reply, no message is sent, and an `email.failed` event records the stage as its reason

#### Scenario: Unreachable server
- **WHEN** the host does not answer within the timeout
- **THEN** the response is 200 with outcome `failed` and stage `connect` after at most 15 seconds

#### Scenario: Too many tests, non-owner or anonymous
- **WHEN** the owner sends a sixth test within 10 minutes, an admin posts to the route, or a request carries no credentials
- **THEN** the responses are 429 `rate_limited`, 403 `forbidden` and 401 `unauthorized` respectively, and no message is sent

### Requirement: Message kinds and content
The server SHALL send only these kinds: `verify_signup`, `password_reset`, `invitation`, `project_invite` and `test`. Every message SHALL be plain text (UTF-8), SHALL name the server by its public origin, SHALL carry at most one action link on its own line, SHALL state when the link expires, SHALL carry `Auto-Submitted: auto-generated` and a Message-ID, and SHALL contain no other person's email address and no task, project, label or comment content.

#### Scenario: Password reset message
- **WHEN** a reset message is sent for `/reset/otr_…` expiring in 24 hours
- **THEN** the body says that a password reset was requested for this address at this server, carries the link on its own line, says it expires in 24 hours and can be ignored if not requested, and has no HTML part

#### Scenario: Invitation message names the inviter
- **WHEN** Alice sends an invitation to bob@example.com
- **THEN** the message says Alice invited bob@example.com to this server, carries the invite link and its expiry, and shows Alice's name but not her email address

#### Scenario: Link secrets never logged
- **WHEN** any message is sent or fails
- **THEN** no log line and no audit event contains the link or its secret

### Requirement: Message language
A message SHALL be written in the first language of the `Accept-Language` header of the request that caused it that the server supports (`en`, `de`, `fr`, `es`, `it`, `pt`), else in English. Subject and body SHALL be translated together; the link and the server origin are not translated. For a verification message the language SHALL be the one captured at registration, so a resend uses the same language.

#### Scenario: German browser
- **WHEN** a visitor whose browser sends `Accept-Language: de-CH, fr;q=0.8` requests a password reset
- **THEN** subject and body are in German and the link is unchanged

#### Scenario: Unsupported language
- **WHEN** the header is `ja` or absent
- **THEN** the message is in English

#### Scenario: Invitation language follows the creator
- **WHEN** an admin whose browser sends `Accept-Language: it` sends an invitation
- **THEN** the invitee receives an Italian message

### Requirement: No task content for encrypted accounts
A message addressed to an account with end-to-end encryption enabled SHALL contain no content field of any entity (titles, descriptions, names, queries, comment bodies), neither as plaintext nor as ciphertext. Any message kind that needs such content SHALL NOT be offered to such accounts. The message kinds of this change carry no content for any account.

#### Scenario: Future content-bearing message
- **WHEN** a later message kind includes task titles and the recipient's account has encryption enabled
- **THEN** the server refuses to build the message and records nothing but the refusal reason, instead of sending placeholders or ciphertext

### Requirement: Sending limits
The server SHALL send at most 5 messages of one kind to one recipient address per hour and at most 100 transactional messages per hour in total. A message refused by a limit SHALL NOT be sent, SHALL be recorded as `email.failed` with reason `rate_limited`, and SHALL make an authenticated request fail with 429 `rate_limited` while anonymous requests keep their neutral answer.

#### Scenario: Sixth reset for one address
- **WHEN** six password reset requests for the same address arrive within an hour
- **THEN** five messages are sent, the sixth is not, every request is answered 202, and the sixth is recorded as `email.failed` with reason `rate_limited`

#### Scenario: Server-wide cap
- **WHEN** 100 transactional messages were sent in the last hour and an admin sends an invitation by email
- **THEN** the response is 429 `rate_limited`, no invitation is created, and nothing is sent

### Requirement: Failure behaviour
A message SHALL be sent synchronously with a timeout of at most 15 seconds and SHALL NOT be queued or retried automatically. A failure SHALL be logged without the recipient's address, recorded as `email.failed` with the stage as reason, and reported to an authenticated caller as 502 `email_failed`; a flow that answers neutrally keeps its answer. Rolling updates and restarts lose nothing because nothing is queued.

#### Scenario: Relay down while sending an invitation
- **WHEN** the SMTP server refuses the connection while an admin sends an invitation by email
- **THEN** the response is a 502 `email_failed` error, no pending invitation remains, and the admin can retry or create a link to copy

#### Scenario: Relay down during a reset request
- **WHEN** the SMTP server refuses the connection while a visitor requests a password reset
- **THEN** the visitor still gets the neutral 202 answer, no reset link remains pending, and an `email.failed` event records the stage

### Requirement: Availability reported to clients
`GET /api/v1/auth/status` SHALL carry `outgoingEmail: {"enabled": boolean}`, true only when host and From address are configured and the instance is not a demo. Clients SHALL show email actions only when it is true. The flag is public information like the passkey domain.

#### Scenario: Configured server
- **WHEN** the owner saved a working configuration
- **THEN** the next status answer carries `outgoingEmail.enabled: true` and the sign-in screen shows "Forgot password?"

#### Scenario: Demo instance
- **WHEN** the instance runs in demo mode with `OPENTODO_SMTP_*` set
- **THEN** the status reports `outgoingEmail.enabled: false`

### Requirement: Outgoing email panel in Settings
Settings → Administration SHALL show the owner an Outgoing email card that leads with its state (not configured; or host, From address and the last test's outcome), opens the configuration form from a "Configure" action with environment-managed fields read-only and labelled with their variable, offers "Send test email" with the server's outcome, and shows an offline state without a guess. Admins SHALL NOT see the card. Every action SHALL work by keyboard.

#### Scenario: Not configured
- **WHEN** the owner opens Administration on a server without outgoing email
- **THEN** the card says outgoing email is not configured, explains what it enables (password reset, verified sign-up, invitations by email) and offers "Configure"

#### Scenario: Test outcome shown
- **WHEN** the owner runs "Send test email" and the server answers `failed` at stage `auth`
- **THEN** the card shows that authentication failed with the server's reply and keeps the configuration form reachable; it never says a message was sent

#### Scenario: Admin opens Administration
- **WHEN** an admin opens Administration
- **THEN** users and members are shown and no Outgoing email card

#### Scenario: Offline
- **WHEN** the owner opens Administration without a connection
- **THEN** the card says it needs a connection and shows neither a state nor the form

### Requirement: Emailed links come from the base URL
Links that grant access and are sent by email (password reset, sign-up verification, instance and project invitations) SHALL be built only from `OPENTODO_BASE_URL`, never from request headers. Without a base URL these flows SHALL send and create nothing and answer 409 `base_url_required`; links returned to the signed-in caller without `send` keep working. Server-only flows: no synced data, offline use and convergence unaffected.

#### Scenario: Reset requested with a forged host
- **WHEN** `OPENTODO_BASE_URL` is `https://todo.example.com` and an anonymous visitor requests a password reset with `X-Forwarded-Host: evil.example`
- **THEN** the mailed link starts with `https://todo.example.com/reset/`

#### Scenario: No base URL
- **WHEN** outgoing email is configured, `OPENTODO_BASE_URL` is unset, and a visitor requests a password reset or an open sign-up, or an admin sends an invitation or a reset by email
- **THEN** the response is 409 `base_url_required`, no message is sent and no reset, invitation or pending sign-up is left behind

#### Scenario: Copying a link still works
- **WHEN** `OPENTODO_BASE_URL` is unset and an admin creates a reset link without `send`
- **THEN** the response is 201 with a link on the request's own origin

#### Scenario: Unauthenticated administrator route
- **WHEN** `POST /api/v1/users/{id}/password-reset` with `send: true` is requested without a session or token
- **THEN** the server answers 401 and sends nothing

#### Scenario: Visitor sees why
- **WHEN** the "Forgot password?" request is answered 409 `base_url_required`
- **THEN** the screen explains that password resets go through an administrator
