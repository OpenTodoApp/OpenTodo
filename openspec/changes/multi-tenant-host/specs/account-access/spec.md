# Spec Delta

## ADDED Requirements

### Requirement: Verified self-service sign-up
When sign-up is open and outgoing email is configured, a new account SHALL be created only after its email address is confirmed through a single-use link that expires within 24 hours. Without outgoing email, open sign-up SHALL behave as before.

#### Scenario: Confirming the address
- **WHEN** a person signs up with an address and opens the link from the email within 24 hours
- **THEN** the account becomes active and they are signed in

#### Scenario: Expired link
- **WHEN** the link is opened after 24 hours
- **THEN** it is refused with an explanation and an option to send a new one, and no account is activated

### Requirement: Self-service password reset
When outgoing email is configured, the sign-in screen SHALL offer "Forgot password". The server SHALL email a single-use reset link valid for one hour, SHALL give the same answer whether or not the address has an account, and SHALL end the account's other sessions once the password is changed. The request route SHALL be rate limited and SHALL answer malformed requests with 400.

#### Scenario: Reset by email
- **WHEN** a user requests a reset and sets a new password through the link within an hour
- **THEN** the password changes, the link stops working, other sessions are signed out, and the audit log records the reset

#### Scenario: Unknown address
- **WHEN** a reset is requested for an address with no account
- **THEN** the answer is identical to a known address and no email is sent

#### Scenario: Malformed request
- **WHEN** the reset route receives a body without an address
- **THEN** it answers 400 with the standard error envelope
