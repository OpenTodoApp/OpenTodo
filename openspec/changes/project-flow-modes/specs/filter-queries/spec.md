# Spec Delta

## ADDED Requirements

### Requirement: Availability term
`available` SHALL match tasks that are available (project-flow "Available tasks"): open, not blocked by an open task, not waiting in sequence, and neither in Someday nor deferred to a later start; `!available` SHALL therefore match the other open tasks. It SHALL be a keyword of the published grammar, accepted by the server's query validation for saved views, evaluated on the device from local data with the same open-only default as every other term, and SHALL follow completions synced from other devices without a reload. `blocked` and `unblocked` SHALL keep matching explicit dependencies only.

#### Scenario: What can be done now
- **WHEN** the user enters `available & @phone`
- **THEN** only open tasks with the label "@phone" that are available are listed, and the later steps of sequential projects are not

#### Scenario: Waiting step is not blocked
- **WHEN** a task waits in sequence and has no `blocked_by`
- **THEN** it matches `!available` and `unblocked`, and does not match `blocked`

#### Scenario: Offline saved view
- **WHEN** a saved view `available & today` is opened offline and the user completes the current step of a sequential project whose next step is due today
- **THEN** the next step appears in the view at once
