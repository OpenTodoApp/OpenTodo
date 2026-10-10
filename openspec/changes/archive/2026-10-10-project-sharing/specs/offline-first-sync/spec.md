# Spec Delta

## MODIFIED Requirements

### Requirement: Sync exchange
A single request SHALL push the client's pending operations and pull operations recorded after the client's cursor, excluding those authored by the requesting device. The response SHALL include the new cursor, whether more operations remain, the server time, the list of pushed operations that were refused for authorization reasons (each with its id and a reason) and the caller's current project memberships. The client SHALL keep exchanging until the outbox is empty and no more operations remain, and SHALL treat every added response field as optional so older clients keep working.

#### Scenario: New device catches up
- **WHEN** a device with an empty cursor syncs
- **THEN** it receives every operation ever recorded for the user's own data and for every project shared with the user, including those created through the REST API, and ends with the same tasks and projects as the other devices

#### Scenario: Offline edits upload on reconnect
- **WHEN** a device made edits offline and the network returns
- **THEN** the pending operations are uploaded without user action and other devices receive them on their next exchange

#### Scenario: Newly shared project catches up behind an existing cursor
- **WHEN** a device whose cursor is already past a project's history becomes a member of that project and syncs
- **THEN** the exchange delivers that project's full history before newer operations, reporting that more remain until the history is complete, and the device's single cursor keeps advancing monotonically

#### Scenario: Refused operations do not block the outbox
- **WHEN** a pushed batch contains an operation the caller is not allowed to make
- **THEN** the response is 200, the allowed operations are applied, the refused one is listed with its id and reason, and the device removes it from the outbox instead of retrying it

### Requirement: Per-user isolation
Operations SHALL be stored and served per scope: a user's personal scope holds their Inbox, unshared projects and the tasks in them, and each shared project is its own scope. A user SHALL receive operations only from their personal scope and from the scopes of projects they are currently a member of, and SHALL be able to affect only those scopes, within their role. No user SHALL receive or affect any other scope.

#### Scenario: Two accounts on one server
- **WHEN** two users who share nothing sync against the same server
- **THEN** each receives only their own operations

#### Scenario: Shared and personal data side by side
- **WHEN** Alice and Bob share one project and each also has personal projects, and both sync
- **THEN** each receives the shared project's operations plus their own, and neither receives anything from the other's personal projects

#### Scenario: Former member
- **WHEN** Bob has been removed from a shared project and syncs
- **THEN** he receives no further operations of that project, and operations he submits for it are refused
