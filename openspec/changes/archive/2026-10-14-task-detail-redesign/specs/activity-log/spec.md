## MODIFIED Requirements

### Requirement: Per-task activity
The task detail panel SHALL show the task's activity in its Activity tab in reverse chronological order, with comment events as compact one-line entries, built from the operations already in local storage so it is available offline, and extended with older history from the server when online and more exists.

#### Scenario: Offline history
- **WHEN** the user opens a task's detail panel without a network
- **THEN** the activity list shows every event derived from operations the device has received, including the user's own unsent changes marked as pending

#### Scenario: Older history on demand
- **WHEN** the user asks for more at the end of the list while online
- **THEN** older events are fetched from the server and appended without duplicates

#### Scenario: Comment events are compact
- **WHEN** Bob commented on the task an hour ago
- **THEN** the Activity tab shows one line "Bob commented" with its time, and choosing it opens the Comments tab at that comment

## ADDED Requirements

### Requirement: Grouped activity runs
Consecutive events by the same actor on the same task within ten minutes of each other SHALL be shown as one run summarising what changed ("You changed the due date and priority"), expandable to the individual events with their values. Each run and event SHALL show the actor's avatar initials, an icon for the kind of change, and a relative time with the absolute time in the user's format on hover and focus. Grouping SHALL be presentation only and SHALL NOT change the events.

#### Scenario: Burst of edits
- **WHEN** the user changed a task's title, due date and priority within two minutes
- **THEN** the Activity tab shows one run "You renamed the task and changed the due date and priority" that expands to three events

#### Scenario: Different actors are not merged
- **WHEN** Alice changes the due date and Bob changes the priority a minute later
- **THEN** two separate entries are shown

#### Scenario: Pending inside a run
- **WHEN** one of the events in a run comes from an unsent local change
- **THEN** the run is marked pending until the change is acknowledged by the server
