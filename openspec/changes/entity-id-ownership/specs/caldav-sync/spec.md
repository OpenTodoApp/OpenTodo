## ADDED Requirements

### Requirement: Resource names are kept per account
A resource name or UID that a calendar app chose SHALL be kept for the account whose app chose it: other accounts that see the same task SHALL be served it as `<task id>.ics` with the task id as UID, and no account's app SHALL rename or remove another account's names. A VTODO whose UID is the id of a task the account cannot see SHALL be stored as a new task with a fresh id, keeping the app's UID and name for that account. A database upgraded from an earlier version SHALL keep each existing name for every account that can see its task. This is server state outside the op log; offline devices are unaffected and nothing needs to converge.

#### Scenario: Two members' apps
- **WHEN** bob's calendar app creates a task in a project shared with alice under the name `squat.ics`
- **THEN** alice's app lists that task as `<task id>.ics` with the task id as UID, and bob's app finds it under `squat.ics`

#### Scenario: UID of a task the account cannot see
- **WHEN** bob's app stores a VTODO whose UID is the id of alice's private task
- **THEN** a new task with a fresh id is created for bob, served to bob's app under its UID, and alice's task is unchanged

#### Scenario: Upgrade
- **WHEN** a server whose database holds a name for a task of a shared project starts on the new version
- **THEN** every member of the project keeps that name for the task, and names of unknown tasks are removed
