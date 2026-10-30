# Spec Delta

## MODIFIED Requirements

### Requirement: Credential and administration routes
The credential and administration routes SHALL accept a session or an `admin` token and SHALL refuse `full`, `read` and `agent` tokens with a 403 `insufficient_scope` error before changing anything. They change the second factor, passkeys, tokens, app passwords, linked identities, the own password, invitations, accounts, two-factor policy and resets, single sign-on, the encryption key record, settings that hold secrets, or the owner's security settings: whether webhooks may reach private networks, the map providers, whether AI assistants may connect and make changes (MCP), and audit log retention and address logging. Sessions keep each route's step-up rule.

#### Scenario: Full token on a credential route
- **WHEN** a `full` token is presented on `DELETE /api/v1/mfa/totp`, `POST /api/v1/tokens`, `POST /api/v1/users/{id}/password-reset` or `PUT /api/v1/settings/oidc`
- **THEN** the response is a 403 `insufficient_scope` error naming the admin scope and nothing changes

#### Scenario: Admin token on a credential route
- **WHEN** an `admin` token is presented on the same routes on an account with a second factor
- **THEN** the request is processed without a re-authentication challenge

#### Scenario: Full token elsewhere
- **WHEN** a `full` token creates a task, reads `GET /api/v1/users` or revokes another token
- **THEN** the request is processed as before

#### Scenario: Secret settings
- **WHEN** a `full` token reads or changes the outgoing-email settings, or changes the backup or assistant settings
- **THEN** the response is a 403 `insufficient_scope` error, while reading the other settings and lists, revoking tokens and app passwords and forgetting remembered browsers keep working with it

#### Scenario: Security settings
- **WHEN** the owner's `full` token changes `PUT /api/v1/settings/webhooks`, `PUT /api/v1/settings/maps`, `PUT /api/v1/settings/mcp` or `PUT /api/v1/settings/audit`
- **THEN** the response is a 403 `insufficient_scope` error and the setting is unchanged; the owner's session or `admin` token changes it as before, and reading these settings still works with a `full` token

#### Scenario: Whole-server archive
- **WHEN** the owner of a hosted tenant downloads `GET /api/v1/export/archive` with a `full` token, an `admin` token, or a recently confirmed session
- **THEN** the `full` token gets a 403 `insufficient_scope` error and the other two get the archive, because it holds every account's credentials

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches a credential route
- **THEN** the response is a 401 `unauthorized` error
