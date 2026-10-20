# Spec Delta

## MODIFIED Requirements

### Requirement: Archived projects list
The app SHALL list every archived, non-deleted project under "Archived projects" on the All projects page, behind a disclosure closed by default, sorted by name, each with its parent project's name when it is a sub-project and its open task count; Settings → Data SHALL link to it. The list SHALL be rendered from local data, so it is correct offline, and SHALL reflect archives and restores from other devices after sync without a reload.

#### Scenario: Listed with context
- **WHEN** "Garden" (a sub-project of "Home" with one open task) and "Trip 2026" are archived
- **THEN** the All projects page's "Archived projects" disclosure reads "2" and, opened, lists "Garden", "In Home · 1 open task", and "Trip 2026", "0 open tasks", in that order

#### Scenario: Nothing archived
- **WHEN** the user has no archived projects
- **THEN** the disclosure says there are no archived projects

#### Scenario: Reached from Settings
- **WHEN** the user opens Settings → Data and activates the archived projects link
- **THEN** the All projects page opens with the disclosure expanded

## ADDED Requirements

### Requirement: Pin a project
Every project menu (the sidebar row, the project header, the All projects page) SHALL offer a checkable "Pin to sidebar" that adds the project to, or removes it from, the user's favourites. The project SHALL stay in the Projects tree either way. Pinning SHALL be a change to the user's own preference, never to the project, so members of a shared project do not see each other's pins.

#### Scenario: Pin from the header
- **WHEN** the user opens a project's header menu and checks "Pin to sidebar"
- **THEN** the project appears in the Favourites group with its count, the item reads as checked in every menu of that project, and the project is still listed in the tree

#### Scenario: Shared project pinned by one member
- **WHEN** Ada pins a project shared with Bob
- **THEN** Bob's sidebar is unchanged and no project operation is written

### Requirement: All projects page
The app SHALL offer an All projects page at `/projects`, reachable with `g Shift+P`, from the palette and from an "All" action on the Projects header, using the page template: the whole project tree with icons, colours and open-task counts, a find field that narrows the tree keeping ancestors, New project and From a template as actions, each row opening the project with its menu, and the archived projects disclosure. It SHALL render from local data and update live after sync.

#### Scenario: Find a project
- **WHEN** the user presses `g Shift+P` and types "des"
- **THEN** the page shows "Work › Hiring › Designer" and "Website launch › Design" with their ancestors and no other project, and Enter on the first opens it

#### Scenario: Every project is one click away
- **WHEN** the user's sidebar shows only Favourites and a collapsed Projects group
- **THEN** the "All" action on the Projects header opens the page listing all thirty projects

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the page lists the projects, counts and archived projects from local data and the find field works
