## MODIFIED Requirements

### Requirement: Add step
"+ Add step" SHALL expand the step catalogue in place, never as a dialog: under the button pressed (at the end of the steps, or at the end of a Then, Otherwise or Repeat block), or between the card and the next one for "Add step below". The catalogue SHALL be the list the word pickers use, with its search field focused: matching names, descriptions and synonyms in the user's language and in English, with at most six suggestions of steps that accept the output type of the step above (inside a Repeat block, the type of its item; for a first step, the trigger's output), and the catalogue's groups below, each under its heading; arrow keys move, Enter chooses. Escape, its close button or the same "+ Add step" SHALL collapse it with focus back on what opened it, and the button SHALL announce it (`aria-expanded`). Get a specific task SHALL never be suggested nor shown among a group's first entries. Steps that are not available SHALL be left out of the suggestions and groups and SHALL appear under the search results dimmed with their hint and a link to the setting. The chosen step SHALL be inserted at that place, with focus on its card, and its main input filled with the nearest flowing value that fits (`Data flows by default`).

#### Scenario: Suggestions after lines
- **WHEN** the user taps "+ Add step" under Split into lines
- **THEN** Create tasks, Pick, Count, Join, Sort and Add to a note are suggested

#### Scenario: Suggestions after tasks
- **WHEN** the user taps "+ Add step" under Find tasks
- **THEN** Change tasks, Add a comment, Pick, Sort, Count and Repeat for each are suggested

#### Scenario: Inside a Repeat
- **WHEN** the user adds Add a comment as the first step inside Repeat for each over Find tasks
- **THEN** the catalogue opened inside the Repeat block, and the card reads "Comment on ↳ each task"

#### Scenario: Search for an unavailable step
- **WHEN** outgoing email is not set up and the user types "mail"
- **THEN** Email me is listed dimmed with "Set up email to use this" and a link, and is not in the Communication group

#### Scenario: Synonym in Italian
- **WHEN** an Italian user types "ripeti"
- **THEN** "Ripeti per ogni elemento" (Repeat for each) is found

#### Scenario: In place, by keyboard
- **WHEN** the user presses "+ Add step" on a 1280 px screen, types "count" and presses Enter
- **THEN** the catalogue opened right under the button with no dialog, and the Count card is added at the end with focus on it

#### Scenario: Collapse
- **WHEN** the user focuses the Find tasks card, presses `a`, and then Escape
- **THEN** the catalogue opened between Find tasks and the next card, and Escape collapsed it with focus back on the Find tasks card

## ADDED Requirements

### Requirement: No dialogs in the routine editor
The routine editor SHALL open no centred or detached dialog for choosing or editing; choices SHALL open next to what was pressed and bigger editors inside the card from 1024 px, or as a bottom sheet below. The trigger word SHALL open the trigger kinds as the word pickers' list, anchored under the word at its start edge inside the content column (a bottom sheet below 640 px); choosing a kind that takes members (a schedule's time and days, a label, a project and section), or the current one again, SHALL open those members inside the When card with Done, focus moving into them and back to the word on Done or Escape. The When card's condition SHALL open as the condition rows of a step do. Deleting a step (its menu or the Delete key) SHALL remove it at once and offer Undo in a toast that puts the same step back in its place, with focus on a neighbouring card. A test that would call the AI SHALL ask in the Test panel, with the provider and the token estimate, Test and Cancel. On the Routines page, Describe it SHALL expand its field under the page's header, and collapse with Escape, Cancel or its button. Leaving with unsaved changes, deleting a whole routine and reviewing an AI proposal MAY keep their dialogs. Nothing here is stored: no offline or convergence behaviour changes.

#### Scenario: The trigger word
- **WHEN** the user taps "Only when I run it" on a 1280 px screen
- **THEN** the list of triggers opens under the word at its start edge, inside the content column and not over the sidebar, with "Only when I run it" checked

#### Scenario: A schedule's details in the card
- **WHEN** the user chooses "On a schedule" and then Mon
- **THEN** the time and days open inside the When card with focus on the first of them, no dialog opens, and Escape closes them with the word reading Monday and focus on it

#### Scenario: Delete with Undo
- **WHEN** the user presses Delete on the focused Repeat for each card and then Undo in the toast
- **THEN** the card is gone at once without a question, focus is on the next card, and Undo puts Repeat for each back where it was

#### Scenario: Test with AI
- **WHEN** the user tests a routine with an Ask AI step
- **THEN** the Test panel asks "Test with AI?" with the provider and the tokens, and no dialog opens

#### Scenario: Describe it in place
- **WHEN** the user presses Describe it on the Routines page
- **THEN** the field opens under the header, the button reads as expanded, and no dialog opens
