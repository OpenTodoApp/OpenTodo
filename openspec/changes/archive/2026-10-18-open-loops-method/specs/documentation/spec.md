# Spec Delta

## MODIFIED Requirements

### Requirement: User guide
The documentation SHALL include a guide for people using the app, written as tasks rather than reference. It SHALL cover:
- getting started
- tasks and projects
- views
- sections and boards
- labels and filters
- recurring tasks and reminders
- time blocking
- sharing and comments
- notifications
- offline use and sync
- installing the app
- keyboard shortcuts
- account security
- import and export
- trash and history
- settings
- troubleshooting
- switching from Todoist, Things, TickTick and Linear
- the Open Loops method

The method chapter SHALL hold one overview page, one page per move, one page each for Places, Rhythms and Horizons, "Set up in ten minutes", and "Coming from GTD". "Coming from GTD" SHALL map GTD terms to Open Loops terms and state that Open Loops is inspired by GTD and is not affiliated with its authors. Every term on these pages SHALL be the one the app shows for the same id.

#### Scenario: First steps
- **WHEN** a new user opens Getting started
- **THEN** it walks them from signing in to adding, scheduling and completing a task, with screenshots, in a few minutes of reading

#### Scenario: Keyboard reference matches the app
- **WHEN** a shortcut is added to the app's shortcut table
- **THEN** the `?` overlay and the keyboard guide both list it after the next build, with no separate edit

#### Scenario: Switching from another app
- **WHEN** a Todoist user opens the Todoist switch guide on the website or in the in-app Help
- **THEN** it shows how to export from Todoist, how to import the file, what carries over, and what is dropped with a warning, matching the importer's documented mapping

#### Scenario: Method page per move
- **WHEN** the docs are built
- **THEN** each of the five moves has a page that declares the screens which reference it, and the docs check fails if a screen's method link names a move without a page

#### Scenario: Coming from GTD
- **WHEN** a GTD user opens "Coming from GTD"
- **THEN** it lists contexts, next actions, waiting for, someday/maybe, tickler, projects, areas of focus and the weekly review with the Open Loops term and the screen for each

### Requirement: Help landing page
The Help view's landing SHALL open on the search field, followed by task-shaped entries, with the full guide list below. The entries are:
- "Add a task with a date"
- "Repeat a task"
- "Share a project"
- "Sync a calendar"
- "Import from another app"
- "Install the app"
- "Use the keyboard"
- "Run your own server"
- "Learn Open Loops"

#### Scenario: Task-shaped landing
- **WHEN** the user opens Help
- **THEN** focus is in the search field and the nine task entries are visible before any guide list

#### Scenario: Learn Open Loops
- **WHEN** the user activates "Learn Open Loops"
- **THEN** the method overview opens, with its loop diagram first and links to each move
