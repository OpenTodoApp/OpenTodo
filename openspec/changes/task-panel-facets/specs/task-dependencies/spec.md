# Spec Delta

## MODIFIED Requirements

### Requirement: Dependencies in the detail panel
The detail panel SHALL show each blocker as a part of the Who line reading "waits for" and the blocker's title (completed ones struck through), and the open tasks that depend on this task as one part reading "blocks" with their number. The blockers' popover SHALL hold the picker to add or remove blockers; the "blocks" popover SHALL list the dependent tasks, each opening that task. Pressing `b` on a selected list row SHALL open the picker. Every action SHALL be reachable with the keyboard and SHALL apply locally at once.

#### Scenario: Add from the keyboard
- **WHEN** a task is selected in a list and the user presses `b`, types "conf" and presses Enter on "Confirm dates"
- **THEN** "Confirm dates" is a blocker of the task, the Who line reads "waits for Confirm dates", and the row shows the marker immediately

#### Scenario: Blocks list
- **WHEN** the user opens "Confirm dates", which blocks "Book flights" and "Book hotel"
- **THEN** the Who line reads "blocks 2", and opening that part lists both, each opening that task

#### Scenario: Blocker completed
- **WHEN** a blocker of the open task is completed on another device and this device syncs
- **THEN** its "waits for" part is struck through without a reload
