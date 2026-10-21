# Spec Delta

## MODIFIED Requirements

### Requirement: Search over local data
The palette SHALL find tasks by title, notes text, origin id and origin title, projects by name and parent path, labels by name, saved views and dashboards by name, and Settings sections by name and description, from the device's local tables only. Deleted tasks, projects, labels and views SHALL never be listed; completed tasks and archived projects SHALL be listed after open and live ones with a marker. Search SHALL work offline and SHALL send nothing to the server.

#### Scenario: Find a task by a word in its notes
- **WHEN** a task "Renew passport" has notes containing "appointment at 9" and the user types `appoint`
- **THEN** "Renew passport" is listed with its project as context

#### Scenario: Find a task by its issue id
- **WHEN** a task "Fix the login timeout" has origin id `ENG-123` and the user types `eng-123`
- **THEN** "Fix the login timeout" is listed, from local data

#### Scenario: Completed and archived are marked
- **WHEN** the user types `paint` and a completed task and an open task both match
- **THEN** the open task is listed first and the completed one is marked "completed"

#### Scenario: Offline
- **WHEN** the device is offline and the user types a project name
- **THEN** the project is listed from local data with no error and no request

#### Scenario: Encrypted account
- **WHEN** an end-to-end encrypted account is unlocked on the device and the user searches a task title
- **THEN** the task is found from the decrypted local copy, and no title, query or index leaves the device
