# Spec Delta

## MODIFIED Requirements

### Requirement: Sign-up policy
After the owner exists, creating further accounts SHALL be refused unless the operator enabled open sign-up through configuration or the registration carries a valid, unspent invitation. The policy SHALL be enforced on the server, not only hidden in the client.

#### Scenario: Sign-up closed by default
- **WHEN** an owner exists, open sign-up is not enabled, and someone attempts to register without an invitation
- **THEN** the request is refused with a `signup_closed` error and no account is created

#### Scenario: Operator opens sign-up
- **WHEN** the operator sets `OPENTODO_ALLOW_SIGNUP=true` and someone registers with an unused email
- **THEN** an account with the role `member` is created

#### Scenario: Registration with a valid invitation
- **WHEN** open sign-up is not enabled and someone registers with an unused email and a valid, unspent invitation secret
- **THEN** an account with the role `member` is created and the invitation becomes spent

#### Scenario: Duplicate email
- **WHEN** someone registers with an email that already has an account, compared case-insensitively
- **THEN** the request is refused with an `email_taken` error
