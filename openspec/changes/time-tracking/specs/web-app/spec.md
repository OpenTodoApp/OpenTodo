# Spec Delta

## MODIFIED Requirements

### Requirement: Task panel tabs
The tabbed area SHALL offer Comments (with the comment count), Activity, History and Time (with the tracked total when there is one) as tabs reachable with the keyboard (arrow keys between tabs, Tab into the content). Comments SHALL be the default tab; the last chosen tab SHALL be remembered on the device only. The task's created and completed times SHALL be the first entries of Activity. The Time tab SHALL hold the task's time entries as the time-tracking capability defines them.

#### Scenario: Remembered tab
- **WHEN** the user opens the Activity tab, closes the panel and opens another task
- **THEN** the Activity tab is shown for that task on this device

#### Scenario: Activity starts with the lifecycle
- **WHEN** the user opens the Activity tab of a completed task
- **THEN** its created time and its completed time are the first entries

#### Scenario: Time tab by keyboard
- **WHEN** the panel is open on a task with 35 minutes tracked and the user moves to the tabs and presses the right arrow until "Time · 35m"
- **THEN** the Time tab shows the entries, Tab reaches Start tracking first, and Enter starts an entry whose row appears at the top with a ticking duration
