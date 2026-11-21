## ADDED Requirements

### Requirement: Push-only exchange
A device that only writes MAY send the optional feature `push_only` in a sync request. The server SHALL then apply the pushed operations exactly as in an ordinary exchange (validation, refusals, idempotence, waking other devices) and SHALL answer with the applied and duplicate counts, the refused operations with reasons, the head cursor of the caller's operations, the server time, `hasMore: false` and empty `ops`, `memberships` and `workspaces` lists. A server that does not know the feature SHALL ignore it and answer with an ordinary page, which a push-only device discards. The route keeps its policy: a signed-in session or a `full` token, `read` and `agent` tokens refused.

#### Scenario: Push without pulling
- **WHEN** a device with an empty cursor sends one task creation with `features: ["push_only"]` to an account holding 30,000 operations
- **THEN** the task is applied, the answer carries no operations, its cursor is the account's head, and the user's other devices are woken

#### Scenario: Duplicate push
- **WHEN** the same push-only batch is sent twice
- **THEN** the second answer counts the operations as duplicates and nothing changes

#### Scenario: Refused operation
- **WHEN** a push-only batch holds an operation on a project where the caller is a viewer
- **THEN** the answer is 200 and lists that operation as refused with its reason, and the other operations are applied

#### Scenario: Not signed in
- **WHEN** a push-only request carries no session and no token, or a `read` token
- **THEN** the answer is 401, or 403 `insufficient_scope` for the `read` token, and nothing is applied
