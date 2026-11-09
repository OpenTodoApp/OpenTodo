## ADDED Requirements

### Requirement: Task panel proportions
In the docked task panel and on the task page:
- The task's checkbox SHALL be centred on the first line of its title, whether the title takes one line or more, and SHALL share its left edge with the facet lines' icons below it.
- The panel's title SHALL be one type step smaller than the page's title.
- Facet lines, section headings and subtask rows SHALL use the 32 px row step of the panel (44 px on a coarse pointer).
- No element of the panel's head SHALL be wider than the panel's content column.

This is presentation only and the same offline.

#### Scenario: Two-line title
- **WHEN** the docked panel shows a task whose title wraps to two lines
- **THEN** the checkbox is centred on the first line, and its left edge lines up with the When line's icon

#### Scenario: Touch
- **WHEN** the task page is shown on a tablet without a fine pointer
- **THEN** every facet line and subtask row is at least 44 px tall

### Requirement: Quiet subtask checklist
The Subtasks section of the task panel and the task page SHALL be a heading followed by a checklist:
- The heading SHALL carry the section's weight: "Subtasks" at the label size in medium weight, the count "2 of 5" and the progress bar.
- Each subtask SHALL be a quiet checklist row: a 16 px checkbox and the title in the default tone at the body size, with no border, no background and no icon of its own.
- A completed subtask SHALL read in the faint tone with its strike.
- The row's actions SHALL appear on hover or focus within it, always on a coarse pointer.
- The add field SHALL be the last row, reading "Add a subtask" in the faint tone until focused.

Ticking and editing write through the usual task operations, offline included, converging by per-field last-writer-wins.

#### Scenario: Heading and items
- **WHEN** a task has five subtasks, two done
- **THEN** the section shows "Subtasks", "2 of 5" and the progress bar in its heading, then five checklist rows without borders, the two done ones in the faint tone with their strike

#### Scenario: Tick offline
- **WHEN** the device is offline and the user ticks a subtask in the panel
- **THEN** the row is shown done at once, the heading reads "3 of 5", and the change syncs on reconnect

### Requirement: Compact estimate editor
The estimate editor SHALL be one field and one row of four presets:
- The field accepts typed durations (`45`, `1h30`, `90m`), and ↑ and ↓ change the value by 15 minutes.
- The presets are 15m, 30m, 1h and 2h, in the interface face as quiet segments, the chosen one selected.
- Clear is in the editor's footer, as in the other facet editors.

Choosing or typing a value SHALL write the estimate in minutes as one operation with Undo, offline included, converging by last-writer-wins. A value outside the estimate's range SHALL be refused with a message and leave the task unchanged.

#### Scenario: Preset
- **WHEN** the user opens the Estimate part and chooses 30m
- **THEN** the How line reads "30 min" and the editor shows 30m selected

#### Scenario: Arrow keys
- **WHEN** the field holds `1h` and the user presses ↑ twice
- **THEN** the field reads `1h 30` and Enter writes 90 minutes

## MODIFIED Requirements

### Requirement: Task panel tabs
The tabbed area SHALL offer Comments (with the comment count), Activity, History and Time (with the tracked total when there is one) as tabs reachable with the keyboard (arrow keys between tabs, Tab into the content). The tab row SHALL fit the width of the panel or the content column without scrolling:
- When the labels with their counts do not fit, every tab SHALL show its icon followed by its count (the tracked total for Time), keeping the selected tab's word beside its icon when that still fits.
- Each tab's full name and value SHALL stay in its accessible name and its tooltip.

Comments SHALL be the default tab; the last chosen tab SHALL be remembered on the device only. The task's created and completed times SHALL be the first entries of Activity. The Time tab SHALL hold the task's time entries as the time-tracking capability defines them.

#### Scenario: Remembered tab
- **WHEN** the user opens the Activity tab, closes the panel and opens another task
- **THEN** the Activity tab is shown for that task on this device

#### Scenario: Activity starts with the lifecycle
- **WHEN** the user opens the Activity tab of a completed task
- **THEN** its created time and its completed time are the first entries

#### Scenario: Time tab by keyboard
- **WHEN** the panel is open on a task with 35 minutes tracked and the user moves to the tabs and presses the right arrow until the Time tab, named "Time · 35m"
- **THEN** the Time tab shows the entries, Tab reaches Start tracking first, and Enter starts an entry whose row appears at the top with a ticking duration

#### Scenario: A narrow panel
- **WHEN** the docked panel is at its narrowest, 22 rem, on a task with 4 comments and 1 h 20 min tracked
- **THEN** the four tabs fit on one row without scrolling, read as their icons with "4" and "1h 20m", the selected tab keeps its word, and a screen reader hears "Comments, 4" and "Time, 1 h 20 min"
