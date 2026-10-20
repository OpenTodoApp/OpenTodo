# Spec Delta

## ADDED Requirements

### Requirement: Issue connection events
The server SHALL record `issue_connection.created`, `issue_connection.updated` and `issue_connection.deleted` with the acting account and the connection id and provider in the details, in the transaction of the change, and SHALL list them in the user's own activity. An update SHALL name the setting that changed and never a value. Tokens, hosts, filters, issue titles and bodies SHALL never be recorded. Polls and the tasks they write SHALL NOT be audited.

#### Scenario: Connection created
- **WHEN** a user creates an issue connection
- **THEN** the log contains `issue_connection.created` with the user as actor, the connection id and `github` or `gitlab` in its details, and no host or token

#### Scenario: Token replaced
- **WHEN** a user replaces a connection's token
- **THEN** the log contains `issue_connection.updated` with `setting: token` and no value, and the user sees it in `GET /api/v1/me/activity`

#### Scenario: Settings named
- **WHEN** a user changes a connection's host, filter, project, label mapping, interval, name or enabled flag
- **THEN** one `issue_connection.updated` event names each changed setting (`host`, `filter`, `project`, `labels`, `interval`, `name`, `enabled`) without its value

#### Scenario: Polls are not events
- **WHEN** a poll creates, completes or renames tasks
- **THEN** no audit event is recorded
