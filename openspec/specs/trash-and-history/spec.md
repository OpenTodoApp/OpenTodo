# trash-and-history Specification

## Purpose
Defines the Trash and restore for tasks and projects, automatic archiving of projects whose work is done, revision history derived from the operation log with value restore, and permanent purge with the rules that keep purged data from reappearing.

## Requirements

### Requirement: Trash view
The client SHALL provide a Trash view, opened with `g x` and from the sidebar, listing deleted tasks and deleted projects from local data, newest deletion first, with the deletion time and, for tasks, the project name. The sidebar SHALL show the number of items in the Trash. The view SHALL work offline and SHALL reflect deletions and restores from other devices after sync.

#### Scenario: Deleted task appears in the Trash
- **WHEN** the user deletes a task and opens the Trash
- **THEN** the task is listed first with its deletion time and project, and the Trash count in the sidebar increased by one

#### Scenario: Offline
- **WHEN** the device is offline and the user opens the Trash
- **THEN** the locally known deleted items are listed and restore actions work

### Requirement: Restore a task
Restoring a task SHALL clear its deletion time as an operation applied locally first. If the task's project is itself deleted at restore time, the task SHALL be moved to the Inbox in the same operation batch. Restore SHALL converge under last-writer-wins: a restore newer than a concurrent delete wins and the reverse holds.

#### Scenario: Restore to its project
- **WHEN** the user restores a deleted task whose project "Home" exists
- **THEN** the task reappears in "Home" with all its fields and leaves the Trash

#### Scenario: Project still deleted
- **WHEN** the user restores a task whose project is in the Trash
- **THEN** the task reappears in the Inbox

#### Scenario: Concurrent delete and restore
- **WHEN** device A restores a task offline while device B deletes it again offline, and both sync
- **THEN** every device shows the outcome of the operation with the greater timestamp

### Requirement: Restore a project
Restoring a deleted project SHALL clear its deletion time, and the tasks that still reference it SHALL become visible again without any task operation, because deleting a project keeps its tasks' project reference. The restored project SHALL reappear in the sidebar at its previous place. Restore works offline and converges.

#### Scenario: Project returns with its tasks
- **WHEN** the user deletes "Garden" holding 3 open and 2 completed tasks, then restores it from the Trash
- **THEN** "Garden" is back in the sidebar with the 3 open tasks listed and the 2 completed tasks in Completed

#### Scenario: Task edited while its project was trashed
- **WHEN** a task of trashed project "Garden" is renamed through the API, then "Garden" is restored
- **THEN** the task is visible in "Garden" with the new title

### Requirement: Automatic archive of completed projects
When the last open task of a project with at least one task is completed, the client SHALL offer to archive the project with a one-key confirmation. A project that has tasks but no open task for 30 days SHALL be archived automatically with a dismissible notice naming it, unless the user disabled automatic archiving on that device. Automatic archiving SHALL be written as an ordinary archive operation so devices converge, and SHALL never apply to the Inbox.

#### Scenario: Offer on last completion
- **WHEN** the user completes the only remaining open task in "Trip 2026"
- **THEN** a prompt offers "Archive Trip 2026? Enter" and Enter archives it, while any other key dismisses the prompt

#### Scenario: Automatic archive after inactivity
- **WHEN** "Trip 2026" has had no open task for 30 days and automatic archiving is enabled on this device
- **THEN** the project is archived, a notice with an undo action is shown, and other devices see it archived after sync

#### Scenario: Opt out per device
- **WHEN** the user disables automatic archiving in Settings on this device
- **THEN** no project is archived automatically from this device while other devices keep their own setting

### Requirement: Revision history
The API SHALL expose `GET /api/v1/tasks/{id}/history` and `GET /api/v1/projects/{id}/history`, requiring authentication, returning the entity's operations ordered by timestamp with field, value, timestamp and device, including operations that lost under last-writer-wins. The client SHALL show this as a timeline in the detail panel; when offline it SHALL state that history needs a connection and show nothing stale.

#### Scenario: Timeline of changes
- **WHEN** a task was created on a laptop, retitled on a phone and rescheduled through the API, and the user opens its history online
- **THEN** three groups of changes are listed in time order with device labels "laptop", "phone" and "API" and the old and new values

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials asks for a task's history
- **THEN** the response is 401 `unauthorized`

#### Scenario: Unknown or foreign entity
- **WHEN** an authenticated user asks for the history of an id that does not exist for their account
- **THEN** the response is 404 `not_found`

### Requirement: Restore a previous value
From the history timeline the user SHALL be able to restore an earlier value of a field, which SHALL be written as a new operation with the current time, so it applies locally at once, is itself recorded in the history, and converges like any other edit. Restoring a value SHALL never remove operations from the log.

#### Scenario: Restore an old title
- **WHEN** the user picks the previous title in the history and confirms
- **THEN** the task shows the old title again and the history gains a new entry for this restore

### Requirement: Permanent purge
The user SHALL be able to permanently delete one trashed item or empty the Trash, after confirmation. The API SHALL expose `DELETE /api/v1/{tasks|projects}/{id}/purge` and `POST /api/v1/trash/purge`, requiring authentication, accepting only entities whose deletion time is set, removing their operations and current values, and recording a purge marker. Purging a project SHALL purge the tasks referencing it.

#### Scenario: Purge one task
- **WHEN** the user permanently deletes a trashed task and confirms
- **THEN** the task disappears from the Trash and from the export, and its history endpoint returns 404

#### Scenario: Purge requires the item to be in the Trash
- **WHEN** an authenticated client requests the purge of a task that is not deleted
- **THEN** the response is 409 `not_deleted` and nothing is removed

#### Scenario: Unauthenticated purge
- **WHEN** a request without credentials asks to empty the Trash
- **THEN** the response is 401 `unauthorized`

### Requirement: Purged entities never return
A sync response SHALL include the ids of entities purged since the client's cursor, and clients SHALL delete those entities locally. Operations received for a purged entity SHALL be discarded by the server and reported as duplicates, so a device that edited the entity offline cannot resurrect it. Purge markers SHALL be kept so this holds for any later arrival. The client SHALL request a purge only when online and SHALL show it as pending otherwise.

#### Scenario: Other devices drop the entity
- **WHEN** a task is purged from device A and device B syncs
- **THEN** device B removes the task from its local store and Trash

#### Scenario: Stale offline edit after purge
- **WHEN** device B edited the task offline before learning of the purge and then syncs
- **THEN** the server discards those operations, the task stays purged everywhere and device B's copy is removed

### Requirement: Automatic purge after retention
The server SHALL permanently purge trashed tasks and projects whose deletion time is older than the retention period, by default 30 days, configurable with the optional `OPENTODO_TRASH_RETENTION_DAYS` variable where `0` disables automatic purge. The job SHALL run at startup and daily, SHALL use the same purge path and markers, and the Trash view SHALL show each item's remaining days.

#### Scenario: Default retention
- **WHEN** a task has been in the Trash for 31 days with default configuration
- **THEN** the next retention run purges it and devices drop it on their next sync

#### Scenario: Disabled retention
- **WHEN** `OPENTODO_TRASH_RETENTION_DAYS=0` is set
- **THEN** no item is purged automatically and the Trash view shows no countdown

#### Scenario: Invalid value
- **WHEN** `OPENTODO_TRASH_RETENTION_DAYS=soon` is set
- **THEN** the process exits non-zero with a message naming the variable

### Requirement: Assistant writes are labelled in history
History entries whose device starts with `agent:` SHALL carry a `device_label`: "AI assistant (<token name>)" when the viewer owns the token and it still exists, otherwise "AI assistant". The timeline SHALL show that label. Labels are computed when history is read; no op changes, and history stays online-only as before.

#### Scenario: Own assistant named
- **WHEN** Alice's token "Desk assistant" rescheduled a task and Alice opens its history online
- **THEN** the change group is labelled "AI assistant (Desk assistant)" with the old and new due dates

#### Scenario: Other member sees a generic label
- **WHEN** Bob opens the history of the same task in a project Alice shares with him
- **THEN** the change group is labelled "AI assistant" without the token name

#### Scenario: Restore a value changed by an assistant
- **WHEN** Alice restores the previous due date from that history entry
- **THEN** a new op with Alice's device restores it and converges like any edit

#### Scenario: Unauthenticated history request
- **WHEN** a request without credentials asks for the history of a task changed by an assistant
- **THEN** the response is 401 `unauthorized`
