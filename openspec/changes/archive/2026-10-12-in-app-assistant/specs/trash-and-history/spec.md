## ADDED Requirements

### Requirement: In-app assistant writes are labelled in history
History entries whose device starts with `assistant:` SHALL carry the `device_label` "Assistant" for every viewer, with the applying user as author, and the timeline SHALL show it. Labels are computed when history is read; no op changes, and history stays online-only. Restoring an earlier value from such an entry SHALL be an ordinary op that converges like any edit.

#### Scenario: In-app assistant change
- **WHEN** Alice applied a change set from the in-app assistant and opens the task's history online
- **THEN** the change group is labelled "Assistant" with Alice as the author and the old and new values

#### Scenario: Restore a value changed by the assistant
- **WHEN** Alice restores the previous due date from that history entry
- **THEN** a new op with Alice's own device restores it and every device converges on it after sync

#### Scenario: Unauthenticated history request
- **WHEN** a request without credentials asks for the history of a task changed by the in-app assistant
- **THEN** the response is 401 `unauthorized`
