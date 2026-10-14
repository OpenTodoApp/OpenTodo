# Spec Delta

## ADDED Requirements

### Requirement: Label picker ordering and search
The label picker opened from the task detail panel or with `L` SHALL follow the design-system picker rules. With an empty query it lists labels assigned recently on this device first, then frequently assigned labels, then the rest by position. Typing matches by word prefix or fuzzily, ignoring case and accents. Assigning or removing a label is still one operation on the task's `labels` array, so it works offline and converges as specified in "Whole-array convergence of task labels".

#### Scenario: Recently used label first
- **WHEN** the user assigned "errands" to one task and opens the label picker on another task
- **THEN** "errands" is listed first

#### Scenario: Offline assignment
- **WHEN** the device is offline and the user picks a label from the reordered list
- **THEN** the label is assigned locally at once and syncs when the device reconnects, converging with other devices' edits under last-writer-wins
