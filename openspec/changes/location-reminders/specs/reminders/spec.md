## ADDED Requirements

### Requirement: Location reminders
A reminder of kind `arrive` or `leave` SHALL fire when a device watching it enters, respectively leaves, the circle of its radius around its task's location, using the current position of a linked place. It SHALL be armed on a device while it is neither deleted nor dismissed, its task is open and not in the Trash, the task's location has coordinates, the device runs a shell with the `geofences` capability and "Location reminders on this phone" on, and, for an account with end-to-end encryption, the device is unlocked. It SHALL fire on every crossing in its direction, at most once an hour per reminder on a device, as a system notification offering Done, which completes the task, and Dismiss, which sets the dismissed time, both as ordinary operations queued offline. A firing SHALL write nothing by itself. The server SHALL never evaluate, deliver or dismiss a location reminder, and no device SHALL fire it in-app or by push. The device's position SHALL never leave the device.

#### Scenario: Arrive at the post office
- **WHEN** "Buy stamps" has the location "Post office" and an `arrive` reminder of 150 m, and the user walks into that circle with the Android app closed
- **THEN** the phone shows "Buy stamps" (or the generic text) with Done and Dismiss, and no request about the position reaches the server

#### Scenario: GPS jitter at the edge
- **WHEN** the phone crosses the same circle three times within ten minutes
- **THEN** one notification is shown

#### Scenario: Done from the notification while offline
- **WHEN** the user taps Done with no network
- **THEN** the task is completed locally, the reminder is disarmed on this phone, and the completion reaches the other devices on reconnect

#### Scenario: Dismissed on one phone
- **WHEN** the user dismisses the reminder on their phone and their tablet syncs afterwards
- **THEN** the tablet removes the region and does not notify on the next crossing

#### Scenario: Place moved
- **WHEN** the task's location links the place "Gym" and the place's pin is moved on another device
- **THEN** after sync the phone watches the new position without any write to the task or the reminder

#### Scenario: Locked encrypted account
- **WHEN** the user locks an account with end-to-end encryption on the phone
- **THEN** the shell removes every region and no location reminder fires until the device is unlocked

### Requirement: Setting a location reminder
The task panel's reminder menu SHALL offer "When I arrive" and "When I leave" for a task whose location has coordinates, with a radius from 100 to 5,000 metres preset to 150, and SHALL disable both with the explanation "Add a location with a point on the map first" and a link to the location editor otherwise. The reminder chip SHALL name the direction and the place. Where the reminder cannot fire (a browser, a shell without the capability, or the setting off on this device), the chip SHALL say "Fires on your phone". Location reminders SHALL be created, changed and deleted offline as reminder operations that converge by last-writer-wins.

#### Scenario: Create in the browser
- **WHEN** the user adds "When I leave" with 300 m to "Take the parcel", whose location is the place "Home", in a desktop browser
- **THEN** the chip reads "Leaving Home" with "Fires on your phone", and the user's phone with location reminders on arms it after sync

#### Scenario: Address without a point
- **WHEN** the task's location is only the address "Via Roma 1"
- **THEN** both items are disabled with the explanation and a link that opens the location editor

### Requirement: Location reminders through the API
`POST /api/v1/reminders` and `PATCH /api/v1/reminders/{id}` SHALL accept the kinds `arrive` and `leave` with `radius_m`, under the existing authentication and role rules. A missing or out-of-range radius, a firing time or offset on a location kind, or a radius on another kind SHALL be refused with 400 `invalid_operation`. Reads and the export SHALL include location reminders like any reminder, and the command-line client SHALL list them in a task's details.

#### Scenario: Create through the API
- **WHEN** a client with a full token posts `{"task_id": "<id>", "kind": "arrive", "radius_m": 200}`
- **THEN** the response is 201 with the reminder and `fire_at: null`, and the user's phone arms it after sync

#### Scenario: Unauthenticated
- **WHEN** the same request arrives without credentials
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Radius out of range
- **WHEN** a client posts an `arrive` reminder with `radius_m: 20000`
- **THEN** the response is 400 `invalid_operation` and no reminder exists

## MODIFIED Requirements

### Requirement: Reminder entity
A reminder SHALL belong to exactly one task and SHALL carry a kind (relative, absolute, deadline, or the location kinds arrive and leave), an offset in minutes for relative and deadline reminders, a radius in metres from 100 to 5,000 for location reminders (see "Location reminders"), a firing time as a Unix millisecond instant (always empty for location reminders), optional delivered and dismissed times, a creation time and an optional deletion time. A task MAY have several reminders. Every reminder write SHALL be a field-level operation applied locally first, so reminders work offline and converge by per-field last-writer-wins like tasks.

#### Scenario: Add a reminder offline
- **WHEN** the device is offline and the user adds a reminder to a task
- **THEN** the reminder appears in the task's detail panel at once, survives a reload, and is uploaded on the next successful sync

#### Scenario: Concurrent edits converge
- **WHEN** device A changes a reminder's offset while device B deletes the same reminder, both offline, and both sync
- **THEN** every device shows the reminder deleted, because the deletion time is a tombstone field

#### Scenario: Invalid reminder values
- **WHEN** a client submits a reminder with an unknown kind, a non-integer offset, a firing time that is not a positive number, or a task id that is not a string
- **THEN** the write is rejected as an invalid operation and nothing changes

#### Scenario: Invalid location reminder values
- **WHEN** a client submits an `arrive` reminder with a radius of 50, a `leave` reminder with a firing time, or a relative reminder with a radius
- **THEN** the write is rejected as an invalid operation and nothing changes
