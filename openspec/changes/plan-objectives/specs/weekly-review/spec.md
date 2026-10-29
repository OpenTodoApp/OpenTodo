## ADDED Requirements

### Requirement: Objectives in the weekly review
While objectives are on (OpenSpec `plan-objectives`), the Look ahead step SHALL show an Objectives section above the next seven days:
- this quarter's objectives, read-only;
- the planned week's objectives, with Add and edit under the limit;
- the open weekly objectives of the week before the planned week, each offering Carry (to the planned week), Done and Drop.

The planned week SHALL be next week when the review is opened from Friday to Sunday of the viewer's week, and this week otherwise, with a toggle to switch. In the first review whose local date falls in a new quarter, the previous quarter's open quarterly objectives SHALL be offered with Carry (to the current quarter), Done and Drop. Each action SHALL be one undoable batch written through the operation log, applied locally first and working offline. The section SHALL not change whether the step is done, the number of steps or the progress indicator.

#### Scenario: Sunday review plans next week
- **WHEN** objectives are on and the user opens the review on Sunday 2026-11-01 with Monday weeks
- **THEN** Look ahead shows this quarter's objectives, "Objectives for next week" (week 45) with Add, and week 44's open objectives with Carry, Done and Drop

#### Scenario: Carry one objective
- **WHEN** the user chooses Carry on week 44's open objective "Draft the talk"
- **THEN** its period becomes `2026-W45`, it moves to "Objectives for next week", and Undo puts it back

#### Scenario: New quarter
- **WHEN** the first review of January 2027 runs and Q4 2026 has two open objectives
- **THEN** both are offered with Carry to Q1 2027, Done and Drop, and once each is handled they are no longer offered

#### Scenario: Offline
- **WHEN** the device is offline and the user adds a weekly objective in the review
- **THEN** it appears in the section and in the Plan strip at once, and uploads on the next sync

#### Scenario: Switch off
- **WHEN** objectives are off
- **THEN** Look ahead shows no Objectives section and the step is unchanged
