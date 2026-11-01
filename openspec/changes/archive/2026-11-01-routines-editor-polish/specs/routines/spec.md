## MODIFIED Requirements

### Requirement: Pickers and output chips
Tapping an input word SHALL open its picker next to the word, never as a centred modal:
- **Choices** (a value that flows into the step, a project, a section, labels, a view, a webhook, a mode such as Pick's, a date, a number): a compact list anchored to the word's start edge, below it when there is room and shifted to stay inside the viewport (a bottom sheet below 640 px), with a search field, arrow keys, Enter to choose, Escape to close, and focus back on the word. The chosen entry SHALL be marked as a row with a check, in the anchored list and in the sheet. The list SHALL offer, as values of an accepted type (a list counts for a one-task input), the enclosing Repeat's item ("each task", "each line") first, then the outputs of earlier visible steps nearest first, then the trigger's output ("the task that triggered", "the matching tasks", "the date", or "the task you run it on" for a manual routine). Outputs of other types SHALL be listed under "Needs conversion" with their conversion. The fixed targets of the input follow. A task or tasks input SHALL offer "Find tasks…", which inserts a Find tasks step above and reads it, and a one-task input "A specific task…", last, which only then lists tasks. A date, a number, a test or a text to match SHALL have its small field under the list.
- **Text** (a comment, a notification, a note, a format): edited in place in the card, in a field that grows with the text; "/" opens the list of values at the caret and "+ value" at its button, below the field when there is room, each with the nearest flowing value active, and inserts a value of an earlier step, shown as «its name» in the field; on a phone the sheet SHALL show the text being edited at its top. Enter, leaving the field and Escape keep the text, Shift+Enter starts a new line; Escape SHALL never discard typed text (with the value list open, Escape closes the list first). Outside the field the word SHALL show the whole text, wrapped, with each value as a chip; a text over 280 characters SHALL be kept to four lines with Show more.
- **Bigger editors** (condition rows, the changes of Change tasks): inside the card under its sentence from 1024 px, a bottom sheet sized to its content below, which opens without moving focus onto its first control and keeps Done visible at its bottom edge. Condition rows SHALL be laid out as one grid: each name in the same style in the first column, each control the full width of the second.

A word SHALL announce its picker (`aria-haspopup`, `aria-expanded`), lists SHALL be listboxes with options, and a choice SHALL be announced. A word is a target inside running text: it SHALL be at least 44 px high on touch screens and as wide as its word, without space added after it. Each card SHALL end with its output. The word of an empty task input SHALL read "choose which tasks"; an error on an empty input ("needs a value here") SHALL open the same picker.

#### Scenario: A chip from an earlier step
- **WHEN** the user taps the text word of a Notify me card after a Count step and chooses "+ value", then "the count"
- **THEN** the text is edited in the card, «the count» is inserted where the cursor was, Enter keeps it, and the word shows "the count" as a chip inside the text

#### Scenario: Only fitting outputs
- **WHEN** the user taps the priority word of Create tasks after Find tasks and Count
- **THEN** a list opens next to the word with "the count" first, "the tasks" under "Needs conversion" with "Insert Count", and a number field under the list

#### Scenario: A list fits a one-task input
- **WHEN** the user taps the task word of Add a comment after Find tasks
- **THEN** "the tasks" is offered as a fitting value, not under "Needs conversion"

#### Scenario: Keyboard
- **WHEN** the user focuses the task word of Add a comment, presses Enter, types "pick", presses Enter and then Escape on another word's list
- **THEN** the list opens with its search focused, "the picked task" is chosen and announced, and Escape closes the other list with focus back on its word

#### Scenario: Escape keeps the text
- **WHEN** the user types "x and more" into a Notify me text, presses "/", Escape, and Escape again
- **THEN** the first Escape closes the list of values with focus back in the field, and the second leaves the field with "x and more" kept

#### Scenario: Values at the caret
- **WHEN** the user presses "/" in the comment text of a step inside Repeat for each
- **THEN** the list opens at the caret, below the field when there is room, with "each task" first and active

#### Scenario: Pick's mode
- **WHEN** the user taps the mode word of a Pick card on a 1280 px screen
- **THEN** the list opens at the word's start edge inside the page, and the current mode is a row with a check

#### Scenario: Condition rows in the card
- **WHEN** the user taps the condition word of Find tasks on a 1280 px screen, and then on a 768 px screen
- **THEN** the condition rows open inside the card under its sentence on the wide screen, and as a bottom sheet on the narrower one, never as a centred dialog, with every select the same width and Done in reach

#### Scenario: Layout at three widths
- **WHEN** the layout check opens the routine page at 360, 768 and 1280 px and opens the Project word of Create tasks
- **THEN** the list stays inside the viewport, closes with Escape and a tap outside, and the page has no sideways scroll

### Requirement: Type errors with fixes
The editor SHALL type-check the routine on every change with the shared checker and show each error on its card, naming the input and both types, with a one-tap fix where one exists. An empty required input ("needs a value here") SHALL not be shown as an error while the step is being filled in: it SHALL show once focus has left the step's card or Save was pressed, SHALL be hidden while that input's text is being typed, and SHALL clear as soon as the input has a value. The fixes SHALL be: insert Format text, Join, Count or Split into lines; wrap in Repeat for each when two lists reach one step; use the nearest flowing value for an empty input or one whose step was removed; insert Find tasks for a task input with nothing flowing; choose another value otherwise. A fix SHALL never insert a task chosen by hand or a Get a specific task step. Applying a fix SHALL be one undoable edit. A routine with a type error SHALL not be saved until it is fixed.

#### Scenario: Fix in one tap
- **WHEN** Notify me reads the tasks of Find tasks and the card says "Notify expects Text, got Tasks"
- **THEN** tapping "Insert Format text" adds a Format text step (the tasks' titles, one per line) between them and the error is gone

#### Scenario: Removed step
- **WHEN** the user deletes the Split into lines step whose output a later Create tasks card uses, and no other lines flow there
- **THEN** the later card shows "the lines no longer exists · Choose another value" and Save says "Fix step 3 first"

#### Scenario: Empty task input
- **WHEN** a Comment card's task input is empty after Find tasks (for example after its step was removed and re-added by keyboard) and focus has left the card
- **THEN** the card offers "Use the tasks", and tapping it fills the input with the Find tasks output

#### Scenario: Nothing flowing
- **WHEN** a manual routine's first step is Add a comment, nothing flows into it, and focus has left the card
- **THEN** the card offers "Find tasks…", which inserts a Find tasks step above it and reads its tasks, and never a task picker

#### Scenario: A new step is not an error yet
- **WHEN** the user adds a Notify me step after Find tasks
- **THEN** its card shows no error while it has focus, shows "needs a value here" once focus moves elsewhere or Save is pressed, and the error goes as soon as a text is kept
