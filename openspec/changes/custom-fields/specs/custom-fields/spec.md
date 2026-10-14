# Spec Delta

## Purpose

Lets a project define typed fields (text, number, date, choice, link, checkbox) that its tasks carry as values, so a task can hold a cost, a client or a link that converges per field, filters, exports and shows wherever the task shows.

## ADDED Requirements

### Requirement: Field definition entity
A field definition SHALL belong to one project and have a name, a type (`text`, `number`, `date`, `choice`, `link` or `checkbox`), the options of a choice field, a sort position, a creation time and an optional deletion time. Its project and type SHALL NOT change after creation. Definitions SHALL be written as operations, applied locally first so they work offline, and SHALL converge under per-field last-writer-wins. A project SHALL have at most 30 live definitions.

#### Scenario: Add a field offline
- **WHEN** the device is offline and the user adds a number field "Cost" to project "Kitchen"
- **THEN** "Cost" appears at once in the project's task panels and columns, survives a reload, and reaches the project's other devices and members after the network returns

#### Scenario: Concurrent definitions converge
- **WHEN** device A adds "Cost" and device B adds "Client" to the same project offline, and both sync
- **THEN** the project has both fields on every device

#### Scenario: Concurrent rename
- **WHEN** two devices rename the same field offline and both sync
- **THEN** every device shows the name written with the greater timestamp

#### Scenario: Limit
- **WHEN** a project already has 30 live fields and the user or an API client adds another
- **THEN** the addition is refused with a message naming the limit

### Requirement: Typed values and their limits
A value SHALL match its definition's type: text of at most 2,000 characters; a finite number; a floating date `YYYY-MM-DD`; a choice equal to one of the options; an `http` or `https` link of at most 2,000 characters; a boolean. Clients, the REST API and assistant tools SHALL refuse a mismatch. The server SHALL refuse any value that is not null, a string, a finite number or a boolean, and SHALL NOT check it against the definition, so a value and its definition may arrive in any order.

#### Scenario: Number refused in the panel
- **WHEN** the user types `abc` into the "Cost" editor
- **THEN** the panel shows an inline error and writes nothing

#### Scenario: Choice outside the options
- **WHEN** an API client patches a choice field with a value that is not one of its options
- **THEN** the response is 400 `invalid_input` naming the field and nothing changes

#### Scenario: Value that no longer matches its definition
- **WHEN** a device receives a string value for a field whose definition says `number`
- **THEN** the task shows the value as text marked as not matching the type, and the next edit on this device replaces it with a number

### Requirement: Values converge per field
A task SHALL carry its values in a `fields` map keyed by definition id, where each entry is its own operation. Entries SHALL be editable offline. Two devices editing different fields of one task SHALL both keep their edit; the same field edited on two devices SHALL resolve by last-writer-wins for that field alone. A null value SHALL clear the field.

#### Scenario: Different fields on two devices
- **WHEN** device A sets "Cost" to 120 and device B sets "Client" to "Acme" on the same task, both offline, and both sync
- **THEN** every device shows Cost 120 and Client Acme

#### Scenario: Same field on two devices
- **WHEN** device A sets "Cost" to 120 and device B sets it to 150, both offline, and both sync
- **THEN** every device shows the value written with the greater timestamp and the task's other fields are untouched

#### Scenario: Clear a value
- **WHEN** the user clears "Client" on a task
- **THEN** the task shows the field as empty on every device after sync, and the export shows `null` for it

### Requirement: Values follow the task's project
A task SHALL show and edit the live definitions of its project only. A task in Inbox SHALL show no fields. When a task moves to another project, its values SHALL stay in the data unchanged and SHALL NOT be shown until the task returns to a project that defines them. Deleting a definition SHALL hide its values without writing to any task. No value is ever repaired or removed by a display rule.

#### Scenario: Move to another project
- **WHEN** a task with Cost 120 moves from "Kitchen" to "Garden", which has no "Cost" field
- **THEN** the panel shows Garden's fields only, the export still carries the value, and moving the task back shows Cost 120 again

#### Scenario: Definition deleted while a value is edited offline
- **WHEN** device A deletes "Cost" while device B sets a task's Cost offline, and both sync
- **THEN** the definition is deleted on both devices, the value is kept in the task's data and not shown, and nothing is lost

### Requirement: Managing definitions
The project menu SHALL offer "Fields…", a dialog that lists the project's live definitions and lets the user add one (name, type, options for a choice), rename it, edit its options, reorder it and delete it after a confirmation stating how many tasks hold a value. Whoever may edit the project's tasks (editor and above) SHALL be able to manage its definitions; viewers SHALL see values only. Names SHALL be unique within a project ignoring case. Every action SHALL be reachable with the keyboard.

#### Scenario: Add a choice field
- **WHEN** the user adds "Status" of type choice with options "Quote", "Ordered" and "Done"
- **THEN** every task of the project offers those three options in its panel and the field appears as a column and a badge

#### Scenario: Duplicate name
- **WHEN** the user adds a field named "cost" to a project that already has "Cost"
- **THEN** the dialog refuses it and keeps focus on the name

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens the project menu
- **THEN** "Fields…" is not offered, and the viewer sees values in panels, badges and columns

#### Scenario: Rename an option
- **WHEN** the user renames the option "Ordered" to "On order"
- **THEN** tasks of the project that held "Ordered" are updated to "On order" on this device as ordinary field operations, so they converge like any edit

### Requirement: Fields in the detail panel
The detail panel SHALL show a "Fields" group with one row per live definition of the task's project, in position order, each with an editor for its type: a text input, a number input, the app's date field, a choice picker, a link input that also opens the link, and a switch. An empty value SHALL read as empty, not as a default. Edits SHALL be ordinary operations applied at once. The group SHALL be absent when the project has no fields.

#### Scenario: Edit a number
- **WHEN** the user enters 120 in "Cost" and presses Enter
- **THEN** the task holds the number 120, shown with the browser locale's digit grouping, and the value is on the user's other devices after sync

#### Scenario: Open a link
- **WHEN** a task holds `https://example.com/quote.pdf` in a link field
- **THEN** the row shows the link text and an action that opens it in a new tab without passing a referrer

#### Scenario: Keyboard
- **WHEN** the panel is open and the user tabs into the Fields group
- **THEN** each editor is reachable in order and a choice picker opens with Enter or Alt+Down

### Requirement: Columns layout in the list view
In a project whose definitions are not empty, the list view SHALL offer a columns layout on wide screens: one column per live definition after the title, a header row with the names, values rendered read-only per type, rows otherwise behaving as list rows (selection, keyboard, Enter opens the panel). The choice SHALL be remembered per project per device and SHALL NOT be synced. Below 768 px the layout SHALL not be offered and badges SHALL be shown instead.

#### Scenario: Switch to columns
- **WHEN** the user enables columns in "Kitchen", which defines Cost and Status
- **THEN** rows show a Cost and a Status cell under a header row, and the same project opens in columns on the next visit on this device only

#### Scenario: Narrow screen
- **WHEN** the same project is opened at 390 px
- **THEN** rows show the values as badges and no header row

### Requirement: Field terms in queries
A term `name cmp value` SHALL match tasks holding a value under a live definition of that name (ignoring case, in any project the user sees) that satisfies the comparison for the definition's type: numbers numerically; dates with the date grammar; text, link and choice with `=` only, ignoring case; checkbox with `= true` or `= false`. `no name` SHALL match tasks of a project defining that field with no value. An unknown name SHALL warn and match nothing. Evaluation is on the device.

#### Scenario: Numeric comparison
- **WHEN** the user enters `cost > 100`
- **THEN** open tasks whose Cost is greater than 100 are listed, in every project that defines a field named Cost

#### Scenario: Text equality
- **WHEN** the user enters `client = "Acme"`
- **THEN** open tasks whose Client equals Acme in any letter case are listed, and `client > "A"` is rejected with a message that text fields support `=` only

#### Scenario: Empty value
- **WHEN** the user enters `no cost`
- **THEN** open tasks of projects that define Cost and have no value for it are listed

#### Scenario: Unknown field
- **WHEN** the user enters `budget > 10` and no project defines "Budget"
- **THEN** the query runs, lists nothing, and shows the warning that no field is named "budget"

### Requirement: Fields API
The API SHALL expose `/api/v1/fields` with list, get, create, patch and delete following the collection conventions: authentication required, soft delete, write-through to the operation log, unknown fields rejected. Create SHALL require a name, a type and an existing, non-deleted `project_id`; `type` and `project_id` SHALL be immutable. Tasks SHALL accept a `fields` object keyed by definition id in create and patch, validated against the definitions, and SHALL return it in reads.

#### Scenario: Create a field via the API
- **WHEN** a script POSTs `{"name":"Cost","type":"number","project_id":"<project>"}` with a bearer token
- **THEN** the response is 201 with the field including `id`, `position` and `created_at`, and devices receive it on their next sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials lists or creates fields
- **THEN** the response is 401 `unauthorized`

#### Scenario: Value for a field of another project
- **WHEN** a PATCH on a task carries `{"fields":{"<id>":120}}` where `<id>` belongs to a different project than the task
- **THEN** the response is 400 `invalid_input` naming the field and nothing changes

#### Scenario: Read a task
- **WHEN** a script GETs a task holding Cost 120
- **THEN** the body carries `"fields":{"<cost-id>":120}` and no `fields.<id>` keys

### Requirement: Export includes fields
The JSON export SHALL include every field definition of the user, including soft-deleted ones, under a `fields` key, and every task SHALL carry its `fields` object, including values whose definition is deleted or belongs to another project than the task.

#### Scenario: Export after defining fields
- **WHEN** the user downloads the export after adding two fields and deleting one
- **THEN** the document lists both definitions, one with `deleted_at` set, and tasks carry their values, and keeps `"format":"opentodo-export"` and `"version":1`

### Requirement: Occurrence records carry values
Completing or detaching an occurrence of a recurring task SHALL copy the series' values into the occurrence record or the detached copy, on the device and on the server alike, so the records converge to the same content.

#### Scenario: Complete a recurring task with a cost
- **WHEN** a weekly task with Cost 40 is completed on one device and the same occurrence is completed through the API
- **THEN** the single occurrence record holds Cost 40 on every device
