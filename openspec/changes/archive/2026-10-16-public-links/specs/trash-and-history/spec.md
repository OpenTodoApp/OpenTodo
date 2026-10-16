# Spec Delta

## ADDED Requirements

### Requirement: Public link ticks are labelled in history
History entries whose device starts with `public:` SHALL carry a `device_label`: "Public link (<name>)" when the viewer is the project's owner or an admin and the link still exists and has a name, otherwise "Public link". The timeline SHALL show that label. Labels are computed when history is read; no op changes, and history stays online-only as before.

#### Scenario: Owner sees the link's name
- **WHEN** a guest ticks a task through the link "Grandma" and the owner opens the task's history online
- **THEN** the change group is labelled "Public link (Grandma)" with the old and new completion state

#### Scenario: Editor sees a generic label
- **WHEN** an editor of the same shared project opens the history of that task
- **THEN** the change group is labelled "Public link" without the name

#### Scenario: Revoked link
- **WHEN** the link was revoked before the history is read
- **THEN** the change group is labelled "Public link"

#### Scenario: Restore a value changed by a guest
- **WHEN** the owner restores the previous value from that history entry
- **THEN** a new op with the owner's device restores it and converges like any edit

#### Scenario: Unauthenticated history request
- **WHEN** a request without credentials asks for the history of a task ticked through a public link
- **THEN** the response is 401 `unauthorized`
