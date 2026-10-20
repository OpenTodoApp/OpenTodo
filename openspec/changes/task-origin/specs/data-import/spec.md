# Spec Delta

## MODIFIED Requirements

### Requirement: Linear attributes
A Linear issue SHALL be completed when it was completed or canceled, with canceled ones labelled `canceled`. Its priority (urgent, high, medium, low, none) SHALL map to p1, p2, p3, p4, p4. Labels, the due date and the Markdown description SHALL be kept, the description starting with the issue identifier, and the identifier SHALL also become the task's origin `{kind: "issue", provider: "linear", id: <identifier>}` without a URL, since the export carries none. An issue assigned to the importing user's email address SHALL stay assigned to them. Estimates, cycles, milestones, relations and other assignees SHALL be dropped with a warning.

#### Scenario: Canceled issue
- **WHEN** an issue's status is canceled
- **THEN** it is imported completed, with the label `canceled`

#### Scenario: Identifier kept
- **WHEN** issue `ENG-123` is imported
- **THEN** its description starts with `ENG-123` and its origin is `{kind: "issue", provider: "linear", id: "ENG-123"}`, shown as a chip reading "ENG-123" without a link

## ADDED Requirements

### Requirement: Imported origins
A task imported from a Todoist, Things or TickTick export SHALL carry the origin `{kind: "import", provider: <profile name>, id: <source id>}`, the same source id the importer records for duplicate detection, without a URL. A task from a generic CSV or JSON file SHALL carry none. An own export SHALL carry each task's `origin` and the import of an own export SHALL restore it unchanged, so the round trip is equivalent. Origins are written in the import's operations, like every other field.

#### Scenario: TickTick task keeps its id
- **WHEN** a TickTick row with `taskId` `6f1a…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "ticktick", id: "6f1a…"}` and `origin: ticktick` lists it

#### Scenario: Things item keeps its uuid
- **WHEN** a Things to-do with uuid `A1B2…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "things", id: "A1B2…"}`

#### Scenario: Round trip keeps origins
- **WHEN** an export holding a task captured from a page, a task from email and an imported issue is imported into an empty account
- **THEN** a fresh export lists the three tasks with the same `origin` values as the file

#### Scenario: Generic file has none
- **WHEN** a generic CSV with a `title` column is imported
- **THEN** the created tasks have no origin, and the preview shows no origin column

#### Scenario: Offline device receives origins
- **WHEN** the import finishes while a device is offline and the device later syncs
- **THEN** the imported tasks arrive with their origins as ordinary operations and the chips show on that device
