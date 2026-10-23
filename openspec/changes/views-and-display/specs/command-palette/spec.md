## MODIFIED Requirements

### Requirement: Filter queries inline
When the typed text is a valid filter query containing at least one term other than `search:`, the palette SHALL also list the tasks the query matches, evaluated as the New view page evaluates it, and SHALL offer "Open as a new view" with that query. Text that is not a valid query SHALL be treated as a plain search without any error message.

#### Scenario: Label and priority
- **WHEN** the user types `@errand & p1`
- **THEN** open priority-1 tasks carrying "errand" are listed and the first entry is "Open as a new view"

#### Scenario: Incomplete query shows no error
- **WHEN** the user has typed `@errand &`
- **THEN** no syntax error is shown and the entries matching the text "errand" are listed

#### Scenario: Open in Filter view
- **WHEN** the user picks "Open as a new view" for `due <= friday`
- **THEN** the New view page opens at `/views/new` with that query and its results, and the query is added to this device's filter history

### Requirement: Palette sections and recents
The palette SHALL group its results under headings (Recent, Tasks, Projects, Labels, Views, Commands, Settings), SHALL show the shortcut of a command at the right of its row from the shortcut registry, and SHALL list the entries picked most recently on this device under Recent when the box is empty. Settings results SHALL include individual settings rows from the settings search index.

#### Scenario: Empty box
- **WHEN** the user opens the palette having recently opened "Website launch" and the Integrations settings
- **THEN** Recent lists those two first, before the context commands

#### Scenario: Shortcut column
- **WHEN** the user types "quick"
- **THEN** "Quick add a task" is listed with `q` at its right
