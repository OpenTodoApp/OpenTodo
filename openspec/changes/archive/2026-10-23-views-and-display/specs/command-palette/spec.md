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
The palette SHALL group its results under headings in sentence case (Recent, Tasks, Projects, Labels, Views, Commands, Settings), SHALL show the shortcut of a command at the right of its row as keycaps from the shortcut registry, a sequence as its steps joined by a translated "then" ("G then U") and a chord as one keycap, and SHALL list the entries picked most recently on this device under Recent when the box is empty. The highlighted row SHALL use the selected-row surface with its accent bar. When the palette opens with a selected or open task, the field SHALL show that task's title as a small chip at its end. Settings results SHALL include individual settings rows from the settings search index.

#### Scenario: Empty box
- **WHEN** the user opens the palette having recently opened "Website launch" and the Integrations settings
- **THEN** Recent lists those two first, before the context commands

#### Scenario: Shortcut column
- **WHEN** the user types "quick"
- **THEN** "Quick add a task" is listed with a `Q` keycap at its right, not in its secondary text

#### Scenario: Sequence as keycaps
- **WHEN** the user types "upco"
- **THEN** "Go to Upcoming" is listed with the keycaps `G` then `U` at its right

#### Scenario: The selected task is named
- **WHEN** the task "Call the plumber about the boiler" is selected in Today and the user presses `Ctrl+K`
- **THEN** the field shows a chip reading "Call the plumber about the boiler" (cut to one line) and the commands for that task are listed first

