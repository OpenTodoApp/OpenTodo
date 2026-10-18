## ADDED Requirements

### Requirement: Screens read local data through the data layer

Screens in `web/src/app` SHALL read the device's local data only through the data layer in `web/src/lib`, never by opening the local database themselves; the lint run of `make check` SHALL fail on an import of the database module (other than the sign-out and storage-persistence calls) or a use of the database object in a screen, except in tests, test kits, stories and files explicitly allow-listed while another change moves them. Widely read lists (projects, labels, memberships, saved views, preferences, field definitions) SHALL come from one shared live read each, so every screen shows the same rows. Reads stay local: they work offline, and a change from another device appears on every open screen after sync without a reload.

#### Scenario: A screen opens the database

- **WHEN** a screen file in `web/src/app` imports the database object or reads a table directly
- **THEN** the lint run fails and points to the data layer

#### Scenario: A synced change reaches every screen

- **GIVEN** the sidebar, the command palette and a project header are open
- **WHEN** a project is renamed on another device and this device syncs, or the device is offline and the rename is made here
- **THEN** all three show the new name without a reload

### Requirement: One visibility rule for projects

Every screen SHALL apply the same rule to which projects it reads: projects in the Trash (deleted) SHALL be left out everywhere except the Trash, history and statistics; archived projects SHALL be included in the lists screens hand to pickers, quick add and saved views, which leave archived projects out themselves as their own requirements say, and SHALL be left out of browsing lists such as the sidebar tree. The quick add sheet SHALL treat projects exactly as the quick add line of the task views does. The rule is applied to local data, so it holds offline, and an archive, restore or deletion synced from another device moves the project in or out of every list on the next render.

#### Scenario: Archived project in quick add

- **GIVEN** a project "Old" is archived
- **WHEN** the user types `#Old` in the quick add sheet or in a view's quick add line
- **THEN** both treat it the same way, and neither files the task into the archived project

#### Scenario: Archived project in the sidebar and in a picker

- **GIVEN** a task in an archived project
- **WHEN** the sidebar and the task's project picker are shown
- **THEN** the sidebar tree does not list the archived project, and the picker lists it first, marked "archived", as the task's current project

#### Scenario: Deleted project

- **WHEN** a project is moved to the Trash on another device and this device syncs
- **THEN** it disappears from every list except the Trash, where it can be restored
