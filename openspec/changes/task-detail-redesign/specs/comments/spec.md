## MODIFIED Requirements

### Requirement: Comment thread in the client
The task detail panel SHALL show the comment threads in its Comments tab, oldest first, with the composer after the newest thread, and reply, edit and delete actions, and a comment count on task rows and on the tab. Everything SHALL be reachable with the keyboard and SHALL render from local storage so threads are readable and writable offline.

#### Scenario: Keyboard-only comment
- **WHEN** the user focuses the composer with its shortcut, types a body and presses the submit key combination
- **THEN** the comment is posted and the composer clears, with no mouse interaction

#### Scenario: Count on rows
- **WHEN** a task has three comments
- **THEN** its row shows a comment indicator with the number three

#### Scenario: Chronological reading
- **WHEN** a task has comments posted on Monday, Tuesday and Wednesday
- **THEN** the Comments tab lists Monday's thread first and Wednesday's last, directly above the composer

## ADDED Requirements

### Requirement: Readable comment presentation
Each comment SHALL show the author's avatar initials and name, a relative time with the absolute time in the user's date and time format on hover and focus, an "edited" marker when edited, and the body with comfortable line length and spacing. Reply, Edit and Delete SHALL be visible on hover and focus and always on touch devices. Replies SHALL be indented under their comment with a connecting line.

#### Scenario: Absolute time on focus
- **WHEN** the user focuses the relative time "2 h ago" of a comment
- **THEN** the full date and time are announced and shown in the user's chosen format

#### Scenario: Actions on touch
- **WHEN** the user views a comment on a phone
- **THEN** Reply is visible without hovering, and Edit and Delete are visible on the user's own comments

### Requirement: Composer behaviour
The composer SHALL grow with its content up to a limit, keep @-mention completion, show the submit key combination, keep an unsent draft per task on the device while the panel is closed, and show the reply target with a way to cancel it when replying.

#### Scenario: Draft survives closing the panel
- **WHEN** the user types a comment, closes the panel without sending and reopens the task on the same device
- **THEN** the draft is still in the composer, and it is not visible on other devices

#### Scenario: Cancel a reply
- **WHEN** the user chooses Reply on a comment and then cancels the reply target
- **THEN** the composer posts a new top-level comment instead
