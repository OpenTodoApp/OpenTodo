## MODIFIED Requirements

### Requirement: Restricted features
With demo mode on, requests to sign-up, invitations, user administration, password change or reset including the self-service reset request and sign-up verification, signing out everywhere, API tokens, app passwords, CalDAV, passkeys, two-factor, server settings, backups, webhooks, email to task, import, end-to-end encryption, web push, sharing changes, MCP and the in-app assistant SHALL be refused with 403 `demo_restricted` before authentication. The deny list SHALL refuse exactly the routes whose declared route policy says a demo refuses them. Rate limits SHALL stay.

#### Scenario: Refused while signed in
- **WHEN** the signed-in demo account POSTs to `/api/v1/tokens`
- **THEN** the response is 403 with error code `demo_restricted` and no token exists

#### Scenario: Refused without authentication
- **WHEN** an anonymous client POSTs to `/api/v1/auth/register`
- **THEN** the response is 403 `demo_restricted` and no account is created

#### Scenario: Self-service reset and verification refused
- **WHEN** an anonymous client POSTs to `/api/v1/auth/password-reset` or `/api/v1/auth/verify/{token}`
- **THEN** the response is 403 `demo_restricted`, no message is sent, and the authentication status reports `outgoingEmail.enabled: false`

#### Scenario: Everyday use allowed
- **WHEN** the demo account creates, edits, completes and deletes tasks, syncs or exports
- **THEN** the requests succeed as on any instance

#### Scenario: Assistant refused
- **WHEN** a demo account calls `POST /api/v1/assistant/turn` or `PUT /api/v1/me/assistant`
- **THEN** the response is 403 `demo_restricted`, no provider is contacted, and the app shows that the assistant is not available on the demo

#### Scenario: Demo mode off
- **WHEN** demo mode is off
- **THEN** no request is ever answered with `demo_restricted`
