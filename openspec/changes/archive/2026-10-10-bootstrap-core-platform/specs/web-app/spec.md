# Spec Delta

## Purpose

Defines the installable client: the views it offers, quick capture, keyboard navigation, the detail panel, settings and the small-screen layout.

## ADDED Requirements

### Requirement: Installable progressive web app
The client SHALL ship a web app manifest and a service worker that precaches the application shell, so it can be installed to a home screen and opened offline. API responses SHALL never be served from the service worker cache.

#### Scenario: Install and open offline
- **WHEN** the user installs the app, then opens it without network
- **THEN** the shell loads and shows locally stored tasks

### Requirement: Standard views
The client SHALL provide Inbox (open tasks without a project), Today (open tasks due today or earlier, with overdue tasks grouped first), Upcoming (open tasks due after today grouped by date), Completed (most recent completions), and one view per project (its open tasks).

#### Scenario: Overdue grouping
- **WHEN** Today is opened and there are tasks due before today
- **THEN** they are listed under an "Overdue" heading above today's tasks

#### Scenario: Upcoming grouping
- **WHEN** Upcoming is opened
- **THEN** tasks are grouped by due date with "Tomorrow" and weekday headings in ascending order

### Requirement: Task detail panel
Opening a task SHALL show a panel for editing title, notes, project, priority and due date and time, with complete, delete and close actions. On narrow screens the panel SHALL overlay the list.

#### Scenario: Open from the list
- **WHEN** the user clicks a task's title or presses Enter on a selected task
- **THEN** the detail panel opens with that task's fields

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` focuses quick add, `j`/`k` (or arrows) move the selection, Enter opens, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` followed by `i`/`t`/`u`/`c`/`s` navigates, Escape closes the panel or clears the selection, and `?` shows the shortcut list. Shortcuts SHALL not fire while typing in a field.

#### Scenario: Navigate with g then t
- **WHEN** focus is not in a text field and the user presses `g` then `t`
- **THEN** the Today view opens

#### Scenario: Typing is not intercepted
- **WHEN** the user types the letter `c` into the quick-add field
- **THEN** no task is completed

### Requirement: Account screens
The client SHALL show the owner setup form on a fresh server, a sign-in form otherwise, a sign-up option only when the server allows it, and SHALL show server-side error messages verbatim.

#### Scenario: Setup on fresh server
- **WHEN** the client loads against a server that reports setup required
- **THEN** the create-owner form is shown and no sign-in form

### Requirement: Settings
A settings view SHALL show the signed-in account, let the user download the JSON export, create, list and revoke API tokens, and sign out. Signing out SHALL clear the local copy of the data on that device.

#### Scenario: Token shown once
- **WHEN** the user creates a token
- **THEN** the secret is displayed with a notice that it will not be shown again and the token appears in the list

### Requirement: Responsive layout and themes
The layout SHALL work from 360 px wide phones to desktops, with a collapsible sidebar on small screens, and SHALL follow the system light or dark preference.

#### Scenario: Phone layout
- **WHEN** the viewport is narrower than 768 px
- **THEN** the sidebar is hidden behind a menu button and the task list uses the full width

### Requirement: Render failure containment
A rendering error SHALL show a recoverable message with a reload action instead of a blank page, and SHALL not lose local data.

#### Scenario: Unexpected render error
- **WHEN** a component throws while rendering
- **THEN** the user sees an error message and a Reload button, and their data is intact after reloading
