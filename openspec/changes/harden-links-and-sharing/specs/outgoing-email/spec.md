## ADDED Requirements

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
