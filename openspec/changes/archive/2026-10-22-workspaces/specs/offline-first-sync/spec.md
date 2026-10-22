## MODIFIED Requirements

### Requirement: Sync exchange
A single request SHALL push the client's pending operations and pull operations recorded after the client's cursor, excluding those authored by the requesting device. The response SHALL include the new cursor, whether more remain, the server time, the refused operations with reasons, the caller's project memberships, and the caller's workspaces with their members and groups. The client SHALL exchange until the outbox is empty and nothing remains, treating added response fields as optional, and SHALL replace its cached workspace directory with the response's on every exchange.

#### Scenario: New device catches up
- **WHEN** a device with an empty cursor syncs
- **THEN** it receives every operation ever recorded for the user's own data and for every project shared with the user, including those created through the REST API, and ends with the same tasks and projects as the other devices, partitioned into the same workspaces

#### Scenario: Offline edits upload on reconnect
- **WHEN** a device made edits offline and the network returns
- **THEN** the pending operations are uploaded without user action and other devices receive them on their next exchange

#### Scenario: Newly shared project catches up behind an existing cursor
- **WHEN** a device whose cursor is already past a project's history becomes a member of that project and syncs
- **THEN** the exchange delivers that project's full history before newer operations, reporting that more remain until the history is complete, and the device's single cursor keeps advancing monotonically

#### Scenario: Refused operations do not block the outbox
- **WHEN** a pushed batch contains an operation the caller is not allowed to make
- **THEN** the response is 200, the allowed operations are applied, the refused one is listed with its id and reason, and the device removes it from the outbox instead of retrying it

#### Scenario: Workspace directory in the response
- **WHEN** a member of "Family" syncs after a group there gained a member
- **THEN** the response's workspaces carry Family with the new group member, the device replaces its cached copy, and a client from before this change ignores the field and syncs as before

#### Scenario: Left a workspace
- **WHEN** a device of a user who was removed from "Family" syncs
- **THEN** the response no longer lists Family, the device drops it from its cache and switcher, and the projects of Family the user had through grants are purged as for a removed project member
