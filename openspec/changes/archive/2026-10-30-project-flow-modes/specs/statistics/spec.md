# Spec Delta

## ADDED Requirements

### Requirement: Areas in project health
For a project whose flow is Area (project-flow "Areas"), project health SHALL skip the Quiet rule: an area with open tasks and no Late or Overdue task SHALL read On track however long it has not changed. Its progress SHALL not be computed or shown; the All projects page SHALL show "Area" in its progress cell and SHALL sort areas after projects with a progress when sorting by progress. Late and Overdue SHALL apply as for any project. Like all health, this SHALL be computed on the device, offline, with no write, and SHALL follow a flow change synced from another device without a reload.

#### Scenario: A quiet area is fine
- **WHEN** the area "Home" has open tasks, none overdue or late, and no change for 30 days
- **THEN** its health is On track and its progress cell reads "Area"

#### Scenario: Overdue in an area
- **WHEN** an open task of the area "Home" was due yesterday
- **THEN** its health is Overdue with the count, as for any project
