## ADDED Requirements

### Requirement: Tap to place from the planning list
Where the panel slot covers the calendar (below 1024 px), tapping a task in the planning list in the Day, or in the Week while it shows its grid, SHALL start the same placement as `s`, close the list without changing whether it is remembered open, and show a bar at the bottom of the calendar with the task's title and Cancel, announced as a status. A tap on an empty time of a day column SHALL then place the task at that quarter hour as one undoable change, and the list SHALL open again with focus on the next task. Cancel or Escape SHALL end the placement without a change and open the list again with focus on that task. The keys of the placement SHALL keep working during it. From 1024 px a tap on a list task SHALL behave as before.

#### Scenario: Plan a task with two taps on a phone
- **WHEN** on a 390 px screen the user opens Plan from a list in the Day, taps "Call the plumber" and then taps 14:30 in the day
- **THEN** the task is due today at 14:30 with Undo offered, and the planning list is open again

#### Scenario: Cancel a tap placement
- **WHEN** the user taps a task in the planning list on a phone and then Cancel
- **THEN** nothing changes and the planning list is open again with focus on that task

#### Scenario: A tap on a block does not place
- **WHEN** during a tap placement the user taps an existing event in the day
- **THEN** the task is not placed and the bar stays

#### Scenario: Wide screens keep drag and drop
- **WHEN** on a 1280 px screen the user taps a task in the planning list
- **THEN** no placement starts and dragging it onto a time still plans it
