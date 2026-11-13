## ADDED Requirements

### Requirement: A calendar per project
A connection SHALL offer to write to one calendar (the default) or to a calendar per project: the person matches projects to the account's writable calendars, and a task's event SHALL be written to the calendar of its nearest matched project (the project or one of its ancestors) or, without one, to the connection's target calendar. Moving a task to a project with another calendar SHALL move its event there. An event moved in the calendar app to another calendar SHALL be read like an event deleted from its calendar. OpenTodo SHALL never create calendars.

#### Scenario: Three projects, one connection
- **WHEN** a person matches Work, Home and Trip to the calendars of the same names in one Google connection
- **THEN** each project's dated tasks are written to its own calendar and other tasks to the target calendar

#### Scenario: Moving a task between projects
- **WHEN** a task with an event in Work's calendar is moved to Home
- **THEN** the next cycle deletes the event from Work's calendar and writes it to Home's
