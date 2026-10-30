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
A push payload SHALL contain only the reminder id, the task id and the firing time, unless the subscribing device opted in to include task content; it SHALL never contain the task description. The device SHALL build the notification text from its local copy of the task when available and SHALL fall back to a generic text otherwise. Its texts SHALL be in the interface language stored on that device (OpenSpec `localization`), else English.

#### Scenario: Default payload
- **WHEN** a device subscribed without opting in and a push for "Call the dentist" is delivered
- **THEN** the payload carries no task title, and the notification shows the title read from the device's local store

#### Scenario: Opt-in payload
- **WHEN** a device subscribed with "include task titles" enabled
- **THEN** the payload carries the task title so the notification is complete even before the device has synced that task

#### Scenario: Notification in the user's language
- **WHEN** the language stored on the device is German, the date format is `day-month` and a push arrives for a task due 2026-11-03 at 15:00
- **THEN** the notification body reads `Fällig 3. Nov., 15:00` and its actions read `10 Min. später` and `Verwerfen`

#### Scenario: No language stored
- **WHEN** the device's local store has no preferences row, as on a database written by an older release
- **THEN** the notification texts are English

### Requirement: Snooze and dismiss
Snoozing a reminder SHALL set a new firing time (10 minutes, 1 hour, or tomorrow at 09:00 local) and clear its delivered time; dismissing SHALL set the dismissed time. Both SHALL be available from the in-app notification, from the system notification's actions and from the task's detail panel, and SHALL be recorded as ordinary operations, queued when offline and converging by last-writer-wins.

#### Scenario: Snooze from a system notification while offline
- **WHEN** the user taps "Snooze 10 min" on a system notification with no network
- **THEN** the reminder is rescheduled locally, fires again in 10 minutes on that device, and the change is uploaded on reconnect

#### Scenario: Dismissed on one device, snoozed on another
- **WHEN** the same fired reminder is dismissed on device A and later snoozed on device B before either syncs
- **THEN** after sync every device shows the reminder snoozed, because the later edit wins per field, and it fires once more at the snoozed time

### Requirement: Notification settings
Settings SHALL offer, per device, enabling and disabling push notifications, the "include task titles" option, and a test notification. Enabling SHALL request the browser permission and register the subscription; disabling SHALL remove the subscription on the server. Signing out SHALL remove the device's subscription. On a device running in a native shell with the `reminders` capability (OpenSpec `native-shells`), the same switch SHALL enable and disable the shell's device-scheduled reminders instead of a push subscription, the test action SHALL show a notification through the shell and report that outcome, and "include task titles" SHALL govern the titles handed to the shell; no push subscription SHALL be created on such a device.

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

#### Scenario: Enable in the Android app
- **WHEN** the user enables notifications in the Android app and grants Android's notification permission
- **THEN** no push subscription is created, the shell is handed the coming reminders, the test action shows a notification through the shell within a few seconds, and the setting reads as enabled after a reload

#### Scenario: Android permission refused
- **WHEN** the user refuses Android's notification permission
- **THEN** the setting stays off, Settings explains where to allow notifications for the app, and reminders are still delivered in-app

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

### Requirement: Reminders of completed tasks are dismissed by the server
When the server's scheduler finds a due reminder whose task is completed, it SHALL record the reminder as dismissed for that firing time with an operation authored by the server, and SHALL not examine it again until its firing time changes. Reminders on deleted tasks SHALL follow the Trash rule instead (nothing recorded). The scheduler SHALL read its candidates in bounded pages, so many stale reminders never hold back a due one.

#### Scenario: Many reminders on completed tasks
- **WHEN** a user has a thousand overdue reminders on completed tasks and one due reminder on an open task
- **THEN** the due reminder is pushed on the next check, the others are recorded as dismissed, and later checks no longer examine them

#### Scenario: New firing time after completion
- **WHEN** a dismissed reminder's task is reopened and the reminder gets a new firing time
- **THEN** it is pushed again at the new time

### Requirement: Bounded push delivery
The scheduler SHALL send reminders for several accounts at a time (eight), so one account's slow or unreachable push endpoints never hold back other accounts' reminders, and one account's sends in one pass SHALL take at most 20 seconds, the rest being sent on the next pass while the reminder is less than an hour overdue. Delivery is still recorded as a server op (`delivered_at`) that converges on every device like any other; a device that was offline shows the reminder from its own copy.

#### Scenario: Slow endpoints of one account
- **WHEN** one account's push endpoints hang and another account has a reminder due in the same pass
- **THEN** the other account's reminder is pushed without waiting for the hanging endpoints

#### Scenario: Budget spent
- **WHEN** an account's sends in one pass take longer than its budget
- **THEN** its remaining sends wait for the next pass and the reminder is not yet recorded as delivered

### Requirement: Bounded push subscriptions
An account SHALL hold at most 20 push subscriptions; registering a device beyond that SHALL replace the subscription registered least recently. A subscription whose last 20 sends failed and that delivered nothing for a day SHALL no longer be sent to until the device registers it again. Subscriptions are server state, not ops; nothing changes for offline devices.

#### Scenario: Too many devices
- **WHEN** an account with 20 subscriptions registers another device
- **THEN** the new subscription is stored and the least recently registered one is removed

#### Scenario: Dead subscription
- **WHEN** a subscription's last 20 sends failed and it has delivered nothing for a day
- **THEN** reminders are no longer sent to it, and registering it again from the device sends to it once more

### Requirement: Reminders written by calendar clients
A reminder MAY be created, changed or deleted by a CalDAV client through the alarm mapping of the `caldav-sync` capability. Such writes SHALL be ordinary reminder operations with the device id `caldav:<app-password-id>`, applied in the same batch as the task fields of the same PUT, and SHALL obey every rule of this capability afterwards: a relative reminder carries the firing time computed from the due date in that batch, a deadline reminder the one computed from the deadline, the device that later moves the due date or the deadline recomputes it, the server dismisses it when the task is completed, and the Trash rule applies. A calendar client SHALL never set or clear a reminder's delivered or dismissed times. Devices SHALL show such a reminder like any other, attributed to the calendar app in the task's history. Offline devices receive the reminder on their next sync and concurrent edits converge by per-field last-writer-wins, the deletion time being a tombstone.

#### Scenario: Reminder from a calendar app shown in the panel
- **WHEN** a calendar client adds an alarm "15 minutes before" to a task due tomorrow at 10:00
- **THEN** the task's detail panel on every device shows a reminder at 09:45 after sync, the history names the calendar app as its author, and push delivers it at 09:45

#### Scenario: Due date moved on a device afterwards
- **WHEN** a device later reschedules that task to Friday at 15:00
- **THEN** the reminder fires on Friday at 14:45 on every device and the calendar client's next fetch serves the same `-PT15M` trigger

#### Scenario: Completed task dismisses the calendar reminder
- **WHEN** the task is completed on a device before the reminder fires
- **THEN** the server records the reminder as dismissed like any other reminder, and nothing is written back to the calendar client

#### Scenario: Reminder limit respected
- **WHEN** a calendar client sends an alarm whose trigger is further from the due time than the reminder offset limit allows
- **THEN** no reminder is created and the alarm is kept as the client's own data

### Requirement: Default reminder preferences
The account SHALL have two synced default reminder preferences in Settings → Notifications, "Tasks with a time" and "Tasks with no time", each either none (the default) or an offset in minutes relative to the due time within the reminder offset limit. "Tasks with a time" SHALL offer None, At the due time, 10 minutes before, 30 minutes before, 1 hour before, 1 day before and Custom; "Tasks with no time" SHALL offer None, On the day at 09:00, 1 day before, 2 days before, 3 days before, 1 week before and Custom, all counted from 09:00 local on the due date. A stored value that is empty, malformed or outside the limit SHALL read as none and SHALL be kept. The preferences SHALL be written as operations, work offline, reach the user's other devices and converge by last-writer-wins; they are settings, not content, and are never encrypted. Changing a preference SHALL NOT change reminders that already exist.

#### Scenario: Set a default on the laptop
- **WHEN** the user sets "Tasks with a time" to "30 minutes before" on the laptop and the phone syncs
- **THEN** the phone's Settings shows "30 minutes before" and the phone applies it to the next task it schedules

#### Scenario: Default is none
- **WHEN** an account that never opened the card schedules a task at 15:00
- **THEN** no reminder is added

#### Scenario: Changing the preference leaves reminders alone
- **WHEN** a task already has a default reminder "30 minutes before" and the user changes the default to "1 hour before"
- **THEN** the task's reminder still fires 30 minutes before

### Requirement: Default reminder when a task gets a due date
When a write by a person gives a task that had no due date a due date, including creating a task with a due date, and that person's default for that kind of due is set, the writing device or server SHALL add one relative reminder with the default offset to the same batch, with its firing time computed from the new due like any relative reminder, unless the task is completed, deleted or a habit, the task already has a live relative reminder, the same write adds one (for example a quick-add reminder phrase), or the task's default reminder already exists, live or deleted by the person. The default reminder's id SHALL be derived from the person's id and the task's id, so it is created at most once per person and task. Moving a due date from one day to another SHALL NOT add a reminder. Undo, redo, restoring a version or restoring from the Trash SHALL NOT add one; Undo of the write that added it SHALL remove it, and a later due date MAY add it again. The reminder SHALL be an ordinary reminder of the writing person: shown and removable in the task's Reminders, delivered in the app, by push and by the native shells, served to calendar clients as an alarm, applied locally first so it works offline, uploaded with the due change in one batch, and converging like any reminder. Two devices that give the same task a due date offline SHALL end with one default reminder.

#### Scenario: Schedule an undated task
- **WHEN** "Tasks with a time" is "30 minutes before" and the user sets an undated task to tomorrow at 15:00
- **THEN** the task gets a reminder "30 minutes before" that fires tomorrow at 14:30, shown in its Reminders and pushed at 14:30

#### Scenario: Date-only task
- **WHEN** "Tasks with no time" is "1 day before" and the user captures "Pay rent friday" in quick add
- **THEN** the task is due Friday and has a reminder that fires on Thursday at 09:00

#### Scenario: Quick-add reminder wins
- **WHEN** a default is set and the user captures "Call Anna tomorrow 10am remind me 5 min before"
- **THEN** the task has only the 5-minutes-before reminder

#### Scenario: Rescheduling adds nothing
- **WHEN** a task due Monday with its default reminder is moved to Wednesday
- **THEN** the same reminder now fires relative to Wednesday and no second reminder is added

#### Scenario: Deleted default stays deleted
- **WHEN** the user deletes a task's default reminder, clears the due date and later sets a new one
- **THEN** no reminder is added

#### Scenario: Offline on two devices
- **WHEN** the phone and the laptop each schedule the same undated task offline and both sync
- **THEN** the task has exactly one default reminder on every device, with the firing time of the due date that won

#### Scenario: Shared project
- **WHEN** a member with a default set schedules an undated task of a shared project
- **THEN** that member gets a default reminder on it, and the other members get none from that write

#### Scenario: Undo removes it
- **WHEN** the user sets a date on an undated task, which adds a default reminder, and chooses Undo
- **THEN** the task has no due date and the default reminder is removed in the same step, and setting a date again adds it again

#### Scenario: Habits get none
- **WHEN** a default is set and the user schedules a habit
- **THEN** no reminder is added

### Requirement: Default reminder follows the kind of due
When a write changes a task's due between a date only and a date with a time, and the task's default reminder is live, relative, and still has the offset of the person's default for the old kind, its offset SHALL become the person's default for the new kind and its firing time SHALL be recomputed in the same batch; if the new kind has no default, or the person changed the reminder, it SHALL be left as it is. Clearing the due date SHALL keep the reminder without a firing time, as for any relative reminder. The change converges like any reminder edit.

#### Scenario: A time is added
- **WHEN** "Tasks with no time" is "1 day before", "Tasks with a time" is "30 minutes before", and a task due Friday with its untouched default reminder gets the time 15:00
- **THEN** the reminder becomes "30 minutes before" and fires on Friday at 14:30

#### Scenario: Edited reminder is left alone
- **WHEN** the user changed that default reminder to "2 hours before" and then removes the task's time
- **THEN** the reminder keeps its offset of 2 hours before

### Requirement: Default reminders through the API, the CLI and agents
`POST /api/v1/tasks` and `PATCH /api/v1/tasks/{id}` SHALL accept the optional query parameter `default_reminder` (`true` or `false`, default `false`); with `true` the server SHALL apply the person's defaults to that write with the same rule as the app, adding the reminder in the same batch with a firing time computed in the person's time zone. The routes keep their policies: they need a signed-in session or a token, and `read` tokens are refused. `ot add` and `ot edit` SHALL send `default_reminder=true` unless `--no-default-reminder` or `--remind` is given, and the browser extension SHALL send it. The MCP and agent write tools that create or schedule tasks SHALL apply the rule for the calling person, and so SHALL these routes when called with an `agent` token, since such writes run through the agent write tools. CalDAV writes, calendar sync, issue import, the importer, the Markdown vault, automation rules and email capture SHALL NOT apply it. The same rule SHALL be implemented in the server and the web app and pinned by shared test vectors.

#### Scenario: CLI add with a due date
- **WHEN** "Tasks with a time" is "10 minutes before" and the user runs `ot add "Dentist" --due tomorrow --time 09:00`
- **THEN** the task has one reminder that fires tomorrow at 08:50

#### Scenario: Script without the flag
- **WHEN** an integration creates a dated task with `POST /api/v1/tasks` and no query parameter
- **THEN** no default reminder is added

#### Scenario: Agent schedules a task
- **WHEN** an AI agent with an `agent` token uses `schedule_tasks` to give an undated task a time
- **THEN** the task gets the person's default reminder in the same change, attributed to the agent in the task's history

#### Scenario: Unauthenticated request
- **WHEN** a request without a session or token calls `POST /api/v1/tasks?default_reminder=true`
- **THEN** it is refused with 401 and nothing is written

#### Scenario: Invalid flag
- **WHEN** a client calls `PATCH /api/v1/tasks/{id}?default_reminder=maybe`
- **THEN** the request is refused with 400 and the error envelope, and nothing is written

#### Scenario: Calendar client creates a dated task
- **WHEN** a CalDAV client PUTs a new task with a due date and no alarm while a default is set
- **THEN** the task is created without a reminder
