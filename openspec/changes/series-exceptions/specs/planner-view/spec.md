## MODIFIED Requirements

### Requirement: Projected occurrences of recurring tasks
For every open task with a recurrence rule, the occurrences that would follow its current one within the shown span SHALL be computed on the device from the rule, the current due date and the series' occurrence records, and drawn in their columns as dimmed rows with the task's title, time and estimate and a "projected" marker. The series itself SHALL remain one ordinary row on its current date. A rule's end condition SHALL stop the projection, counting done and open records (OpenSpec `recurring-tasks`, "End conditions"). No projection SHALL be drawn on an exception date of the series; an open record SHALL be listed as an ordinary task row on its own date.

#### Scenario: Weekly report
- **WHEN** today is Monday the 12th, a task "Weekly report" with `every monday` and a 45-minute estimate is due today, and the span is 21 days
- **THEN** the 12th shows the task as an ordinary row and the 19th and 26th show it dimmed as projected, each counting 45 minutes in its column's total

#### Scenario: Projection follows the series
- **WHEN** the user drags the "Weekly report" row from the 12th to the 13th
- **THEN** the series is due the 13th, and the projections move to the following Mondays computed from the new due date, with no other operation written

#### Scenario: End condition
- **WHEN** a task with `every day for 3 times` has two completed occurrences and is due today
- **THEN** no projection is drawn after today

#### Scenario: Completion-relative rule
- **WHEN** a task with `every 3 days after completion` is due the 14th
- **THEN** projections are drawn on the 17th and 20th, as if each occurrence were completed on its day

#### Scenario: Catch-up series
- **WHEN** a task with `every day` is due five days ago
- **THEN** the series is not listed in any column (its date is before the span) and projections are drawn from tomorrow on, as the next occurrence after today

#### Scenario: Skipped and moved occurrences
- **WHEN** "Weekly report" is due the 12th, the occurrence of the 19th was skipped and the occurrence of the 26th was moved to the 27th
- **THEN** the 19th and 26th show no projection, and the 27th lists the moved occurrence as an ordinary task row

### Requirement: Projections are derived and read-only
Projected occurrences SHALL be written nowhere: no operation, no local row, no synced cache. Because they are a function of the synced series row, its records and the shared rule calculator, every device SHALL draw the same projections; there is nothing to converge. Acting on a projection (dragging it to another column, or completing, skipping or moving it from its menu) SHALL write that occurrence's record as OpenSpec `recurring-tasks` "Act on one occurrence" describes, after which the date is an exception and shows the record, if open, instead of a projection. For a viewer of the shared project and for a completion-relative series, projections SHALL NOT be draggable, movable, completable or drop targets. Projections SHALL NOT be selectable with `j` and `k` and SHALL be marked for assistive technology as projected.

#### Scenario: Projection is read-only
- **WHEN** a viewer of the shared project drags on a projected row, or the user selects rows with `j` and `k`
- **THEN** nothing is written, the drag does not start, and `j` and `k` skip the projected rows

#### Scenario: Same projections on two devices
- **WHEN** two devices hold the same operations for a series with `every 2 weeks`
- **THEN** both show the projection on the same days of the span, offline or online

#### Scenario: Nothing in the operation log
- **WHEN** the Plan has been open with projections drawn, nobody acted on them, and the device syncs
- **THEN** no operation about the projected dates is uploaded

#### Scenario: Drag one occurrence to another day
- **WHEN** an editor drags the projected "Weekly report" of the 19th onto the 20th
- **THEN** the 20th lists an open "Weekly report" occurrence as a task row, the 19th shows nothing, the series stays due the 12th, and the 26th still shows its projection
