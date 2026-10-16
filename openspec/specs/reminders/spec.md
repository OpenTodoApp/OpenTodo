# reminders Specification

## Purpose
Defines reminders attached to tasks: when they fire, how they follow a task's due date, how they are delivered in the app and through web push, how devices subscribe to push, and how snooze and dismiss behave offline and across devices.

## Requirements

### Requirement: Reminder entity
A reminder SHALL belong to exactly one task and SHALL carry a kind (relative, absolute or deadline), an offset in minutes for relative and deadline reminders, a firing time as a Unix millisecond instant, optional delivered and dismissed times, a creation time and an optional deletion time. A task MAY have several reminders. Every reminder write SHALL be a field-level operation applied locally first, so reminders work offline and converge by per-field last-writer-wins like tasks.

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

#### Scenario: Test reports the server's outcome
- **WHEN** the user runs the test on a subscribed device
- **THEN** a real push is sent to this device through the push service and Settings shows the outcome reported by the server, never a success message the device cannot back up

#### Scenario: Test without a subscription
- **WHEN** the user runs the test on a device that has no subscription on the server
- **THEN** Settings says this device is not subscribed, offers to enable notifications, and does not claim a notification was sent

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

### Requirement: Test notifications confirm arrival
A test push SHALL be shown as a system notification even while the app is in front, SHALL not replace an earlier test notification, SHALL carry no task content, and SHALL be reported back to any open window of the app on that device. Settings SHALL say "received" only after that report and, if none arrives within a short wait, SHALL say the push was accepted but not seen on this device, with likely causes.

#### Scenario: Received while the settings page is open
- **WHEN** a test push arrives on the device whose Settings started it
- **THEN** a system notification is shown even though the app is focused, and Settings reports that the notification was received on this device

#### Scenario: Accepted but not seen
- **WHEN** the push service accepted the test but no receipt reaches the page within the wait
- **THEN** Settings says the push was accepted but not seen, and suggests checking the operating system's notification settings for the browser or app, focus and do-not-disturb modes, and the installed app on iOS

#### Scenario: Repeated tests
- **WHEN** the user runs the test twice in a row
- **THEN** both runs show a notification; the second does not silently replace the first

#### Scenario: Test after the device reconnects
- **WHEN** the push service delivers a test to a device that was offline when it was sent
- **THEN** the notification is shown on arrival and no reminder, op or delivery mark is created by it, so nothing has to converge across devices

### Requirement: Push delivery checklist
Settings → Notifications SHALL show, per device, whether each condition for push holds: the browser supports push, permission is granted, the offline service worker is active, this device has a subscription on the server, the server's last send to it succeeded, and the last test was received. Every failing condition SHALL name an action that fixes it or explain why it cannot be fixed on this device.

#### Scenario: No service worker
- **WHEN** the app runs without an active offline service worker, as in a development build
- **THEN** the checklist marks the service worker step as failing, explains that push needs the installed or production app and that in-app reminders still work, and does not offer an enable action that would fail

#### Scenario: Permission blocked
- **WHEN** the browser permission for the site is denied
- **THEN** the permission step fails with instructions to allow notifications in the browser's site settings, and later steps are shown as not checked

#### Scenario: Push service failing
- **WHEN** the server's recent sends to this device's subscription failed
- **THEN** the server step fails with the last error and the failure count, and offers to re-enable notifications

#### Scenario: Offline device
- **WHEN** the device is offline while the checklist is shown
- **THEN** local steps are still checked, the server steps say they cannot be checked offline, and the test action is unavailable with an explanation

### Requirement: Push test route
`POST /api/v1/push/test` with `{deviceId}` SHALL send one test push to the caller's subscription for that device and answer 200 with an outcome: `sent`, `no_subscription`, `gone` (subscription removed) or `failed` with the push service status. It SHALL require a session or a full-access token, SHALL be limited per account, and SHALL record the send in the subscription's delivery status like a reminder push.

#### Scenario: Test delivered to the push service
- **WHEN** an authenticated user posts their device id and that device has a subscription the push service accepts
- **THEN** the response is 200 with outcome `sent` and a test id, and the subscription's last delivery time is updated

#### Scenario: Device without a subscription
- **WHEN** the posted device id has no subscription for the caller
- **THEN** the response is 200 with outcome `no_subscription` and no push is sent

#### Scenario: Subscription gone
- **WHEN** the push service answers that the subscription no longer exists
- **THEN** the response is 200 with outcome `gone`, the server removes the subscription, and the device is offered to re-enable notifications

#### Scenario: Push service rejects the message
- **WHEN** the push service answers with any other error or cannot be reached
- **THEN** the response is 200 with outcome `failed` and the status or error, and the failure is counted on the subscription

#### Scenario: Unauthenticated request
- **WHEN** the request carries no valid session or token
- **THEN** the response is 401 with the error envelope and code `unauthorized`

#### Scenario: Read-only or agent token
- **WHEN** the request is authenticated with a read or agent API token
- **THEN** the response is 403 with code `insufficient_scope` and no push is sent

#### Scenario: Missing device id
- **WHEN** the body has no device id
- **THEN** the response is 400 with code `bad_request` and no push is sent

#### Scenario: Too many tests
- **WHEN** an account sends more test pushes than the limit allows within the window
- **THEN** the response is 429 with code `rate_limited` and no push is sent

#### Scenario: Push turned off or demo instance
- **WHEN** the operator has turned push off, or the instance runs in demo mode
- **THEN** the route answers 404 `not_found` when push is off and 403 `demo_restricted` in demo mode, and no outbound request is made

### Requirement: Reminder times in the user's format
The reminder field SHALL show and accept reminder dates and times in the user's date and time formats (OpenSpec `date-time-preferences`), and SHALL use the same date and time controls as the due field. Reminder toasts SHALL use the same formats. When a device builds a push notification's text from its local copy of the task, it SHALL format the due date and time with the user's preferences as stored on that device, and SHALL fall back to the browser locale when it has none.

#### Scenario: Reminder in day-month and 24-hour format
- **WHEN** the date format is `day-month`, the time format is `24h`, and the user adds an absolute reminder for 3 November at 9:00
- **THEN** the reminder list shows a date like `Tue 3 Nov, 09:00` and the stored firing time is the matching instant

#### Scenario: Push text uses the preference
- **WHEN** the time format is `12h`, the date format is `month-day`, and a push arrives for a task due 2026-11-03 at 15:00 that the device has stored locally
- **THEN** the system notification reads `Due Nov 3, 3:00 PM` instead of `Due 2026-11-03 15:00`

#### Scenario: Offline preference change applies to the next notification
- **WHEN** the user switches the time format to `24h` while offline and a reminder fires in the app
- **THEN** the reminder toast shows the time on a 24-hour clock

### Requirement: Deadline reminders
A reminder of kind `deadline` SHALL fire at 09:00, in the local time zone of the device that computes it, on the task's deadline plus its offset in minutes (negative means before). It SHALL have no firing time while the task has no deadline and SHALL NOT move when the due date changes. The device that changes the deadline SHALL recompute the firing time of every live deadline reminder of that task in the same batch, so both converge from one edit.

#### Scenario: Add a deadline reminder
- **WHEN** a task has the deadline 2026-11-06 and the user adds a reminder "1 day before the deadline"
- **THEN** a reminder of kind `deadline` with offset −1440 minutes is created and fires on 2026-11-05 at 09:00 local time

#### Scenario: Deadline moved offline
- **WHEN** the device is offline and the user moves that task's deadline to 2026-11-13
- **THEN** the reminder's firing time becomes 2026-11-12 at 09:00 at once, and the deadline and the firing time reach other devices in one batch

#### Scenario: Due date change leaves it alone
- **WHEN** the due date of a task with a deadline reminder is rescheduled
- **THEN** the deadline reminder's firing time is unchanged and only the task's relative reminders move

#### Scenario: Deadline cleared
- **WHEN** the deadline of a task with a deadline reminder is cleared
- **THEN** the reminder is kept, has no firing time and does not fire until the task gets a deadline again

#### Scenario: Older client leaves it alone
- **WHEN** a device running a client that predates this kind receives a deadline reminder and reschedules the task's due date
- **THEN** it stores and forwards the reminder untouched and recomputes only the relative reminders it knows, so the deadline reminder keeps its firing time

### Requirement: Reminders created with their task
A reminder MAY be written in the same operation set as the task it belongs to, for example from a quick-add line or `ot add`. A relative reminder in that set SHALL carry the firing time computed from the task's due date in the same set (09:00 for a date-only due), and an absolute reminder SHALL carry the moment chosen. The set SHALL be applied locally as one transaction, queued as one upload, and SHALL converge like any reminder written later.

#### Scenario: Offline task with a reminder
- **WHEN** the device is offline and a task due tomorrow at 15:00 is captured with a "30 minutes before" reminder
- **THEN** the task and the reminder appear together, the reminder's firing time is tomorrow 14:30 local, and both upload in the next successful sync

#### Scenario: Reminder on a task that does not exist yet on another device
- **WHEN** device B receives the reminder op before it has applied the task op from the same set
- **THEN** after both are applied the reminder is shown on the task with its firing time, and nothing fires in between because the task is unknown

#### Scenario: Created through the REST API
- **WHEN** a client creates a task with `POST /api/v1/tasks` and then its reminder with `POST /api/v1/reminders` naming the new task id
- **THEN** the reminder is accepted with the firing time computed by the server for a relative reminder, exactly as for a reminder added later
