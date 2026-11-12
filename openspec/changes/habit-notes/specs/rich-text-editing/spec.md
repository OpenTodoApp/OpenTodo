## ADDED Requirements

### Requirement: Checklist items become habits
While Habits is on, in a project note or a standalone note, **Make habits** (the slash menu and the context menu, next to Make tasks) on a check-list line or a selection SHALL create one habit per check-list line, at most 50 at once, reading the line with quick-add syntax: a calendar repeat rule in the line is kept, a line without one gets `every day`, and a completion-relative rule makes that line a plain task instead, named in the result. Each line SHALL become a link to its habit. Habits SHALL be created in the note's project, or with no project for a standalone note without one. One Undo SHALL take back the habits and the lines. It SHALL work offline and converge as the created tasks and the note edit do. While Habits is off or not decided, **Make habits** SHALL not be offered.

#### Scenario: A morning routine note
- **WHEN** the note "Morning routine" holds the check-list lines "Drink water", "Stretch every weekday" and "Journal" and the user chooses Make habits on all three
- **THEN** three habits exist with `every day`, `every weekday` and `every day`, each line links to its habit, and one Undo removes the habits and restores the lines

#### Scenario: A completion-relative line
- **WHEN** a selected line reads "Water the plants every 3 days after completion"
- **THEN** that line becomes a plain repeating task, and the result says it could not be a habit

#### Scenario: Offline
- **WHEN** the device is offline and the user makes two habits from a note
- **THEN** both exist at once and reach the other devices on the next sync
