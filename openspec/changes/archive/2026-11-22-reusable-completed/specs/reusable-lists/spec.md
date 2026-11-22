## MODIFIED Requirements

### Requirement: Ticked items stay in a reusable list
A reusable list SHALL end with a completed group headed "Completed" and its count, as any project's group is on every device, whatever the device's "Show completed tasks" preference, most recently completed first, closed by default with its open state remembered per device. Unticking an item in the group SHALL reopen it. The Project menu SHALL NOT offer "Show completed tasks" in a reusable list, and the line "n completed tasks hidden" SHALL NOT appear there.

#### Scenario: Partner's phone
- **WHEN** Alice ticks off Eggs in the shared reusable "Groceries" and Bob, who never changed any display preference, opens it after sync
- **THEN** Bob's list ends with "Completed 1" holding Eggs
