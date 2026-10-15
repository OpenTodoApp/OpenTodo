# Spec Delta

## MODIFIED Requirements

### Requirement: Comment thread in the client
The task detail panel SHALL show the comment threads in its Comments tab, oldest first, with the composer pinned to the bottom of the panel below the newest thread, and reply, edit and delete actions, and a comment count on task rows and on the tab. An empty thread SHALL be one line of text above the composer, not a card. Everything SHALL be reachable with the keyboard and SHALL render from local storage so threads are readable and writable offline.

#### Scenario: Keyboard-only comment
- **WHEN** the user focuses the composer with its shortcut, types a body and presses the submit key combination
- **THEN** the comment is posted and the composer clears, with no mouse interaction

#### Scenario: Count on rows
- **WHEN** a task has three comments
- **THEN** its row shows a comment indicator with the number three

#### Scenario: Chronological reading
- **WHEN** a task has comments posted on Monday, Tuesday and Wednesday
- **THEN** the Comments tab lists Monday's thread first and Wednesday's last, directly above the composer

#### Scenario: Empty thread
- **WHEN** a task has no comments
- **THEN** the tab reads "No comments yet" in one line and the composer is visible beneath it without scrolling
