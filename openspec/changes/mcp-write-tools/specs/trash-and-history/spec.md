## ADDED Requirements

### Requirement: Assistant writes are labelled in history
History entries whose device starts with `agent:` SHALL carry a `device_label`: "AI assistant (<token name>)" when the viewer owns the token and it still exists, otherwise "AI assistant". The timeline SHALL show that label. Labels are computed when history is read; no op changes, and history stays online-only as before.

#### Scenario: Own assistant named
- **WHEN** Alice's token "Desk assistant" rescheduled a task and Alice opens its history online
- **THEN** the change group is labelled "AI assistant (Desk assistant)" with the old and new due dates

#### Scenario: Other member sees a generic label
- **WHEN** Bob opens the history of the same task in a project Alice shares with him
- **THEN** the change group is labelled "AI assistant" without the token name

#### Scenario: Restore a value changed by an assistant
- **WHEN** Alice restores the previous due date from that history entry
- **THEN** a new op with Alice's device restores it and converges like any edit

#### Scenario: Unauthenticated history request
- **WHEN** a request without credentials asks for the history of a task changed by an assistant
- **THEN** the response is 401 `unauthorized`
