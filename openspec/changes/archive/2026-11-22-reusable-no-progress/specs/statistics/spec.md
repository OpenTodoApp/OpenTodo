## MODIFIED Requirements

### Requirement: Areas in project health
For a project whose flow is Area (project-flow "Areas"), project health SHALL skip the Quiet rule: an area with open tasks and no Late or Overdue task SHALL read On track however long it has not changed. Its progress SHALL not be computed or shown; the All projects page SHALL show "Area" in its progress cell and SHALL sort areas after projects with a progress when sorting by progress. Late and Overdue SHALL apply as for any project. A reusable list (reusable-lists "Reusable list mode") is restocked rather than finished, so its progress SHALL not be shown either: its progress cell SHALL stay empty, it SHALL sort with the projects that have no progress, and its health SHALL follow the rules of any project; its tasks still count in a folded parent's progress. Like all health, this SHALL be computed on the device, offline, with no write, and SHALL follow a flow change synced from another device without a reload.

#### Scenario: A quiet area is fine
- **WHEN** the area "Home" has open tasks, none overdue or late, and no change for 30 days
- **THEN** its health is On track and its progress cell reads "Area"

#### Scenario: Overdue in an area
- **WHEN** an open task of the area "Home" was due yesterday
- **THEN** its health is Overdue with the count, as for any project

#### Scenario: A reusable list has no progress
- **WHEN** the reusable list "Groceries" holds two open items and fifteen ticked off on earlier trips
- **THEN** its progress cell on the All projects page is empty and its project page shows no progress, while its health is worked out as for any project
