## ADDED Requirements

### Requirement: Public view cost does not grow per task
Serving a project through a public link SHALL read the project's sections in one query and its tasks in one query, whatever their number, and SHALL return the same sections and tasks in the same order as before. The view only reads; it changes nothing for devices, online or offline.

#### Scenario: Large public project
- **WHEN** a guest opens a public link to a project with 5,000 tasks
- **THEN** the server answers with a fixed handful of queries, not one per task

#### Scenario: Revoked link
- **WHEN** a guest opens a revoked or unknown link
- **THEN** the response is 404 as before and no project data is read
