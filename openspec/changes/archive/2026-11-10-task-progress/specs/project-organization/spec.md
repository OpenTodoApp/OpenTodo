# Spec Delta

## ADDED Requirements

### Requirement: Project progress on the project page
A project's page SHALL show the project's progress beside its title as a progress ring and a whole percentage ("40%", read "40% done"); on a phone the line under the title SHALL read "40% done". The figure SHALL be the project's own tasks at every level of subtask, by the rule of statistics "Project health": completed tasks over completed and open tasks (deferred and someday ones included), a recurring series counted once through its open task, and deleted, skipped and start guide sample tasks left out; it SHALL equal the All projects table's progress for the project's unfolded row. A project whose flow is Area, and a project with no counted task, SHALL show no progress. The figure SHALL be worked out on the device from local rows, offline too, with no request, no write and nothing stored, and SHALL update live after a local write or a sync, so two synced devices show the same figure.

#### Scenario: Beside the title
- **WHEN** "Website launch" has three completed tasks and two open ones
- **THEN** its page reads "60%" with a ring beside the title, the same figure as its All projects row

#### Scenario: Ticking a task offline
- **WHEN** the device is offline and the user completes one of the two open tasks
- **THEN** the figure reads "80%" at once

#### Scenario: Recurring series and samples
- **WHEN** a project holds one open task, one completed task, a daily series completed on five days and the start guide's sample tasks
- **THEN** its page reads "33%": the series counts once as open and the samples not at all

#### Scenario: An area or an empty project
- **WHEN** the user opens an area, or a project with no task yet
- **THEN** no progress shows beside its title
