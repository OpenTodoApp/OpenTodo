# Spec Delta

## Purpose
Lets a user connect a calendar account they already use (any CalDAV server with an app password, or Google Calendar through OAuth) so their dated tasks appear there as events, and moving, resizing, renaming or deleting those events changes the tasks, under one owner switch and the outbound policy shared with webhooks, calendar subscriptions and issue connections.

## ADDED Requirements

### Requirement: Off by default, enabled by the owner
Calendar sync SHALL be disabled until the owner enables it in Settings or through `PUT /api/v1/settings/calendar-sync`. While disabled, every `/api/v1/calendar-sync` route SHALL answer 404 `calendar_sync_disabled` and the server SHALL contact no calendar. The switch SHALL take effect without a restart, SHALL be stored as the server setting `calendar_sync.enabled` and SHALL be audited as `settings.changed`. Every signed-in user SHALL read it through `GET /api/v1/settings/calendar-sync`, which also says whether Google can be connected; only the owner SHALL change it.

#### Scenario: Default
- **WHEN** a server starts and the owner has never touched the setting
- **THEN** `GET /api/v1/settings/calendar-sync` reports `enabled: false`, `GET /api/v1/calendar-sync/connections` answers 404 and no outbound request is made

#### Scenario: Owner enables it
- **WHEN** the owner sends `PUT /api/v1/settings/calendar-sync` with `{"enabled": true}`
- **THEN** the routes work on the next request, enabled connections are synced within a minute, and the audit log holds a `settings.changed` event for `calendar_sync.enabled`

#### Scenario: Member cannot change it
- **WHEN** a member calls `PUT /api/v1/settings/calendar-sync`
- **THEN** the response is a 403 `forbidden` error and the setting is unchanged

#### Scenario: Unauthenticated
- **WHEN** `/api/v1/settings/calendar-sync` is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Google client configured by the owner
The owner SHALL be able to store a Google OAuth client id and secret through `PUT /api/v1/settings/calendar-sync/google`, or set them with the optional `OPENTODO_GOOGLE_CLIENT_ID` and `OPENTODO_GOOGLE_CLIENT_SECRET` (or `OPENTODO_GOOGLE_CLIENT_SECRET_FILE`), which then take precedence and make the fields read-only. The secret SHALL be stored in `<data>/secrets/calendar-sync.json` and SHALL never be returned; `GET /api/v1/settings/calendar-sync/google` SHALL report the client id, whether a secret is set, whether the values come from the environment and the redirect URI to register. Changing the client SHALL need the owner's session or an admin token and SHALL be audited as `settings.changed` without the values. Without a complete client, Google SHALL NOT be offered.

#### Scenario: Owner stores a client
- **WHEN** the owner sends `PUT /api/v1/settings/calendar-sync/google` with a client id and a secret
- **THEN** the response reports `secret_set: true` without the secret, and members' `GET /api/v1/settings/calendar-sync` reports `google: true`

#### Scenario: Full token refused
- **WHEN** a full-access API token calls `PUT /api/v1/settings/calendar-sync/google`
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes

#### Scenario: Environment wins
- **WHEN** `OPENTODO_GOOGLE_CLIENT_ID` and `OPENTODO_GOOGLE_CLIENT_SECRET` are set
- **THEN** the GET reports `from_env: true`, the PUT answers 409 `managed_by_environment`, and Google can be connected

### Requirement: Connection management
A signed-in user SHALL create, list, change, enable or disable and delete their own calendar connections through Settings and `GET`/`POST /api/v1/calendar-sync/connections` and `PATCH`/`DELETE /api/v1/calendar-sync/connections/{id}`. A user SHALL have at most 3 connections and SHALL never see or touch another account's. Connections are server data: never operations, never synced, never exported, so managing them needs a connection to the server; offline, the panel shows the last loaded connections with actions off. Deleting a connection SHALL remove its secret and stop all syncing; tasks SHALL stay as they are and events already written SHALL stay in the calendar.

#### Scenario: Create a CalDAV connection
- **WHEN** a user POSTs `{"server_url": "https://caldav.fastmail.com", "username": "me@example.com", "password": "<app password>"}` from a recently confirmed session
- **THEN** the server discovers the account's calendars, the response is 201 with the connection in the state `choose_calendar` and its calendars that hold events, and the password is never in the response

#### Scenario: Unauthenticated
- **WHEN** any `/api/v1/calendar-sync` route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Password refused
- **WHEN** the calendar server answers 401 to discovery
- **THEN** the response is a 400 `unauthorized_remote` error naming the password, and nothing is stored

#### Scenario: Fourth connection
- **WHEN** a user with 3 connections creates another
- **THEN** the response is a 409 `limit_reached` error and nothing is stored

#### Scenario: Another user's connection
- **WHEN** a user changes or deletes a connection id of a different account
- **THEN** the response is a 404 `not_found` error

#### Scenario: Stale session
- **WHEN** a session that has not proved its identity within the fresh window creates a connection or sends a new password
- **THEN** the response is a 403 `reauth_required` error and nothing changes

#### Scenario: Choose the calendars
- **WHEN** a user PATCHes `{"target": "<calendar url>", "read": ["<calendar url>"]}` with calendars of that connection
- **THEN** the connection is due for a sync at once, and a URL that is not one of its writable calendars is refused with 400 `invalid_input`

### Requirement: Connecting Google
With a Google client configured, a user SHALL connect Google Calendar through `POST /api/v1/calendar-sync/google/start`, which needs a recently confirmed session and returns Google's authorization address with a single-use state bound to the user and a PKCE challenge, valid for 10 minutes. Google SHALL return the browser to `GET /api/v1/calendar-sync/google/callback`, which SHALL accept only the signed-in session the state belongs to, exchange the code, store the refresh token as the connection's secret, discover the calendars and redirect to the Calendar sync panel. The same flow with a connection id SHALL reconnect that connection.

#### Scenario: Connect
- **WHEN** a user starts the flow, consents at Google and Google redirects back with a code and the state
- **THEN** a Google connection exists in the state `choose_calendar`, the refresh token is only in the secrets file, and the browser lands on Settings → Integrations → Calendar sync

#### Scenario: Wrong state
- **WHEN** the callback arrives with an unknown, expired, used or another user's state
- **THEN** no connection is created and the browser lands on the panel with an error

#### Scenario: No client
- **WHEN** a user calls the start route while no Google client is configured
- **THEN** the response is a 409 `google_not_configured` error

### Requirement: Tasks written to the calendar
For a connection with a target calendar, the server SHALL write each task of the user's task feed selection (open, visible to the user, with a due date from 30 days back to 365 days ahead) as one event `<task-id>.ics` with the task id as UID: a timed task as an event of its estimate (30 minutes without one) in its zone, or floating; a date-only task as an all-day event only when **Include tasks without a time** is on. A recurring task SHALL be written as its next occurrence. Creation SHALL use `If-None-Match: *`, changes and deletions `If-Match` with the stored ETag. Completed, deleted, undated and out-of-window tasks SHALL have their event removed. Offline edits reach the calendar after the device syncs and the next cycle runs.

#### Scenario: A timed task
- **WHEN** a task is due 2026-11-03 at 09:00 in Europe/Berlin with an estimate of 45 minutes
- **THEN** within a cycle the target calendar holds an event from 09:00 to 09:45 Europe/Berlin titled like the task

#### Scenario: A date-only task with the option off
- **WHEN** a task is due 2026-11-03 without a time and the option is off
- **THEN** no event is written for it

#### Scenario: Task completed
- **WHEN** the user completes a task whose event exists
- **THEN** the next cycle deletes the event

### Requirement: Calendar changes come back to the task
For the events it wrote, the server SHALL read changes from the target calendar every 5 minutes and about 20 seconds after the user's own task changes, using `sync-collection` with a sync token where the server supports it and an ETag listing otherwise. A new start, end or all-day state SHALL become the task's due (a timed event's length its estimate); a new title SHALL become the task's title; a deleted event SHALL leave the task without a due date and SHALL never delete or complete it. Every change SHALL be an op applied through the op log with device `calsync:<connection-id>`, so devices converge on it with their next sync like with any other device's edit. Events the server did not write SHALL never change and SHALL never become tasks.

#### Scenario: Event moved
- **WHEN** the user drags the event of a task from 09:00 to 14:00 the next day in their calendar app
- **THEN** after the next cycle the task is due the next day at 14:00, its history names calendar sync, and the user's devices show it after syncing

#### Scenario: Event made longer
- **WHEN** the user stretches a 30-minute event to 90 minutes
- **THEN** the task's estimate becomes 90 minutes

#### Scenario: Event deleted
- **WHEN** the user deletes the event of a task in the calendar
- **THEN** the task stays open without a due date and no event is written for it again

#### Scenario: A server without sync tokens
- **WHEN** the calendar server supports no `sync-collection`
- **THEN** changes are found from the ETag listing with the same results

### Requirement: Conflicts resolve to the newest change
Each cycle SHALL read the calendar before it writes to it. When both the task and its event changed the same thing since the last cycle, the change made last SHALL win: the event's last-modified time against the task's, and a task that wins SHALL be written over the event. A write the user may not make (a viewer on a shared project) SHALL be undone in the calendar by writing the task's version back.

#### Scenario: Task changed later
- **WHEN** the event is moved to 10:00 and later, before the next cycle, the task is moved to 16:00 in OpenTodo
- **THEN** after the cycle both say 16:00

#### Scenario: Event changed later
- **WHEN** the task is moved to 16:00 and later, before the next cycle, the event is moved to 10:00
- **THEN** after the cycle both say 10:00

### Requirement: Connected calendars in Day and Week
The events of the calendars a user chose to show, and the target calendar's own events that OpenTodo did not write, SHALL be stored by the server and served and drawn read-only in Day, Week and the Plan like subscribed calendars' events, also while calendar feeds are off. They SHALL be refreshed by the sync cycle only when the calendar changed.

#### Scenario: A read calendar
- **WHEN** a user chooses their "Family" calendar to show
- **THEN** its events appear in Day and Week with the calendar's colour, and the device keeps them for offline display like other calendars' events

### Requirement: Sync health and backoff
Each connection SHALL show its state, its last successful sync, its last error with its time and the counts of the last cycle. A failed cycle SHALL be retried after 5 minutes, doubling up to 6 hours. A refused password or a revoked Google grant SHALL stop the connection in the state `reconnect` until the user enters a new password or reconnects Google; a target calendar that no longer exists SHALL stop it until another one is chosen; a private target SHALL stop it. `POST /api/v1/calendar-sync/connections/{id}/sync` SHALL run a cycle (with discovery) now, at most 12 times an hour per user.

#### Scenario: Password revoked
- **WHEN** the user revokes the app password at their provider
- **THEN** the next cycle stops the connection with state `reconnect`, nothing is synced, and entering a new password resumes it

#### Scenario: Sync now limit
- **WHEN** a user asks for a 13th sync within an hour
- **THEN** the response is a 429 `rate_limited` error

### Requirement: Calendar sync screen
Settings → Integrations → Calendar sync SHALL show the owner switch (the owner can change it), for the owner the Google client fields, and the user's connections as cards that lead with their state, the target calendar, the calendars shown, the last sync and the last error, with Sync now, Choose calendars, Reconnect, Disable or Enable, and Delete. Adding a connection SHALL offer CalDAV (server, username, app password) and, with a Google client, Connect Google. Calendars SHALL be chosen with the shared picker.

#### Scenario: Choose after connecting
- **WHEN** a connection is created
- **THEN** the panel asks for the calendar to write tasks into and the calendars to show, and the connection stays in `choose_calendar` until one is chosen
