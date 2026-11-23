# Spec Delta

## MODIFIED Requirements

### Requirement: Sign-in creates an API token
`ot login <server-url>` SHALL prompt for email and password (never echoing the password), obtain a session (completing the two-factor challenge with a code or a recovery code when the account has one), create an API token named `cli@<hostname>`, discard the session and store only the token in the selected profile. `ot auth set-token` SHALL store a token obtained elsewhere, `ot auth status` SHALL show the server, the signed-in account and the token name, and `ot auth logout` SHALL revoke the stored token on the server and remove it locally.

#### Scenario: Successful login
- **WHEN** valid credentials are entered
- **THEN** a token named `cli@<hostname>` appears in the account's token list and `ot auth status` reports the account email

#### Scenario: Wrong password
- **WHEN** invalid credentials are entered
- **THEN** the command exits with code 3, prints the server's error message and stores nothing

#### Scenario: Revoked token
- **WHEN** the stored token has been revoked and any command is run
- **THEN** the command exits with code 3 and suggests `ot login`

#### Scenario: Two-factor authentication
- **WHEN** the account has two-factor authentication and the password is right
- **THEN** `ot login` asks for the authenticator code or a recovery code, completes the challenge with it, and creates and stores the token as for any other login

#### Scenario: Wrong two-factor code
- **WHEN** the code entered at the two-factor prompt is wrong
- **THEN** the command exits with code 3, prints the server's error message and stores nothing
