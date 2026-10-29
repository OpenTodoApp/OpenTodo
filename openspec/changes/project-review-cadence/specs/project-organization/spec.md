# Spec Delta

## ADDED Requirements

### Requirement: Maintenance status
A project SHALL have an additive `status` field with the values `active` and `maintenance`.

Reading rules:
- An empty, missing or unknown value SHALL read as `active`, and clients SHALL keep the stored value unchanged.

Sync and storage:
- It SHALL be written as an ordinary project operation, applied locally at once (offline too), synced to every member of a shared project, and converge by last-writer-wins.
- It is not user-written content and is never encrypted.
- It SHALL be included in the JSON export.

While a project is in maintenance:
- its health, stalled marker and next-action marker follow `statistics` "Maintenance in project health" and `method-views` "Maintenance projects are not flagged"
- its tasks SHALL be listed, counted, dated and reminded exactly as before
- the project page's lead line SHALL read "In maintenance"

Where it is set:
- The project menu and the All projects row menu SHALL offer "Put in maintenance", or "End maintenance" while it is in maintenance. Either choice writes one operation and offers Undo.
- In `lists` mode the menu items SHALL be shown only for a project in maintenance.
- In a shared project only those who may change the project's other fields (owner and admins) SHALL be offered the item.

Through the API:
- The `projects` collection SHALL accept and return `status` on create and patch under the same authentication and role rules, refusing any other value with `400 invalid_input`.
- The agent tools' `update_project` SHALL accept it, and project output and resources SHALL carry it.
- `ot projects` SHALL show it.
- A project file in the Markdown vault SHALL carry `opentodo-status: maintenance` while it is in maintenance, and leave the key out otherwise; editing the key SHALL write the field on the next sync.

#### Scenario: Put a project in maintenance offline
- **WHEN** the device is offline and the owner chooses "Put in maintenance" on "Garden"
- **THEN** the project page reads "In maintenance" at once, a toast offers Undo, and the other members see it after sync

#### Scenario: Concurrent changes
- **WHEN** one device ends maintenance on "Garden" and another puts it back, both offline, and both sync
- **THEN** every device shows the value written with the greater timestamp

#### Scenario: Simple lists
- **WHEN** a user in `lists` mode opens the menu of an active project
- **THEN** no maintenance item is shown, exactly as before this change

#### Scenario: Set via the API
- **WHEN** a script PATCHes `{"status":"maintenance"}` to a project it may change, with a bearer token
- **THEN** the response is 200 with the value, and devices show the project in maintenance after sync

#### Scenario: Invalid status
- **WHEN** a script PATCHes `{"status":"paused"}` to a project
- **THEN** the response is 400 `invalid_input` naming `status`, and the project is unchanged

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials PATCHes a project's `status`
- **THEN** the response is 401 `unauthorized` and nothing is written

#### Scenario: Editor of a shared project
- **WHEN** an editor of the shared project "Household" opens its menu
- **THEN** no maintenance item is offered, and a PATCH of `status` by that editor is refused with 403 as for the project's other fields
