# Spec Delta

## MODIFIED Requirements

### Requirement: Readable comment presentation
Each comment SHALL show the author's avatar initials and name, a relative time with the absolute time in the user's date and time format on hover and focus, an "edited" marker when edited, and the body with comfortable line length and spacing. Reply, Edit and Delete SHALL take no space at rest: on a fine pointer they SHALL appear on hover and focus at the end of the comment's header line; on touch devices they SHALL be reachable at all times from one "More actions" control on that line. Root comments SHALL be spaced as one thread, without empty rows between them. Replies SHALL be indented under their comment with a connecting line. A comment the user has just posted SHALL be scrolled into view.

#### Scenario: Absolute time on focus
- **WHEN** the user focuses the relative time "2 h ago" of a comment
- **THEN** the full date and time are announced and shown in the user's chosen format

#### Scenario: Actions on touch
- **WHEN** the user views a comment on a phone
- **THEN** a "More actions" control is visible on the comment's header line, and it offers Reply, and Edit and Delete on the user's own comments

#### Scenario: No gaps in the thread
- **WHEN** a task with 14 one-line comments is open on a 1280×800 screen and the pointer is not over the thread
- **THEN** consecutive comments are at most 24 px apart, and hovering a comment does not change the position of any other comment

#### Scenario: Posted comment in view
- **WHEN** the user posts a comment on a task with 30 comments
- **THEN** the new comment is visible above the composer without scrolling
