## ADDED Requirements

### Requirement: Sentence-card editor
The routine editor SHALL show a routine as cards stacked in one column, phone first: a When card (the trigger and its conditions) and one card per step, each read as a sentence in the user's language whose inputs are buttons ("Create tasks from **the lines** in **Errands**"). If/Otherwise and Repeat for each SHALL show their blocks indented under them. On a phone the editor SHALL be a page and on a computer a wide dialog with the same content. A rule written before routines SHALL open as a When card and one Change tasks card holding the rule's action controls, and saving it with one card SHALL keep it in the rule form so older devices can edit it. Saving SHALL write the routine as operations, offline included, converging like any rule edit.

#### Scenario: Reading a routine
- **WHEN** the user opens "Groceries" on a 390 px phone
- **THEN** the page shows "Every Friday at 17:00", "Get the task Groceries", "Get the note text of Groceries", "Split the note text into lines", "Create tasks from the lines in Errands", one under the other, without sideways scrolling

#### Scenario: An old rule
- **WHEN** the user opens the rule "Label waiting → move to Waiting" and saves it without a change
- **THEN** the editor showed a When card and a Change tasks card, and nothing was written

#### Scenario: Saved offline
- **WHEN** the device is offline and the user adds a Count step and saves
- **THEN** the routine shows the new card at once, and every device shows it after sync

### Requirement: Pickers and output chips
Tapping an input word SHALL open its picker: the Combobox for projects, sections, labels, views, tasks and webhooks (from local data), a text field with an Insert menu of chips for text, date and number fields, the condition rows with their live count, and the filter field for queries. Each card SHALL end with its output, and pickers SHALL offer the outputs of earlier visible steps of an accepted type as chips, nearest first, with outputs of other types listed separately with their conversion. Inside a Repeat block the current item SHALL be offered as a chip.

#### Scenario: A chip from an earlier step
- **WHEN** the user taps the text word of a Notify me card after a Count step
- **THEN** the Insert menu offers "the count" and inserting it shows the chip in the text

#### Scenario: Only fitting outputs
- **WHEN** the user taps the "from" word of Create tasks after Find tasks and Split into lines
- **THEN** "the lines" is offered first, and "the tasks" is listed under "Needs conversion" with "Insert Format text"

### Requirement: Live preview per step
Each card SHALL show a preview of its output, refreshed shortly after every change: computed on the device from local data for text, list, logic and Change tasks steps (offline and on encrypted accounts included), and through the draft test route for the other steps while online, with "Preview needs a connection" otherwise. A preview SHALL show at most five items and the remaining count, or the number, date or the effect ("Would create 3 tasks in Errands", "Would email you"). A preview SHALL never write, send or log anything. A preview over a limit SHALL say so on the card.

#### Scenario: Preview offline
- **WHEN** the device is offline and the user adds Split into lines after Get note text of Groceries
- **THEN** the card previews the note's first five lines and "+ 2 more" from local data

#### Scenario: Nothing sent
- **WHEN** a card is Email me and its preview reads "Would email you"
- **THEN** no message is sent and no run is logged

#### Scenario: Over a limit
- **WHEN** the preview of Create tasks would create 620 tasks
- **THEN** the card reads "Would write 620 of 500" in the danger colour

### Requirement: Type errors with fixes
The editor SHALL type-check the routine on every change with the shared checker and show each error on its card, naming the input and both types, with a one-tap fix where one exists (insert Format text, Join, Count or Split into lines, wrap in Repeat for each, choose another value for a removed step). Applying a fix SHALL be one undoable edit. A routine with a type error SHALL not be saved until it is fixed.

#### Scenario: Fix in one tap
- **WHEN** Notify me reads the tasks of Find tasks and the card says "Notify expects Text, got Tasks"
- **THEN** tapping "Insert Format text" adds a Format text step (the tasks' titles, one per line) between them and the error is gone

#### Scenario: Removed step
- **WHEN** the user deletes the step whose output a later card uses
- **THEN** the later card shows "the lines no longer exists · Choose another value" and Save says "Fix step 3 first"

### Requirement: Add step
"+ Add step" SHALL open a search field over the step catalogue, matching names, descriptions and synonyms in the user's language and in English, with at most six suggestions of steps that accept the output type of the step above, and the catalogue's groups below. Steps that are not available SHALL be left out of the suggestions and groups and SHALL appear in search results dimmed with their hint and a link to the setting. The chosen step SHALL be inserted below the current card with its inputs pre-filled from the step above where the type fits.

#### Scenario: Suggestions after lines
- **WHEN** the user taps "+ Add step" under Split into lines
- **THEN** Create tasks, Filter, Count, Join, Sort and Take first are suggested

#### Scenario: Search for an unavailable step
- **WHEN** outgoing email is not set up and the user types "mail"
- **THEN** Email me is listed dimmed with "Set up email to use this" and a link, and is not in the Communication group

#### Scenario: Synonym in Italian
- **WHEN** an Italian user types "ripeti"
- **THEN** "Ripeti per ogni elemento" (Repeat for each) is found

### Requirement: Unavailable steps in the editor
A saved routine's card whose step is not available SHALL show "Not available: <reason>" with a link to the setting that fixes it, and the routine's row on the Routines page SHALL say how many steps are not available. The editor SHALL use the device's cached catalogue offline.

#### Scenario: Provider removed
- **WHEN** the owner removed outgoing email after the user saved a routine with Email me
- **THEN** that card reads "Not available: outgoing email is not set up on this server" with a link, and the row reads "1 step not available"

### Requirement: Test and save
The editor SHALL offer Test, which runs the draft as a logged test run that writes nothing and shows it step by step under the editor's header, Save, and for a saved routine Run now. Test and Run now need a connection and SHALL say so offline; Save SHALL not.

#### Scenario: Test a routine
- **WHEN** the user taps Test on "Groceries"
- **THEN** the run detail appears with each step's status and preview, marked "Test", and no task is created

### Requirement: Routine history and all runs
Each routine SHALL have a History tab and the Routines page a Runs tab listing all runs newest first, filterable by routine, outcome and source, 50 at a time with Show more. Each run SHALL show its time, source, who it ran as, test or real, outcome, writes and duration, and open a detail with the routine's cards as run: per step its status, duration, count, the items touched as links with titles resolved on the device ("Deleted task" by id when gone), the error with its fix and a link to the setting, tokens when an AI step ran, and Undo run. Offline the last fetched page SHALL be shown with its age.

#### Scenario: Run detail
- **WHEN** the user opens a failed run of "Weekly digest"
- **THEN** steps 1 and 2 are Done with counts, step 3 reads "Not available: outgoing email is not set up" with a link, and step 4 reads "Not run"

#### Scenario: Undo from the detail
- **WHEN** the user taps Undo run on a run that moved eleven tasks
- **THEN** the engine's answer is shown ("10 restored, 1 kept because it changed after the run") and the run is marked Undone

#### Scenario: Offline history
- **WHEN** the user opens History without a connection
- **THEN** the runs fetched earlier are listed with "Updated 2 h ago" and Undo is disabled with "Needs a connection"

### Requirement: Editor keyboard and accessibility
Every card SHALL be a group named by its sentence and every input word a button whose accessible name gives the input and its value; pickers SHALL be the labelled Combobox and fields of `web/src/ui`; test results SHALL be announced politely. The editor SHALL be usable by keyboard alone with shortcuts registered in the registry and checked for conflicts: `Alt+↑` and `Alt+↓` move the focused card, `Ctrl+Enter` saves, `Ctrl+Shift+Enter` tests, `a` adds a step below the focused card, arrow keys move between words of a card, Escape closes a picker and then the editor. Touch targets SHALL be at least 44 px. Every string SHALL be in the six languages, and the editor SHALL load only when opened.

#### Scenario: Keyboard only
- **WHEN** a user tabs to the Count card and presses `Alt+↑`
- **THEN** the card moves above the previous step, focus stays on it, and the move is announced

#### Scenario: Screen reader
- **WHEN** a screen reader reaches the project word of Create tasks
- **THEN** it reads "Project: Errands, button"

#### Scenario: Lazy
- **WHEN** a user opens Today
- **THEN** none of the editor's code is loaded until the user opens Routines or a routine
