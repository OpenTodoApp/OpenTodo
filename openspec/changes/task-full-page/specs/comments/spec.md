## MODIFIED Requirements

### Requirement: Composer behaviour
The composer SHALL rest as a single line and expand when focused, when it holds a draft or a reply target, or when its shortcut is pressed. Expanded, it SHALL be the rich-text editor of this app (the one used for notes) with the editing features of `rich-text-editing` except Make subtask, SHALL grow with its content up to a limit, keep @-mention completion, show the submit key combination, sit in the shared composer frame (a bordered box with the field, the tools on the left and a round Send control on the right, the same frame the assistant composer is built to use), keep an unsent draft per task on the device while the task is not open, and show the reply target with a way to cancel it when replying. While the editor is still loading on a device that has never opened it, typed text SHALL be kept in a plain field and submitted as plain Markdown if the user submits first. The composer SHALL serialise to Markdown on submit within the documented subset, and editing an existing comment SHALL open its Markdown in the editor so that a comment opened and submitted unchanged keeps the same body.

#### Scenario: Draft survives closing the panel
- **WHEN** the user types a comment, returns to the list without sending and reopens the task on the same device
- **THEN** the draft is still in the expanded composer, and it is not visible on other devices

#### Scenario: Cancel a reply
- **WHEN** the user chooses Reply on a comment and then cancels the reply target
- **THEN** the composer posts a new top-level comment instead

#### Scenario: Collapses when left empty
- **WHEN** the user focuses the composer, types nothing and moves focus elsewhere
- **THEN** the composer returns to its single resting line

#### Scenario: Formatting from the keyboard
- **WHEN** the user expands the composer, types `- ` and some text, selects a word and presses the bold shortcut, then submits with the key combination
- **THEN** the stored body is `- …**word**…` Markdown and the thread shows a bullet with the bold word, with no mouse interaction

#### Scenario: Unchanged edit is byte-identical
- **WHEN** the author opens Edit on a comment whose body uses only the documented subset and submits without changing anything
- **THEN** no operation is produced, because the serialised body equals the stored body

#### Scenario: Text outside the subset survives an edit
- **WHEN** the author edits a comment whose body contains `<details>` HTML and a footnote reference, changes one word elsewhere and submits
- **THEN** the HTML and the footnote text are still in the body verbatim, shown as text, and only the word changed

#### Scenario: Send control
- **WHEN** the composer is expanded and empty
- **THEN** its round Send control is disabled and named after the action ("Comment", "Reply", "Save"), and typing text enables it
