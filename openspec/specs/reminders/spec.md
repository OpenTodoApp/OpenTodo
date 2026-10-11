# reminders Specification

## Purpose
Defines reminders attached to tasks: when they fire, how they follow a task's due date, how they are delivered in the app and through web push, how devices subscribe to push, and how snooze and dismiss behave offline and across devices.

## Requirements

### Requirement: Reminder entity
A reminder SHALL belong to exactly one task and SHALL carry a kind (relative or absolute), an offset in minutes for relative reminders, a firing time as a Unix millisecond instant, optional delivered and dismissed times, a creation time and an optional deletion time. A task MAY have several reminders. Every reminder write SHALL be a field-level operation applied locally first, so reminders can be managed offline and converge by the same per-field last-writer-wins rule as tasks.

#### Scenario: Add a reminder offline
- **WHEN** the device is offline and the user adds a reminder to a task
- **THEN** the reminder appears in the task's detail panel at once, survives a reload, and is uploaded on the next successful sync

#### Scenario: Concurrent edits converge
- **WHEN** device A changes a reminder's offset while device B deletes the same reminder, both offline, and both sync
- **THEN** every device shows the reminder deleted, because the deletion time is a tombstone field

#### Scenario: Invalid reminder values
- **WHEN** a client submits a reminder with an unknown kind, a non-integer offset, a firing time that is not a positive number, or a task id that is not a string
- **THEN** the write is rejected as an invalid operation and nothing changes

### Requirement: Relative reminders follow the due time
A relative reminder SHALL fire at the task's due time plus its offset (negative offsets mean before). For a task with a due date but no time, the due time SHALL be taken as 09:00 in the local time zone of the device that computes it. The device that changes a task's due date or time SHALL recompute the firing time of every relative reminder of that task in the same batch of operations, so the task and its reminders move together.

#### Scenario: Due date moved
- **WHEN** a task due tomorrow at 10:00 with a "30 minutes before" reminder is rescheduled to Friday at 15:00
- **THEN** the reminder fires on Friday at 14:30 on every device after sync

#### Scenario: Due date cleared
- **WHEN** the due date of a task with relative reminders is cleared
- **THEN** its relative reminders are kept but have no firing time and do not fire until the task gets a due date again

#### Scenario: Two devices reschedule offline
- **WHEN** two devices move the same task to different dates offline and both sync
- **THEN** the due date and the reminder firing time on every device both come from the device whose edit won, never a mix of the two

### Requirement: Absolute reminders
An absolute reminder SHALL fire at a moment chosen by the user, independent of the task's due date, and SHALL be displayed in the viewer's local time zone. Changing the task's due date SHALL not move an absolute reminder.

#### Scenario: Absolute reminder across zones
- **WHEN** a user in one time zone sets a reminder for 09:00 their time and views the task from a device in a zone two hours ahead
- **THEN** the second device shows the reminder at 11:00 and both devices fire it at the same instant

#### Scenario: Reminder on an undated task
- **WHEN** the user adds an absolute reminder to a task that has no due date
- **THEN** the reminder is accepted and fires at the chosen moment

### Requirement: In-app delivery
While the app is open on a device, a reminder whose firing time has passed and that is neither dismissed nor on a completed or deleted task SHALL be shown as an in-app notification naming the task, with snooze and dismiss actions reachable from the keyboard. In-app delivery SHALL work without network access and SHALL not duplicate a system notification already shown on the same device for the same reminder.

#### Scenario: Reminder fires while working offline
- **WHEN** the device is offline, the app is open and a reminder's firing time arrives
- **THEN** an in-app notification for the task appears within one minute and offers Snooze and Dismiss

#### Scenario: Completed task
- **WHEN** a task is completed before one of its reminders fires
- **THEN** that reminder is not shown on any device

#### Scenario: App in the foreground with push enabled
- **WHEN** a push for a reminder arrives on a device where the app is focused
- **THEN** the reminder is shown in-app only, and no system notification is added

### Requirement: Push subscriptions per device
A device MAY register a web push subscription with `POST /api/v1/push/subscriptions` and remove it with `DELETE /api/v1/push/subscriptions/{id}`; `GET /api/v1/push/vapid-key` SHALL return the server's public push key. All three routes SHALL require authentication. Subscriptions SHALL be stored per user and device, one per device, and are device state outside the op log and the export.

#### Scenario: Subscribe
- **WHEN** an authenticated device posts a valid subscription with its device id
- **THEN** the response is 201 with the subscription id, and reminders due afterwards are pushed to that device

#### Scenario: Unauthenticated request
- **WHEN** a request to any `/api/v1/push/` route carries no valid session or token
- **THEN** the response is 401 with the error envelope and code `unauthenticated`

#### Scenario: Invalid subscription
- **WHEN** the posted body lacks an endpoint URL or the encryption keys the browser provides
- **THEN** the response is 400 with code `invalid_input` and nothing is stored

#### Scenario: Push service rejects the subscription
- **WHEN** the push service answers that a stored subscription is gone
- **THEN** the server removes that subscription and the device is offered to re-enable notifications on its next visit

### Requirement: Push delivery
The server SHALL check for due reminders at least once a minute and SHALL send one push per due reminder to every subscribed device of the task's owner, unless the reminder is dismissed or its task is completed or deleted. Delivery SHALL be recorded on the reminder as an operation authored by the server, so devices learn that it fired. A reminder SHALL be pushed at most once per firing time; a snooze sets a new firing time and SHALL be pushed again.

#### Scenario: Closed app receives a push
- **WHEN** a reminder is due and the user's phone has the app installed and closed with notifications enabled
- **THEN** the phone shows a system notification within one minute of the firing time

#### Scenario: Server restarts over a firing time
- **WHEN** the server is down when a reminder is due and starts again later
- **THEN** the reminder is pushed once after startup and is not pushed again

#### Scenario: Push disabled by the operator
- **WHEN** the operator has turned push off
- **THEN** the push routes answer 404 `not_found`, no push is sent, and in-app delivery still works

### Requirement: Push key material needs no configuration
On the first start that needs them, the server SHALL generate a push signing key pair and store it under the data directory with the same permissions as the database. The key pair SHALL be reused on later starts and SHALL be included in a backup of the data directory. No environment variable SHALL be required.

#### Scenario: Fresh data directory
- **WHEN** the server starts with an empty data directory and a device enables notifications
- **THEN** a public key is served and the subscription succeeds without any operator action

#### Scenario: Restore from backup
- **WHEN** the data directory is restored on a new host
- **THEN** existing subscriptions keep receiving pushes without devices re-subscribing

### Requirement: Push payload privacy
A push payload SHALL contain only the reminder id, the task id and the firing time, unless the subscribing device opted in to include task content; it SHALL never contain the task description. The device SHALL build the notification text from its local copy of the task when available and SHALL fall back to a generic text otherwise.

#### Scenario: Default payload
- **WHEN** a device subscribed without opting in and a push for "Call the dentist" is delivered
- **THEN** the payload carries no task title, and the notification shows the title read from the device's local store

#### Scenario: Opt-in payload
- **WHEN** a device subscribed with "include task titles" enabled
- **THEN** the payload carries the task title so the notification is complete even before the device has synced that task

### Requirement: Snooze and dismiss
Snoozing a reminder SHALL set a new firing time (10 minutes, 1 hour, or tomorrow at 09:00 local) and clear its delivered time; dismissing SHALL set the dismissed time. Both SHALL be available from the in-app notification, from the system notification's actions and from the task's detail panel, and SHALL be recorded as ordinary operations, queued when offline and converging by last-writer-wins.

#### Scenario: Snooze from a system notification while offline
- **WHEN** the user taps "Snooze 10 min" on a system notification with no network
- **THEN** the reminder is rescheduled locally, fires again in 10 minutes on that device, and the change is uploaded on reconnect

#### Scenario: Dismissed on one device, snoozed on another
- **WHEN** the same fired reminder is dismissed on device A and later snoozed on device B before either syncs
- **THEN** after sync every device shows the reminder snoozed, because the later edit wins per field, and it fires once more at the snoozed time

### Requirement: Notification settings
Settings SHALL offer, per device, enabling and disabling push notifications, the "include task titles" option, and a test notification. Enabling SHALL request the browser permission and register the subscription; disabling SHALL remove the subscription on the server. Signing out SHALL remove the device's subscription.

#### Scenario: Enable on this device
- **WHEN** the user enables notifications and grants the browser permission
- **THEN** the device is subscribed, the test action shows a notification, and the setting reads as enabled after a reload

#### Scenario: Permission denied
- **WHEN** the browser permission is denied
- **THEN** the setting stays off with an explanation and reminders are still delivered in-app

### Requirement: Reminders in the Trash
A reminder SHALL not be delivered, by push or in the app, while its task is deleted or while the task's project or any ancestor project is deleted. Suppression SHALL not record delivery or dismissal, so after a restore a reminder fires at its time, and one whose time passed meanwhile is delivered once on the next check. Devices SHALL apply the rule from local data offline; it converges because it derives from synced deletion times.

#### Scenario: Task in a trashed project
- **WHEN** a reminder falls due on a task whose project is in the Trash
- **THEN** no push is sent, no in-app notification appears, and the reminder is not marked delivered

#### Scenario: Sub-project under a trashed ancestor
- **WHEN** concurrent offline edits leave a live sub-project under a deleted parent and a reminder on one of its tasks falls due
- **THEN** the reminder is not delivered

#### Scenario: Restored after the firing time
- **WHEN** the project is restored after a reminder's firing time passed while it was in the Trash
- **THEN** the reminder is delivered once on the next check and not again

#### Scenario: Deleted task
- **WHEN** a reminder falls due on a deleted task
- **THEN** it is not delivered until the task is restored

#### Scenario: Offline device
- **WHEN** a device without network holds a fired reminder on a task whose project it trashed locally
- **THEN** the in-app notification is not shown, and it appears again after the user restores the project
