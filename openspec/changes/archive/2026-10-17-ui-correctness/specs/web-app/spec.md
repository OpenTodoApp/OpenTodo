# Spec Delta

## ADDED Requirements

### Requirement: Date-dependent views follow the clock
Today, Upcoming, Anytime, the Logbook headings, the habit streaks and the sidebar counts SHALL move to the new day within a minute of local midnight (and on a change of time zone) while the app stays open, without a reload or a data change. This is local: it works offline, and no operation is written.

#### Scenario: Midnight with the app open
- **WHEN** the app shows Today at 23:58 and a task is due tomorrow
- **THEN** shortly after midnight the task is listed in Today and the sidebar's Today count includes it

### Requirement: Editing shortcuts respect the role
Every list shortcut that changes a task (including skip occurrence, this occurrence only, schedule in the Day view and edit estimate) SHALL do nothing for a task in a project where the user is a viewer, so no local change is made that the server would refuse. Shortcuts that only move the selection or open a task keep working.

#### Scenario: Viewer presses skip
- **WHEN** a viewer selects a recurring task of a shared project and presses Shift+K, Shift+O, s or e
- **THEN** the task is unchanged on the device, no copy is created, the Day view does not open and the panel does not open on the estimate

### Requirement: List actions report failures
An action started from the task list (a bulk key, park, duplicate, this occurrence only, adding a subtask, completing from the panel) that fails SHALL show its message as a toast instead of failing silently.

#### Scenario: Refused duplicate
- **WHEN** duplicating the selected task fails
- **THEN** a toast shows the reason and the list is unchanged
