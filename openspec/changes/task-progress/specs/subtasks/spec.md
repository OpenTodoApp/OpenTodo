# Spec Delta

## MODIFIED Requirements

### Requirement: Parent progress
A task with at least one non-deleted subtask SHALL show its progress as "completed/total" over its direct subtasks in list rows and in the detail panel, computed from local data so it is correct offline and updates live when a subtask changes on any device. A subtask's own subtasks SHALL count toward that subtask's progress, not its parent's; a deleted subtask SHALL count nowhere, and a completed parent SHALL keep showing the progress of its subtasks. In a list row and on a card the count SHALL be led by a small progress ring showing the share done, in the count's own colour, decorative, so assistive technology reads the count ("3 of 5 subtasks completed") and nothing more. The detail panel's Subtasks heading SHALL show the count, the bar and the share as a whole percentage ("60%", read "60% done"). Progress is derived, never stored or synced, so it converges whenever the subtasks it counts converge.

#### Scenario: Progress indicator
- **WHEN** "Plan trip" has five direct subtasks of which three are completed
- **THEN** its row shows a ring three-fifths full and "3/5", and its panel's Subtasks heading reads "3 of 5" with the bar and "60%"

#### Scenario: Remote completion updates progress
- **WHEN** another device completes a fourth subtask and this device syncs
- **THEN** the row shows "4/5" and its ring four-fifths full without a page reload

#### Scenario: Nested subtasks count toward their own parent
- **WHEN** "Plan trip" has four direct subtasks, one completed, and its open subtask "Hotel" has two completed subtasks of its own
- **THEN** "Plan trip" shows "1/4" and "Hotel" shows "2/2" with a full ring

#### Scenario: Deleted subtask
- **WHEN** "Plan trip" has five subtasks, three completed, and one of the completed ones is moved to the Trash
- **THEN** its row shows "2/4" and its ring half full

#### Scenario: Offline
- **WHEN** the device is offline and the user completes a subtask
- **THEN** its parent's ring, count and percentage update at once
