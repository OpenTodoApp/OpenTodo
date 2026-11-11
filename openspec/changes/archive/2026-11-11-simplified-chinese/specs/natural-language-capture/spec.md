## ADDED Requirements

### Requirement: Composition is not a commit
In quick add, and while a task title is being edited, Enter SHALL NOT create the task, save the title or apply parsed attributes while an input method is composing. Enter after composition has ended SHALL commit as that field already specifies. This SHALL hold in every interface language. It SHALL hold offline, and it SHALL store nothing of its own.

#### Scenario: Quick add while composing
- **WHEN** an input method is composing in quick add and the user presses Enter
- **THEN** no task is created and the field keeps what was being composed

#### Scenario: Title while composing
- **WHEN** an input method is composing in a task title and the user presses Enter
- **THEN** the title is not saved and no parsed attribute is applied

#### Scenario: Enter after composition
- **WHEN** composition has ended and the user presses Enter on a quick-add line
- **THEN** the task is created as it is for a line typed without an input method, including while the device is offline
