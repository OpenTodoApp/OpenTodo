## MODIFIED Requirements

### Requirement: Imported origins
A task imported from a Todoist, Things, TickTick, Google Tasks, Trello, Asana, Microsoft To Do, Apple Reminders or Any.do export SHALL carry the origin `{kind: "import", provider: <profile name>, id: <source id>}`, the same source id the importer records for duplicate detection, without a URL, the provider being the profile's short name (`todoist`, `things`, `ticktick`, `google-tasks`, `trello`, `asana`, `microsoft-todo`, `apple-reminders`, `anydo`). A Trello card SHALL carry its `shortUrl` as the origin's URL, since the export provides one. A task from a generic CSV or JSON file SHALL carry none. An own export SHALL carry each task's `origin` and the import of an own export SHALL restore it unchanged, so the round trip is equivalent. Origins are written in the import's operations, like every other field.

#### Scenario: TickTick task keeps its id
- **WHEN** a TickTick row with `taskId` `6f1a…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "ticktick", id: "6f1a…"}` and `origin: ticktick` lists it

#### Scenario: Things item keeps its uuid
- **WHEN** a Things to-do with uuid `A1B2…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "things", id: "A1B2…"}`

#### Scenario: Trello card keeps its link
- **WHEN** a Trello card with id `5f3a…` and `shortUrl` `https://trello.com/c/AbCd1234` is imported
- **THEN** the task's origin is `{kind: "import", provider: "trello", id: "5f3a…", url: "https://trello.com/c/AbCd1234"}` and the origin's icon in the row opens the card

#### Scenario: Google task keeps its id
- **WHEN** a Google Tasks item with `id` `MTIz…` is imported twice
- **THEN** the first import gives it the origin `{kind: "import", provider: "google-tasks", id: "MTIz…"}` and the second preview reports it as `skip` with reason `already_imported`

#### Scenario: Round trip keeps origins
- **WHEN** an export holding a task captured from a page, a task from email and an imported issue is imported into an empty account
- **THEN** a fresh export lists the three tasks with the same `origin` values as the file

#### Scenario: Generic file has none
- **WHEN** a generic CSV with a `title` column is imported
- **THEN** the created tasks have no origin, and the preview shows no origin column

#### Scenario: Offline device receives origins
- **WHEN** the import finishes while a device is offline and the device later syncs
- **THEN** the imported tasks arrive with their origins as ordinary operations and that device shows them in the tasks' details and panel
