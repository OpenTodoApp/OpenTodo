# Spec Delta

## ADDED Requirements

### Requirement: Someday and evening phrases
The parser SHALL recognise `someday` and `tonight` / `this evening`, each with its bundled equivalent in every active language. `someday` SHALL park the task (start `someday`, no due date) and SHALL be left in the title when the line also has a date phrase. `tonight` and `this evening` SHALL make the task due today with the evening flag; a time in the line SHALL become the due time as usual. Each SHALL show its own chip, dismissable like any other. The Someday view SHALL be a capture context that parks the task unless the line sets a date.

#### Scenario: Park from quick add
- **WHEN** the user enters `Learn to sail someday @hobby`
- **THEN** the task is titled `Learn to sail`, parked, labelled "hobby", and a Someday chip is shown

#### Scenario: Someday with a date stays literal
- **WHEN** the user enters `Plan someday trip friday`
- **THEN** the task is titled `Plan someday trip`, due Friday and not parked

#### Scenario: Tonight with a time
- **WHEN** the user enters `Call Ana tonight at 8pm` on 2026-10-14
- **THEN** the task is due `{date: "2026-10-14", time: "20:00"}` with the evening flag set and the title `Call Ana`

#### Scenario: Italian evening
- **WHEN** Italian is active and the user enters `Chiama Ana stasera`
- **THEN** the task is due today with the evening flag set and the title `Chiama Ana`

#### Scenario: Someday view context
- **WHEN** the user adds `Read Proust` in the Someday view and `Read Proust tomorrow` in the same view
- **THEN** the first task is parked and the second is due tomorrow and not parked
