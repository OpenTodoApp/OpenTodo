# Spec Delta

## MODIFIED Requirements

### Requirement: Recorded events
The server SHALL record sign-in success and failure, sign-out, second-factor changes, passkey registration and removal, token creation and revocation, invitation creation, acceptance and revocation, role changes, security settings changes, data or audit exports, backup creation or restoration, each write tool call made with an `agent` token (`agent.write`), and every outgoing email as `email.sent` or `email.failed` with its kind and recipient address. Each event SHALL carry a time, name, outcome, the actor when known and the target when different. Events are never synced.

#### Scenario: Token creation is recorded
- **WHEN** a user creates an API token named "laptop script"
- **THEN** the log contains a `token.created` event with that user as actor, outcome `success`, and the token name and id in its details

#### Scenario: Failed sign-in is recorded
- **WHEN** a sign-in fails because of a wrong password for an existing account
- **THEN** the log contains a `login.failed` event with outcome `failure`, the account as target, no actor, and the reason in its details

#### Scenario: Task edits are not events
- **WHEN** a user creates, edits, completes or deletes tasks and projects from a device, the REST API or CalDAV
- **THEN** no audit event is recorded for those operations

#### Scenario: Assistant write is recorded without content
- **WHEN** an assistant with an `agent` token completes three tasks in one `complete_tasks` call
- **THEN** the log contains one `agent.write` event with the user as actor, outcome `success`, and details `tool`, `token_id`, `token_name` and `count: 3`, and no task title or other content

#### Scenario: Refused assistant write is recorded
- **WHEN** an assistant's write call is refused because the user's switch is off
- **THEN** the log contains an `agent.write` event with outcome `failure` and reason `writes_disabled_by_user`

#### Scenario: Sent email is recorded without its link
- **WHEN** an admin sends an invitation to bob@example.com by email
- **THEN** the log contains an `email.sent` event with the admin as actor, outcome `success`, details `email_kind: invitation` and `email: bob@example.com`, and neither the link nor the body

#### Scenario: Failed email is recorded
- **WHEN** a password reset message cannot be sent because the SMTP server rejected the credentials
- **THEN** the log contains an `email.failed` event with outcome `failure`, the account as target, no actor, and details `email_kind: password_reset` and `reason: auth`

#### Scenario: SMTP settings change is recorded
- **WHEN** the owner changes the SMTP host and password
- **THEN** the log contains `settings.changed` events for `smtp.host` with the old and new value and for `smtp.password` recording only that it was set, never the password
