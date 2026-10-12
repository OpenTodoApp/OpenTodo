# Spec Delta

## MODIFIED Requirements

### Requirement: First-run owner setup
A server with no accounts SHALL let the first visitor create an account, and that account SHALL receive the owner role. The setup state SHALL be discoverable without authentication so the client can show the setup screen. When the operator configured a setup token, creating the first account SHALL require that token; the token SHALL have no effect once an owner exists. Setup creates no ops, so offline behaviour and convergence are unaffected.

#### Scenario: Fresh server reports setup required
- **WHEN** a client asks for the authentication status of a server with zero accounts
- **THEN** the response states that setup is required and that sign-up is currently allowed

#### Scenario: First account becomes owner
- **WHEN** the first account is created with a valid email and password
- **THEN** the account has the role `owner`, a session is started for it, and the server no longer reports setup required

#### Scenario: Setup token required
- **WHEN** `OPENTODO_SETUP_TOKEN` is set and a client asks for the authentication status of a server with zero accounts
- **THEN** the response states that setup is required and that a setup token is required

#### Scenario: Wrong or missing setup token
- **WHEN** `OPENTODO_SETUP_TOKEN` is set, no account exists, and someone registers without the token or with a different one
- **THEN** the request is refused with a `setup_token_invalid` error, no account is created, and the attempt counts against the registration rate limit

#### Scenario: Correct setup token
- **WHEN** `OPENTODO_SETUP_TOKEN` is set, no account exists, and someone registers with a valid email, password and the configured token
- **THEN** the account has the role `owner` and a session is started for it

#### Scenario: Token ignored after setup
- **WHEN** an owner exists and someone registers with or without the setup token
- **THEN** the sign-up policy and invitations decide, exactly as without a token
