## ADDED Requirements

### Requirement: Routine editor page
The routine editor SHALL be a page at `/routines/<id>` for a saved routine and `/routines/new` for a new one, opened from the Routines page, the command palette, a view or a board column, and working from a link and on reload; `/rules/...` addresses SHALL redirect to it and `/routines/<id>?run=<run>` SHALL open that run on the page. The page SHALL have a sticky header with a breadcrumb (Routines › the routine's name) and Back to the Routines list, and Save, Test and, for a saved routine, Run now with an indicator of unsaved changes; on a phone the actions SHALL sit in a sticky bar at the bottom of the page. From 1024 px the steps SHALL be the main column at a reading width, centred, beside a secondary column with the test result, the routine's history and a run's detail; below 1024 px one column SHALL switch between Steps, Test and History with tabs. Save SHALL keep the user on the page; saving a new routine SHALL move the address to its id. Leaving the page with unsaved changes (Back, the breadcrumb, Escape, another page, the browser's Back) SHALL ask "Discard your changes?" first, and closing the tab SHALL get the browser's prompt. Focus SHALL move to the page heading when it opens and return to the routine's row on the Routines page after Back. The page is device-local UI: saving writes operations as before, offline included, and converges like any rule edit.

#### Scenario: From a link
- **WHEN** the user opens `/routines/<id>` of "Groceries" in a new tab
- **THEN** the page shows the breadcrumb "Routines › Groceries" and the routine's cards, and reloading shows the same

#### Scenario: Old address
- **WHEN** the user opens `/rules/<id>`
- **THEN** the address becomes `/routines/<id>` and the editor page opens

#### Scenario: Unsaved changes
- **WHEN** the user renames the routine and presses Back
- **THEN** "Discard your changes?" is asked, Cancel keeps the edit on the page, and Discard returns to the Routines list with focus on the routine's row

#### Scenario: Save a new routine
- **WHEN** the user adds a step to a new routine and presses `Ctrl+S`
- **THEN** the routine is saved, the address becomes `/routines/<id>`, the indicator clears, and Run now and History appear

#### Scenario: Wide screen
- **WHEN** a routine with eight steps is open at 1440 px and the user runs Test
- **THEN** the cards stay in the centred main column and the result appears in the column beside them, with no dialog

#### Scenario: Phone
- **WHEN** the page is open at 360 px
- **THEN** one column shows the cards without sideways scrolling and Save, Test and Run now stay reachable in the bar at the bottom

## MODIFIED Requirements

### Requirement: Sentence-card editor
The routine editor SHALL show a routine as cards stacked in one column, phone first: a When card (the trigger and its conditions) and one card per step, each read as a sentence in the user's language whose inputs are buttons ("Create tasks from **the lines** in **Errands**"). If/Otherwise and Repeat for each SHALL show their blocks indented under them. The editor SHALL be a page on every screen size (see "Routine editor page"), never a dialog. A rule written before routines SHALL open as a When card and one Change tasks card holding the rule's action controls, and saving it with one card SHALL keep it in the rule form so older devices can edit it. Saving SHALL write the routine as operations, offline included, converging like any rule edit. A message about a failed save SHALL disappear as soon as the routine is edited.

#### Scenario: Reading a routine
- **WHEN** the user opens "Groceries" on a 390 px phone
- **THEN** the page shows "Every Friday at 17:00", "Get the task Groceries", "Get the note text of Groceries", "Split the note text into lines", "Create tasks from the lines in Errands", one under the other, without sideways scrolling

#### Scenario: An old rule
- **WHEN** the user opens the rule "Label waiting → move to Waiting" and saves it without a change
- **THEN** the editor showed a When card and a Change tasks card, and nothing was written

#### Scenario: Saved offline
- **WHEN** the device is offline and the user adds a Count step and saves
- **THEN** the routine shows the new card at once, and every device shows it after sync

#### Scenario: Stale save message
- **WHEN** Save said "A routine needs at least one step" and the user then adds a step
- **THEN** the message is gone

### Requirement: Test and save
The editor SHALL offer Test, which runs the draft as a logged test run that writes nothing and shows it step by step in the page's Test column (the Test tab below 1024 px), Save, and for a saved routine Run now. Test and Run now need a connection and SHALL say so offline; Save SHALL not.

#### Scenario: Test a routine
- **WHEN** the user taps Test on "Groceries"
- **THEN** the run detail appears with each step's status and preview, marked "Test", and no task is created

### Requirement: Routine history and all runs
Each routine SHALL have a History view on its editor page and the Routines page a Runs tab listing all runs newest first, filterable by routine, outcome and source, 50 at a time with Show more. Each run SHALL show its time, source, who it ran as, test or real, outcome, writes and duration, and open a detail with the routine's cards as run: per step its status, duration, count, the items touched as links with titles resolved on the device ("Deleted task" by id when gone), the error with its fix and a link to the setting, tokens when an AI step ran, and Undo run. A run of a live routine SHALL open on that routine's page, inline in its History, at `/routines/<id>?run=<run>`. Offline the last fetched page SHALL be shown with its age.

#### Scenario: Run detail
- **WHEN** the user opens a failed run of "Weekly digest"
- **THEN** steps 1 and 2 are Done with counts, step 3 reads "Not available: outgoing email is not set up" with a link, and step 4 reads "Not run"

#### Scenario: Undo from the detail
- **WHEN** the user taps Undo run on a run that moved eleven tasks
- **THEN** the engine's answer is shown ("10 restored, 1 kept because it changed after the run") and the run is marked Undone

#### Scenario: Offline history
- **WHEN** the user opens History without a connection
- **THEN** the runs fetched earlier are listed with "Updated 2 h ago" and Undo is disabled with "Needs a connection"

#### Scenario: A run from the Runs tab
- **WHEN** the user opens a run of "Groceries" from the Routines page's Runs tab
- **THEN** the Groceries page opens with that run's detail in its History

### Requirement: Editor keyboard and accessibility
Every card SHALL be a group named by its sentence and every input word a button whose accessible name gives the input and its value; pickers SHALL be the labelled Combobox and fields of `web/src/ui`; test results SHALL be announced politely. The editor SHALL be usable by keyboard alone with shortcuts registered in the registry and checked for conflicts: `Alt+↑` and `Alt+↓` move the focused card, `Ctrl+S` and `Ctrl+Enter` save, `Ctrl+Shift+Enter` tests, `a` adds a step below the focused card, arrow keys move between words of a card, Escape closes a picker and then leaves the page (asking first when there are unsaved changes). Touch targets SHALL be at least 44 px. Every string SHALL be in the six languages, and the editor SHALL load only when opened.

#### Scenario: Keyboard only
- **WHEN** a user tabs to the Count card and presses `Alt+↑`
- **THEN** the card moves above the previous step, focus stays on it, and the move is announced

#### Scenario: Screen reader
- **WHEN** a screen reader reaches the project word of Create tasks
- **THEN** it reads "Project: Errands, button"

#### Scenario: Lazy
- **WHEN** a user opens Today
- **THEN** none of the editor's code is loaded until the user opens Routines or a routine

#### Scenario: Save key
- **WHEN** the user presses `Ctrl+S` in the editor
- **THEN** the routine is saved and the browser's save dialog does not open
