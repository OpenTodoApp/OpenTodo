## MODIFIED Requirements

### Requirement: Task detail panel
Opening a task SHALL show it as its own page at `/task/<id>` (see "Task page") for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The page SHALL show every property in its facts column, a property without a value as a quiet action that sets it (see "Task facts column"). A task SHALL open from Enter on a selected row, from Open details or `Shift+Enter` in the inline editor, and from a click on a row's title when the inline editor does not apply (see `task-list-presentation` "Inline title editing"). Only a page that keeps a split (Process the Inbox) SHALL show the task in the shell's panel slot beside its content instead, and only from 1024 px; below that it opens the page too. Where another capability says the task panel or the detail panel, it means the task page, or the docked panel on a page that keeps a split.

#### Scenario: Open from the list
- **WHEN** the user presses Enter on a selected task, or taps a task's title on a touch screen
- **THEN** the task opens as its page, the address is `/task/<id>`, and nothing is docked beside the list

#### Scenario: Click edits in place on a desktop
- **WHEN** the user clicks a task's title with a mouse on a 1280 px wide screen
- **THEN** the title becomes editable in the list and the task page does not open

#### Scenario: Empty task shows few things
- **WHEN** the user opens a task with a title, a project and nothing else
- **THEN** the facts column shows the priority and the project as values, every other fact as a quiet action such as "Set a deadline", and no empty form field

#### Scenario: Open on a phone
- **WHEN** the user opens a task from Today on a 390×844 phone
- **THEN** the task page fills the screen with Back to Today in the bar, the facts under the notes, and no tab bar or add button

#### Scenario: Drag the handle to close
- **WHEN** the user opens a task on a 390 px phone
- **THEN** it opens as its page with no handle and no scrim, and Back in the bar returns to the list where it was

#### Scenario: Reading comments does not close the sheet
- **WHEN** the user scrolls the task page down to the comments and drags down on a comment
- **THEN** the page scrolls and nothing closes

#### Scenario: Scrim and Close
- **WHEN** the user chooses Close on the task page, or Back on a phone
- **THEN** the list it was opened from shows with the task's row selected

#### Scenario: Triage keeps its split
- **WHEN** the user presses Enter on the card in Process the Inbox on a 1280 px wide screen
- **THEN** the task opens in the panel beside the card, and Escape closes it and returns to the card

### Requirement: Task panel layout
The task page SHALL show, top to bottom: a compact header with the breadcrumb (the task's project, its parent task when it has one, and the task), the task's place in the list it was opened from ("4 / 12") with the next and previous task, a menu holding Delete, Copy link, Attach and the less frequent actions, and Close; then the content column with the task's checkbox and editable title, the notes (never clamped), an Attach control, the project's custom fields, the subtasks as one bordered block with their count and progress, the attachments list only when there are attachments, and the tabbed area with Comments, Activity, History and Time, the comment composer pinned to the bottom; and the facts column beside the content from 1024 px, under the notes below that. The docked panel of a page that keeps a split SHALL keep the earlier panel layout: the sticky header with the checkbox, the title, the menu (with Expand) and Close, the clamped notes, the facet lines with Add, the subtasks, the attachments and the tabs.

#### Scenario: Delete from the header menu
- **WHEN** the user opens the header menu on the task page and chooses Delete
- **THEN** the task moves to the Trash, the page returns to the list it was opened from, and a toast offers Undo

#### Scenario: Scrolled panel keeps its context
- **WHEN** the user scrolls the task page down to the comments
- **THEN** the header with the breadcrumb, the place in the list and Close stays visible, and on a wide screen so does the facts column

#### Scenario: Long title
- **WHEN** the user opens a task whose title is wider than the content column
- **THEN** the title wraps under the checkbox and remains editable in place, and the breadcrumb shortens its last crumb with an ellipsis

### Requirement: Task panel comment composer
The comment composer SHALL be pinned to the bottom of the task page's content column (of the panel when docked) while Comments is shown, resting as a single line that expands to the full composer (the rich-text editor, attach, the submit key hint and the round Send control of the shared composer frame, see `comments` "Composer behaviour") when focused, when it holds a draft or a reply target, or when `Shift+C` is pressed; `Shift+C` SHALL switch to Comments and focus the composer. The editor's own keys SHALL apply only while the composer has focus and SHALL never fire a page shortcut.

#### Scenario: Shortcut to the composer
- **WHEN** the History tab is open and the user presses `Shift+C` outside a text field
- **THEN** the Comments tab is shown, the composer is expanded with the editor and has focus

#### Scenario: Composer without scrolling
- **WHEN** a task with thirty comments is opened
- **THEN** the composer line is visible at the bottom of the page before the user scrolls

#### Scenario: At rest
- **WHEN** a task without a draft is opened and nothing is focused
- **THEN** the composer is one line reading "Write a comment…" with no buttons under it, and the Comments list has the space the full composer used

#### Scenario: Editor keys stay in the editor
- **WHEN** the composer has focus and the user presses `c` or `1`
- **THEN** the character is typed into the comment and the task is neither completed nor reprioritised


## ADDED Requirements

### Requirement: Task page
A task opened from a list SHALL remember that list: its address, its name, its tasks in display order and its scroll position. The page SHALL show the task's place in that list as "n / m" with controls for the next and previous task, and `j` and `k` SHALL open the next and previous task in place, so Escape still returns in one step. Escape (outside a text field and outside an overlay), Close and the phone's Back SHALL return to that list with the task selected and the list scrolled where it was. A task opened from outside a list (a reminder, a notification, the command palette) SHALL return to the task's own list (its project, or the Inbox); a task opened from its address alone (a reload, a link) SHALL show no place in a list and SHALL return to the task's own list with the task selected. Addresses of the form `?task=<id>` SHALL keep working and open the task's page over the page in the address.

#### Scenario: Step through a list
- **WHEN** the user opens the second of three tasks in a project and presses `j`
- **THEN** the third task's page shows "3 / 3", the next control is disabled, and a further `j` does nothing

#### Scenario: Back to the same spot
- **WHEN** the user scrolled Upcoming down, opened a task, stepped to the next one with `j` and pressed Escape
- **THEN** Upcoming shows at the same scroll position with the task last shown selected, and the browser's history holds no extra entry

#### Scenario: Opened from a link
- **WHEN** the user opens `/task/<id>` of a task in the Inbox from a bookmark and chooses Close
- **THEN** the Inbox opens with that task selected

#### Scenario: Older link
- **WHEN** the user opens `/upcoming?task=<id>`
- **THEN** the task's page opens, and Escape returns to Upcoming

### Requirement: Task facts column
The task page SHALL show the task's properties in a facts column of labelled rows under the headings Schedule (Do, Start, Deadline, Reminder, Repeat), Details (Priority, Estimate, Assignee when the account can assign, Blocked by, Blocks when something waits for the task, Location), Labels and Project (project, section when the project has sections or the task has one, parent task, origin when it has one). A row with a value SHALL read in the list row's words; a row without one SHALL read as the action that sets it ("Set a deadline", "Add a place", "Doesn’t repeat") in a quiet tone. Activating a row SHALL open the same editor the facet part opens (see "Facet editors are popovers"), anchored to the row, and write the same operation. The list keys that open an editor (`d`, `Shift+N`, `b`, `e`) SHALL open the task page with that row's editor open. For a viewer every row SHALL be text and rows without a value SHALL be hidden.

#### Scenario: Set a deadline from its row
- **WHEN** the user activates "Set a deadline" on a task's page
- **THEN** the When editor opens on its Deadline segment anchored to the row, and a picked date reads in the row afterwards

#### Scenario: Deadline from the list
- **WHEN** a task is selected in Today and the user presses `d`
- **THEN** the task's page opens with the When editor on its Deadline segment and the date field focused

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the facts read as text, no row opens an editor, and no unset fact is listed
