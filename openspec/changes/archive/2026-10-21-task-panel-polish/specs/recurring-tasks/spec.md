# Spec Delta

## ADDED Requirements

### Requirement: Repeat presets
The Repeat segment of the When popover SHALL show the current rule in words when one is set, then the presets Every day, Every weekday, Every week on the due date's weekday, Every month on the due date's day, Every year on the due date's day and month, and Custom…, which opens the full rule editor in place. A preset SHALL write the same rule the full editor writes for it. Without a due date, the presets SHALL name today's weekday and day. Offline, a preset SHALL apply at once and converge like any other rule edit.

#### Scenario: Weekly preset
- **WHEN** a task is due Thursday 2026-10-22 and the user chooses "Every week on Thursday"
- **THEN** the task repeats weekly on Thursday, and the segment reads "every week on Thursday" above the presets

#### Scenario: Custom rule
- **WHEN** the user chooses Custom…
- **THEN** the full rule editor opens inside the segment with the current rule, and nothing is written until it is changed

#### Scenario: Offline preset
- **WHEN** the device is offline and the user chooses Every day
- **THEN** the rule applies locally at once, and syncs with the usual last-writer-wins rule when the device is back online
