## MODIFIED Requirements

### Requirement: Task detail panel
Opening a task SHALL show it as its own page at `/task/<id>` (see "Task page") for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The page SHALL show every property in its facts column, a property without a value as a quiet action that sets it (see "Task facts column"). A task SHALL open from Enter on a selected row, from Open details or `Shift+Enter` in the inline editor, and from a click on a row's title when the inline editor does not apply (see `task-list-presentation` "Inline title editing"). Only a page that keeps a split (Process the Inbox, and the Inbox itself, see `inbox-triage` "Inbox list and detail") SHALL show the task in the shell's panel slot beside its content instead, and only from 1024 px; below that it opens the page too. On the Inbox the task under the cursor shows beside the list, a click on a title shows it there instead of editing it in place, and Enter opens its page. Where another capability says the task panel or the detail panel, it means the task page, or the docked panel on a page that keeps a split.

#### Scenario: Open from the list
- **WHEN** the user presses Enter on a selected task, or taps a task's title on a touch screen
- **THEN** the task opens as its page, the address is `/task/<id>`, and nothing is docked beside the list

#### Scenario: Click edits in place on a desktop
- **WHEN** the user clicks a task's title in Today with a mouse on a 1280 px wide screen
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

#### Scenario: The Inbox keeps its split
- **WHEN** the user selects a task in the Inbox on a 1280 px wide screen, then presses Enter
- **THEN** the task shows in the panel beside the list, then opens as its page at `/task/<id>`
