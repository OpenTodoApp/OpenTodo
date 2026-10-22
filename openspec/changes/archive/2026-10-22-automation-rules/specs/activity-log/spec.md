# Spec Delta

## ADDED Requirements

### Requirement: Rule operations form their own events
Operations written by a rule (device `rule:<rule-id>`, OpenSpec `automation-rules`) SHALL form their own events, attributed to the rule and never folded into the user's own events, derived identically on the server and on a device holding the same operations.

#### Scenario: Rule change next to the user's edit
- **WHEN** the user adds the label waiting to a task and, within the same minute, the rule "Waiting" moves the task to the Waiting section
- **THEN** the activity shows two events: "added the label waiting" by the user and "moved to Waiting" by the rule, with the second carrying device `rule:<rule-id>`

#### Scenario: Same derivation on both sides
- **WHEN** the shared fixture holds a user batch followed by a rule batch on the same task
- **THEN** the server and the device both derive the same two events with the same ids
