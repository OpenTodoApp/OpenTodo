# Spec Delta

## ADDED Requirements

### Requirement: Palette sections and recents
The palette SHALL group its results under headings (Recent, Tasks, Projects, Labels, Filters, Commands, Settings), SHALL show the shortcut of a command at the right of its row from the shortcut registry, and SHALL list the entries picked most recently on this device under Recent when the box is empty. Settings results SHALL include individual settings rows from the settings search index.

#### Scenario: Empty box
- **WHEN** the user opens the palette having recently opened "Website launch" and the Integrations settings
- **THEN** Recent lists those two first, before the context commands

#### Scenario: Shortcut column
- **WHEN** the user types "quick"
- **THEN** "Quick add a task" is listed with `q` at its right

## MODIFIED Requirements

### Requirement: Discoverability and help
The cheat sheet and the keyboard guide SHALL list `Ctrl`/`⌘`+`K` from the shortcut registry, the palette's input SHALL show a hint about commands and filter queries while empty, the sidebar footer and the phone tab bar SHALL offer Search, and the user guide SHALL have a page on search and commands reachable from the palette's Help action.

#### Scenario: Listed in the shortcut help
- **WHEN** the user presses `?`
- **THEN** the "Everywhere" group lists `Ctrl/⌘+K` with "Search and commands"

#### Scenario: Search tab on a phone
- **WHEN** the user taps Search in the phone tab bar
- **THEN** the palette opens as a full-screen sheet with its field focused
