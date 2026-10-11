# Spec Delta

## MODIFIED Requirements

### Requirement: Events derived from operations
The server SHALL derive events from operations as they are applied, except those written by an import or its undo, coalescing one entity's operations within a batch into one event named `task.created|updated|completed|reopened|deleted` or `project.created|updated|archived|deleted`. Operations that lose under last-writer-wins SHALL produce no event. Edits made offline SHALL produce events when the device syncs them.

#### Scenario: Completion from an offline device
- **WHEN** a user completes a task on a device without network and the device syncs an hour later
- **THEN** one `task.completed` event is emitted at sync time for webhooks subscribed to it

#### Scenario: Stale operation produces no event
- **WHEN** a device syncs a title change that is older than the title already stored
- **THEN** no `task.updated` event is emitted

#### Scenario: Project filter
- **WHEN** a webhook is limited to project P and a task in project Q is created
- **THEN** no delivery is queued for that webhook

#### Scenario: Import writes produce no per-task events
- **WHEN** an import creates 500 tasks for a user whose webhook subscribes to `task.created`
- **THEN** no `task.created` delivery is queued for those tasks

## ADDED Requirements

### Requirement: Import summary events
A finished import job SHALL produce one `import.completed` event and an undo one `import.undone`, delivered at most once per subscribed webhook with the job id, status, counts and touched project ids. Members of a touched shared project SHALL receive it with only their shared projects; a project filter SHALL match when its project is listed. Delivery, signing, retries and private network protection SHALL be as for other events.

#### Scenario: Large import
- **WHEN** a user imports 20,000 tasks and has one webhook subscribed to `import.completed`
- **THEN** exactly one delivery is queued for that webhook, carrying the counts and project ids

#### Scenario: Undo
- **WHEN** the user undoes that import
- **THEN** one `import.undone` delivery is queued and no `task.deleted` deliveries

#### Scenario: Ordinary writes unchanged
- **WHEN** a task is created through the REST API after an import
- **THEN** a `task.created` delivery is queued for every webhook subscribed to it

#### Scenario: Shared project member
- **WHEN** an import writes tasks into a project shared with another member who has a webhook subscribed to `import.completed`
- **THEN** that member's webhook receives one summary listing only that shared project

#### Scenario: Subscribe requires authentication
- **WHEN** a request without credentials creates a webhook subscribed to `import.completed`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Unknown event name
- **WHEN** a user creates a webhook subscribed to `import.started`
- **THEN** the response is a 400 `invalid_input` error and nothing is stored
