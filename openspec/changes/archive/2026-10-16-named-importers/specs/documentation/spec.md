# Spec Delta

## MODIFIED Requirements

### Requirement: User guide
The documentation SHALL include a guide for people using the app, written as tasks rather than reference: getting started, tasks and projects, views, sections and boards, labels and filters, recurring tasks and reminders, time blocking, sharing and comments, notifications, offline use and sync, installing the app, keyboard shortcuts, account security, import and export, trash and history, settings, troubleshooting, and switching from Todoist, Things, TickTick and Linear.

#### Scenario: First steps
- **WHEN** a new user opens Getting started
- **THEN** it walks them from signing in to adding, scheduling and completing a task, with screenshots, in a few minutes of reading

#### Scenario: Keyboard reference matches the app
- **WHEN** a shortcut is added to the app's shortcut table
- **THEN** the `?` overlay and the keyboard guide both list it after the next build, with no separate edit

#### Scenario: Switching from another app
- **WHEN** a Todoist user opens the Todoist switch guide on the website or in the in-app Help
- **THEN** it shows how to export from Todoist, how to import the file, what carries over, and what is dropped with a warning, matching the importer's documented mapping
