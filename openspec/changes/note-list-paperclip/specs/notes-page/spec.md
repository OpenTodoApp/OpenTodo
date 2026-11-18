## ADDED Requirements

### Requirement: Files show in the notes list
A row of the notes list SHALL show, after the note's title, a paperclip and the number of the note's live files when it has any: a standalone note's own files, and for a task's note the task's files, its comments' files included. A row without files, and a project note, SHALL show none. The paperclip SHALL be named with the number of files ("2 attachments") for assistive technology, and the number SHALL follow a file added or removed on any device without a reload.

#### Scenario: A note with files
- **WHEN** the standalone note "Recipe" holds two files and the note "Ideas" none
- **THEN** the row "Recipe" shows a paperclip and 2, named "2 attachments", and the row "Ideas" shows no paperclip

#### Scenario: A task's note
- **WHEN** the task "Plan the trip" has notes and one attached file
- **THEN** its row in the notes list shows a paperclip and 1

#### Scenario: A file added
- **WHEN** a third file is added to "Recipe"
- **THEN** its row shows 3 without a reload
