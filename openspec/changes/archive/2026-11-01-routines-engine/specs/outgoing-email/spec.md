## ADDED Requirements

### Requirement: Routine email
The server SHALL send one more message kind, `routine`, only for a routine's Email me step (to the run-as account's verified address) or Email project members step (`routines-shared`, to the project's members' verified addresses), and only while outgoing email is configured and the instance is not a demo. Unlike the other kinds, a `routine` message SHALL carry the step's subject and text as the user's routine produced them, in plain text, with the routine's name, a link to the run, and a line saying how to turn the routine off; it SHALL never be sent to an address typed into the routine, and SHALL never be built for an encrypted account. It SHALL count toward the existing sending limits and toward at most 10 messages per routine and 20 per account per day; a message refused by a limit SHALL be recorded as `email.failed` with reason `rate_limited`, and the step SHALL fail with that reason.

#### Scenario: Friday digest
- **WHEN** a user's routine sends "This week: 14 tasks done" with Email me
- **THEN** one plain-text message reaches the account's verified address with that text, the routine's name, a link to the run and how to turn it off

#### Scenario: Limit
- **WHEN** a routine has sent 10 messages today and runs again
- **THEN** no message is sent, `email.failed` is recorded with `rate_limited`, and the run fails at the step with that reason

#### Scenario: Encrypted account
- **WHEN** an encrypted account's routine would send an email
- **THEN** the step is unavailable with reason `encrypted` and no message is built
