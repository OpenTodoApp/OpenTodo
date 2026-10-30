# Spec Delta

## ADDED Requirements

### Requirement: Maintenance in project health
For a project in maintenance (project-organization "Maintenance status"), project health SHALL keep the Late rule. When Late does not hold and the project has an open task, its health word SHALL be "Maintenance" in place of Overdue, Quiet and On track, with no detail. Its progress SHALL be computed and shown as for any project. When sorting the All projects page by health, Maintenance SHALL rank after On track and before projects with nothing open. Like all health, this SHALL be computed on the device from local rows, offline, with no write, the same on every synced device, and SHALL follow a status change synced from another member without a reload.

#### Scenario: Overdue tasks during a busy season
- **WHEN** "Garden" is in maintenance, has two tasks due last week and no change for 20 days
- **THEN** its health reads "Maintenance", not Overdue or Quiet

#### Scenario: A passed deadline still shows
- **WHEN** "Garden" is in maintenance and an open task's deadline was yesterday
- **THEN** its health reads Late with the task's title

#### Scenario: End maintenance
- **WHEN** another member ends maintenance on "Garden" and this device syncs
- **THEN** its health reads Overdue again without a reload
