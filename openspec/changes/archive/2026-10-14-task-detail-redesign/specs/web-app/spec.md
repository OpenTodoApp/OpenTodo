## ADDED Requirements

### Requirement: Task panel layout
The panel SHALL show, top to bottom: a header with Complete, Close and a menu holding Delete and the less frequent actions; the title and notes; a properties area listing each field as a labelled row that shows its current value and turns into its editor on click or Enter; the subtasks; and a tabbed area with Comments, Activity and History. Empty fields SHALL read as a quiet placeholder ("No due date"), not as an empty control.

#### Scenario: Values read as values
- **WHEN** the user opens a task due tomorrow at 09:00 with priority 2 in "Work"
- **THEN** the properties rows read "Work", "P2" and the due date and time in the user's format, without visible input boxes

#### Scenario: Edit a row with the keyboard
- **WHEN** the user tabs to the Due row and presses Enter
- **THEN** the due editor opens with focus in it, and Escape closes it with focus back on the row

#### Scenario: Delete from the header menu
- **WHEN** the user opens the header menu and chooses Delete
- **THEN** the task moves to the Trash and the panel closes

### Requirement: Task panel tabs
The tabbed area SHALL offer Comments (with the comment count), Activity and History as tabs reachable with the keyboard (arrow keys between tabs, Tab into the content). Comments SHALL be the default tab; the last chosen tab SHALL be remembered on the device only. `Shift+C` SHALL switch to Comments and focus the composer.

#### Scenario: Shortcut to the composer
- **WHEN** the History tab is open and the user presses `Shift+C` outside a text field
- **THEN** the Comments tab is shown and the composer has focus

#### Scenario: Remembered tab
- **WHEN** the user opens the Activity tab, closes the panel and opens another task
- **THEN** the Activity tab is shown for that task on this device

### Requirement: Task panel in viewer mode
For a viewer of a shared project every property row SHALL render as read-only text without an editor, the header SHALL omit Complete and Delete, and the Comments tab SHALL remain writable because viewers may comment.

#### Scenario: Viewer opens a task
- **WHEN** a viewer opens a task in a shared project
- **THEN** the properties cannot be edited, a read-only note is shown, and the comment composer is available
