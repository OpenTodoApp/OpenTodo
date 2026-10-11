## ADDED Requirements

### Requirement: Archived projects list
The app SHALL list every archived, non-deleted project under "Archived projects" in Settings → Projects, sorted by name, each with its parent project's name when it is a sub-project and its open task count. The list SHALL be rendered from local data, so it is correct offline, and SHALL reflect archives and restores from other devices after sync without a reload.

#### Scenario: Listed with context
- **WHEN** "Garden" (a sub-project of "Home" with one open task) and "Trip 2026" are archived
- **THEN** Settings → Projects lists "Garden", "In Home · 1 open task", and "Trip 2026", "0 open tasks", in that order

#### Scenario: Nothing archived
- **WHEN** the user has no archived projects
- **THEN** the section says there are no archived projects

### Requirement: Restore an archived project
Each listed project SHALL have a keyboard-reachable Restore action that sets its existing `archived` field to false through the operation log, restoring that project alone. Restoring SHALL apply locally at once, work offline, and converge on every device under per-field last-writer-wins. This device SHALL not archive a restored project automatically again. Restore SHALL be unavailable when the user's role cannot archive the project.

#### Scenario: Restore from the list
- **WHEN** the user opens Settings → Projects, where "Trip 2026" is listed under Archived projects, and activates its Restore button
- **THEN** "Trip 2026" leaves the list and appears in the sidebar with its tasks, and other devices show it restored after sync

#### Scenario: Restore offline
- **WHEN** the device is offline and the user restores "Trip 2026"
- **THEN** the project appears in the sidebar immediately and the change is uploaded when the network returns

#### Scenario: Concurrent restore and archive
- **WHEN** device A restores "Trip 2026" offline while device B archives it again offline, and both sync
- **THEN** every device shows the result of the newer of the two operations, identically

#### Scenario: Sub-projects stay archived
- **WHEN** the user restores "Home", which was archived together with its sub-project "Garden"
- **THEN** "Home" returns to the sidebar and "Garden" stays listed under Archived projects

#### Scenario: Not archived again automatically
- **WHEN** the user restores a project that has had no open task for 30 days and automatic archiving is on for this device
- **THEN** the next automatic archive pass on this device leaves it in the sidebar

#### Scenario: Role cannot archive
- **WHEN** the user is an editor of a shared, archived project
- **THEN** the project is listed but its Restore action is unavailable, with a note that only the owner or an admin can restore it
