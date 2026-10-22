# Spec Delta

## ADDED Requirements

### Requirement: Rule writes are labelled in history
History entries whose device starts with `rule:` SHALL carry a `device_label`: "Rule (<name>)" when the viewer owns the rule and it still exists (the name decrypted on the device for an encrypted account), otherwise "Rule". The timeline SHALL show that label with the viewer as the author. Labels are computed when history is read; no op changes, and history stays online-only as before. Restoring an earlier value from such an entry SHALL be an ordinary operation by the restoring device that converges like any edit.

#### Scenario: Own rule named
- **WHEN** the rule "Sunday sweep" rescheduled a task and its owner opens the task's history online
- **THEN** the version is labelled "Rule (Sunday sweep)" with the old and new due dates

#### Scenario: Deleted rule
- **WHEN** the rule has been deleted since
- **THEN** the version is labelled "Rule"

#### Scenario: Unauthenticated history request
- **WHEN** a request without credentials asks for the history of a task changed by a rule
- **THEN** the response is 401 `unauthorized`
