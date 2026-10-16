# Spec Delta

## MODIFIED Requirements

### Requirement: Help inside the app
The app SHALL include a Help view with the user guide of its own version, available offline and searchable, reachable from the sidebar footer, every page header, the cheat sheet and `g` then `?`. Its landing SHALL open on the search field followed by task-shaped entries ("Add a task with a date", "Repeat a task", "Share a project", "Sync a calendar", "Import from another app", "Install the app", "Use the keyboard", "Run your own server"), with the full guide list below. Each guide page SHALL be under 600 words with a screenshot first. Links between guides SHALL stay in the app; admin and developer pages SHALL open on the website. The help content SHALL load only when Help is opened.

#### Scenario: Offline help
- **WHEN** the installed app is offline and the user opens Help and searches for "board"
- **THEN** the sections about boards are found and shown

#### Scenario: Version match
- **WHEN** a server runs an older release than the website describes
- **THEN** its in-app Help shows the guide for the version it runs

#### Scenario: Task-shaped landing
- **WHEN** the user opens Help
- **THEN** focus is in the search field and the eight task entries are visible before any guide list

### Requirement: Contextual help
Every page header, the task panel menu, the share dialog, quick add (on its first three uses per device) and the import screen SHALL offer a Help action that opens the matching guide section beside the current screen (a sheet on phones) without closing it or discarding what the user entered.

#### Scenario: Help while sharing
- **WHEN** a user has typed an email in the share dialog and selects Help
- **THEN** the sharing section opens beside the dialog, and closing it returns to the dialog with the email still there

#### Scenario: Help from the board
- **WHEN** the user activates Help in a project's page header while the board is shown
- **THEN** the sections and boards guide opens in the panel slot and the board stays as it was
