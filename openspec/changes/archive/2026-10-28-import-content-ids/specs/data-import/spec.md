## ADDED Requirements

### Requirement: Rows without ids get content ids
A row of a JSON file that carries no id of its own SHALL get a source id derived from its content (its title, description, project or list, section and parent) and its order among equal rows in the file, never from its position alone, so a different file is never reported as `already_imported` because of an earlier import, and the same file imported again still is.

#### Scenario: A second file without ids
- **WHEN** a user imports a JSON array of tasks without ids, then previews another JSON file without ids with other tasks
- **THEN** every task of the second file is reported as `create`, none as `already_imported`

#### Scenario: The same file again
- **WHEN** the user previews the first file again
- **THEN** every row is reported as `skip` with reason `already_imported`

#### Scenario: Lists without ids
- **WHEN** a user imports `{"lists": [{"title": "Work", …}]}` without ids, then a file whose list "Personal" has no id
- **THEN** "Personal" becomes its own project, and its tasks are not put into "Work"
