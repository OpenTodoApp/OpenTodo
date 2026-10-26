# Spec Delta

## ADDED Requirements

### Requirement: Adding people by email is limited and recorded
Adding a person to a project (`POST /api/v1/projects/{id}/members` with `email`) or to a workspace (`POST /api/v1/workspaces/{id}/members`) by email SHALL count toward a budget of 30 attempts per acting account per hour, shared by both routes and counted whether or not an account has that email, after the caller's right to add members was checked. Over the budget the server SHALL answer 429 `rate_limited` and look nothing up. Adding a member of a created workspace's directory by account id does not count. Every successful project add SHALL be recorded in the audit log as `project.member_added` with the actor, the added account as target, the project id and the role, never an email or a name. Membership is server state, not synced through the operation log; the share dialog needs a connection.

#### Scenario: Probing for accounts
- **WHEN** a project owner tries 30 unknown email addresses within an hour and then adds an existing account
- **THEN** each unknown address answers 404 `user_not_found` and the last request answers 429 `rate_limited` without adding anyone

#### Scenario: Another account's budget
- **WHEN** one account has used up its budget and another account adds a member to its own project
- **THEN** the other account's request succeeds

#### Scenario: Recorded add
- **WHEN** the owner adds an existing account as an editor
- **THEN** the audit log has a `project.member_added` event with the owner as actor, the account as target and `project_role` `editor`

#### Scenario: Limited token
- **WHEN** a `read` or `agent` token tries to add a member
- **THEN** the response is 403 `insufficient_scope`, as for any write those tokens may not make
