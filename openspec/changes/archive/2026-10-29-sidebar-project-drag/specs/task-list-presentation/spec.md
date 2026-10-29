## MODIFIED Requirements

### Requirement: Drag feedback
A dragged row SHALL lift with the popover elevation and a slight scale, the drop position SHALL show as a line with a dot at its start, and dropping on the middle of a row SHALL ring that row. Under reduced motion the lift is an opacity change. In the sidebar's project tree the line SHALL start at the indent of the level the dragged project lands on, and a dragged project SHALL show only this indicator: the ring a project row shows while a task is dragged onto it SHALL not appear.

#### Scenario: Start a drag
- **WHEN** the user drags a task in a project list
- **THEN** the row lifts and the target line appears between rows as the pointer moves

#### Scenario: Drag a project in the sidebar
- **WHEN** the user drags the sub-project "Acme" over the top edge of the top-level project "Clients"
- **THEN** one line with a dot appears above Clients at the top level's indent, no row is ringed, and dropping makes Acme a top-level project before Clients
