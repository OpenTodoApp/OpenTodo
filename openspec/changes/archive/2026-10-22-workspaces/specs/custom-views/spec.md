## MODIFIED Requirements

### Requirement: Saved view entity
A saved view SHALL have a name, a query string in the filter grammar, a kind (`list` or `dashboard`), a grouping, a sort field and direction, a pinned flag, a position, a colour, for dashboards an ordered list of panel view ids, for list views an optional on-drop rule (see "On-drop rule"), creation time, optional deletion time and an additive `workspace_id` (absent or null means the default workspace). Views SHALL be edited as operations applied locally first so they work offline and SHALL converge under per-field last-writer-wins; the on-drop rule is one field and converges as a whole. Unrecognised option values received by sync SHALL fall back to defaults without being rewritten, and a rule key a client does not know SHALL be kept in the row and ignored. A view SHALL be listed, pinned and evaluated within its workspace only: its query matches the tasks of that workspace, and a dashboard's panels that name views of another workspace are shown as unavailable.

#### Scenario: Save offline, appears elsewhere after sync
- **WHEN** the device is offline and the user saves the query `@work & due <= tomorrow & p1` as "Work tomorrow"
- **THEN** the view is available immediately on this device in the current workspace and appears on other devices after the network returns

#### Scenario: Concurrent edits to different options
- **WHEN** device A changes a view's grouping offline while device B changes its sort offline, and both sync
- **THEN** every device shows the new grouping and the new sort

#### Scenario: Concurrent edits to one rule
- **WHEN** device A sets a column's rule to "priority 1" offline while device B sets the same column's rule to "add label errand" offline, and both sync
- **THEN** every device shows the rule written with the greater timestamp, whole, and the other rule is absent on every device

#### Scenario: Older client receives a rule
- **WHEN** a device running a client without on-drop rules syncs a view carrying one
- **THEN** it shows the view as before, keeps the field in its data, and a later edit of the view's name from that device does not remove the rule

#### Scenario: Evaluated in its workspace
- **WHEN** "Personal" and "Work" each have a task with priority 1 due tomorrow and the user opens the view "p1 & due <= tomorrow" saved in Work
- **THEN** only Work's task is listed

#### Scenario: Opened from another workspace
- **WHEN** the user is in "Personal" and opens a Work view from the palette
- **THEN** the device switches to Work and the view is shown with Work's tasks

