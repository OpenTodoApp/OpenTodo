## ADDED Requirements

### Requirement: The description shows examples
Every request body and every JSON success response in the description SHALL carry an example. For the core resources the example SHALL be what a test server answered to that request; elsewhere it SHALL be built from the body's schema. Examples SHALL hold no real secret, token or personal data (placeholders such as `ot_example_token` and `ada@example.com`) and SHALL be the same on every generation from the same code. The shared error responses SHALL show the `{error:{code,message}}` envelope.

#### Scenario: A new route has an example
- **WHEN** a contributor adds a route under `/api/v1/` and regenerates the description
- **THEN** its request and response bodies carry examples, and the description test fails if a JSON body has none

#### Scenario: Reading an example of a core route
- **WHEN** a client reads the description of `POST /api/v1/tasks`
- **THEN** the request example is a task the server accepted and the response example is the task it answered, with placeholder ids and a fixed time

#### Scenario: Regenerating without a change
- **WHEN** the description is regenerated twice from the same code
- **THEN** the two files are identical

#### Scenario: Offline and sync
- **WHEN** a device is offline
- **THEN** nothing changes: the examples are part of the description, which the app does not read, and no op or synced data is involved
