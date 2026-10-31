# calendar-sync Specification

## Purpose
Lets a user connect a calendar account they already use (any CalDAV server with an app password, or Google Calendar through OAuth) so their dated tasks appear there as events, and moving, resizing, renaming or deleting those events changes the tasks, under one owner switch and the outbound policy shared with webhooks, calendar subscriptions and issue connections.

## Requirements

### Requirement: Off by default, enabled by the owner
Calendar sync SHALL be disabled until the owner enables it in Settings or through `PUT /api/v1/settings/calendar-sync`. While disabled, every `/api/v1/calendar-sync` route SHALL answer 404 `calendar_sync_disabled` and the server SHALL contact no calendar. The switch SHALL take effect without a restart, SHALL be stored as the server setting `calendar_sync.enabled` and SHALL be audited as `settings.changed`. Every signed-in user SHALL read it through `GET /api/v1/settings/calendar-sync`, which also says whether Google and whether Microsoft can be connected; only the owner SHALL change it.

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

#### Scenario: Which providers can be connected
- **WHEN** a Google client is complete and no Microsoft client is set
- **THEN** `GET /api/v1/settings/calendar-sync` reports `google: true` and `microsoft: false`, and no Microsoft host is contacted

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
Settings → Integrations → Calendar sync SHALL show the owner switch (the owner can change it), for the owner the Google client fields and the Microsoft client fields (client id, tenant, secret, the redirect URI to register and the last refusal of the secret), and the user's connections as cards that lead with their state, the target calendar, the calendars shown, the last sync and the last error, with Sync now, Choose calendars, Reconnect, Disable or Enable, and Delete. Adding a connection SHALL offer CalDAV (server, username, app password), with a Google client Connect Google, and with a Microsoft client Connect Microsoft. Calendars SHALL be chosen with the shared picker. On a 360 px wide screen the ways to add a connection SHALL be stacked full-width buttons without horizontal scrolling.

#### Scenario: Choose after connecting
- **WHEN** a connection is created
- **THEN** the panel asks for the calendar to write tasks into and the calendars to show, and the connection stays in `choose_calendar` until one is chosen

#### Scenario: Microsoft offered
- **WHEN** a Microsoft client is complete and a member opens the panel
- **THEN** "Connect Microsoft" is offered next to "Connect CalDAV" and, when a Google client is set, "Connect Google"

#### Scenario: Microsoft not offered
- **WHEN** no Microsoft client is set
- **THEN** members see no Microsoft button and the owner sees the Microsoft client fields with a link to the guide

### Requirement: Spans as all-day events
A task of the user's task feed selection that is drawn as a span (OpenSpec `multi-day-tasks`) SHALL be written to the target calendar as one all-day event from its start date to its do-on date (`DTEND` the day after), whatever **Include tasks without a time** says. When such an event is changed in the calendar and stays all-day, its first day SHALL become the task's start and its last day the task's do-on date (time and zone kept), written as ops through the op log with device `calsync:<connection-id>`; an event changed to a timed event SHALL set the due as for any task and SHALL leave the start and the flag alone. The conflict rule of this capability SHALL apply to the start and the due together.

#### Scenario: Trip written as an all-day event
- **WHEN** a task is a span from 2026-11-03 to 2026-11-05 and the option for tasks without a time is off
- **THEN** within a cycle the target calendar holds an all-day event from 3 November to 5 November inclusive titled like the task

#### Scenario: Event moved in the calendar app
- **WHEN** the user drags that event to start on 10 November in their calendar app
- **THEN** after the next cycle the task is a span from the 10th to the 12th, and its history names calendar sync

#### Scenario: Viewer's span edited in the calendar
- **WHEN** the task belongs to a shared project the user only views and the user lengthens its event
- **THEN** the next cycle writes the task's own range back over the event and the task is unchanged

### Requirement: Microsoft client configured by the owner
The owner SHALL be able to store a Microsoft app registration's client id, client secret and tenant through `PUT /api/v1/settings/calendar-sync/microsoft`, or set them with the optional `OPENTODO_MICROSOFT_CLIENT_ID`, `OPENTODO_MICROSOFT_CLIENT_SECRET` (or `OPENTODO_MICROSOFT_CLIENT_SECRET_FILE`) and `OPENTODO_MICROSOFT_TENANT`, which then take precedence and make the fields read-only. The tenant SHALL default to `common` and SHALL be `common`, `organizations`, `consumers`, a tenant GUID or a domain name, otherwise 400 `invalid_input` naming `tenant`. The secret SHALL be stored in `<data>/secrets/calendar-sync.json` and SHALL never be returned; `GET /api/v1/settings/calendar-sync/microsoft` SHALL report the client id, the tenant, whether a secret is set, whether the values come from the environment and the redirect URI to register. Both routes SHALL be for the owner only and refused on the demo instance; changing the client SHALL need the owner's session or an admin token and SHALL be audited as `settings.changed` without the values. Without a complete client, Microsoft SHALL NOT be offered and no Microsoft host SHALL be contacted.

#### Scenario: Owner stores a client
- **WHEN** the owner sends `PUT /api/v1/settings/calendar-sync/microsoft` with a client id, a secret and no tenant
- **THEN** the response reports `tenant: "common"` and `secret_set: true` without the secret, and members' `GET /api/v1/settings/calendar-sync` reports `microsoft: true`

#### Scenario: Unauthenticated
- **WHEN** `/api/v1/settings/calendar-sync/microsoft` is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Member refused
- **WHEN** a member calls `GET /api/v1/settings/calendar-sync/microsoft`
- **THEN** the response is a 403 `forbidden` error

#### Scenario: Full token refused
- **WHEN** a full-access API token calls `PUT /api/v1/settings/calendar-sync/microsoft`
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes

#### Scenario: Bad tenant
- **WHEN** the owner saves the tenant `contoso corp`
- **THEN** the response is a 400 `invalid_input` error naming `tenant` and the previous client stays

#### Scenario: Environment wins
- **WHEN** `OPENTODO_MICROSOFT_CLIENT_ID` and `OPENTODO_MICROSOFT_CLIENT_SECRET` are set
- **THEN** the GET reports `from_env: true`, the PUT answers 409 `managed_by_environment`, and Microsoft can be connected

#### Scenario: Demo instance
- **WHEN** the route is requested on a public demo instance
- **THEN** the response is a 403 `demo_restricted` error before authentication

### Requirement: Connecting Microsoft
With a Microsoft client configured, a user SHALL connect an Outlook.com or Microsoft 365 calendar through `POST /api/v1/calendar-sync/microsoft/start`, which needs a recently confirmed session and returns Microsoft's authorization address for the configured tenant with the delegated scopes `offline_access`, `User.Read`, `Calendars.ReadWrite` and `MailboxSettings.Read`, a single-use state bound to the user and the Microsoft provider, and a PKCE challenge, valid for 10 minutes. Microsoft SHALL return the browser to `GET /api/v1/calendar-sync/microsoft/callback`, which SHALL accept only the signed-in session the state belongs to, exchange the code, store the refresh token as the connection's secret, read the account's address and mailbox time zone, list the account's calendars and redirect to the Calendar sync panel with the connection in `choose_calendar`. The same flow with a connection id SHALL reconnect that connection. A refusal by Microsoft SHALL land on the panel with `denied` when the user declined, `admin_consent_required` when the user's organisation requires an administrator's approval, and `authorization_failed` otherwise. Connections remain server data, never ops, and count toward the limit of 3.

#### Scenario: Connect a personal account
- **WHEN** a user with an Outlook.com account starts the flow, consents and Microsoft redirects back with a code and the state
- **THEN** a Microsoft connection exists in the state `choose_calendar` with the account's address, the refresh token is only in the secrets file, and the browser lands on Settings → Integrations → Calendar sync

#### Scenario: Unauthenticated
- **WHEN** `POST /api/v1/calendar-sync/microsoft/start` is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Stale session
- **WHEN** a session that has not proved its identity within the fresh window calls the start route
- **THEN** the response is a 403 `reauth_required` error

#### Scenario: No client
- **WHEN** a user calls the start route while no Microsoft client is configured
- **THEN** the response is a 409 `microsoft_not_configured` error

#### Scenario: Wrong state
- **WHEN** the callback arrives with an unknown, expired, used, another user's or a Google state
- **THEN** no connection is created and the browser lands on the panel with `invalid_state`

#### Scenario: Organisation requires approval
- **WHEN** a work account's tenant does not let users consent and Microsoft returns an admin-approval error
- **THEN** no connection is created and the panel says the organisation's administrator must approve the app

#### Scenario: Fourth connection
- **WHEN** a user with 3 connections completes the flow
- **THEN** no connection is created and the panel shows `limit_reached`

### Requirement: Outlook events through Microsoft Graph
For a Microsoft connection the server SHALL run the same cycle as for CalDAV and Google, through Microsoft Graph: read before write, the same task selection and window, the same mapping of start, end, all-day state and title to the task, the same conflict rule, the same limits, and every task change as an op applied through the op log with device `calsync:<connection-id>`, so devices converge on it with their next sync and offline edits reach Outlook after the device syncs and the next cycle runs. Changes SHALL be read with a delta query per calendar over the sync window, kept as a cursor and rebuilt from a full listing when the window has moved or Microsoft no longer accepts the cursor. Each event the server creates SHALL carry an OpenTodo extended property holding the task id and a transaction id that makes a retried creation idempotent, and SHALL be addressed by an immutable id; changes and deletions SHALL use `If-Match` with the stored ETag. Only events carrying the property SHALL change tasks; other events SHALL never change and never become tasks. A zoned task SHALL be written in its zone; a floating task and an all-day task SHALL be written in the mailbox's time zone and read back in it, so its wall-clock time and date round-trip; when the mailbox zone is unknown, UTC SHALL be used and the connection card SHALL say so. For an encrypted account, events SHALL be titled "Encrypted item" with no body, and a title changed in Outlook SHALL NOT be applied.

#### Scenario: A timed task in Outlook
- **WHEN** a task is due 2026-11-03 at 09:00 in Europe/Berlin with an estimate of 45 minutes and the connection's target is the Outlook calendar "Tasks"
- **THEN** within a cycle that calendar holds an event from 09:00 to 09:45 Europe/Berlin titled like the task, carrying the OpenTodo property

#### Scenario: Event dragged in Outlook
- **WHEN** the user drags that event to 14:00 the next day in Outlook on the web
- **THEN** after the next cycle the task is due the next day at 14:00, its history names calendar sync, and the user's devices show it after syncing

#### Scenario: Floating task round-trip
- **WHEN** the mailbox time zone is Pacific Standard Time and a floating task is due at 08:30
- **THEN** the event starts at 08:30 Pacific time, and moving it to 10:00 there makes the task floating at 10:00

#### Scenario: Other events untouched
- **WHEN** the target calendar also holds the user's own meeting without the OpenTodo property
- **THEN** the meeting is never changed, never becomes a task, and is shown read-only in Day and Week

#### Scenario: Retried creation
- **WHEN** the response to an event creation is lost and the cycle creates the event again
- **THEN** Outlook holds one event for the task

#### Scenario: Concurrent change
- **WHEN** an update is answered 412 because the event changed in Outlook since it was read
- **THEN** the write is not forced, and the next cycle resolves it by the newest change

#### Scenario: Cursor expired
- **WHEN** Microsoft answers 410 to the stored delta cursor
- **THEN** the cycle rebuilds the cursor from a full listing of the window with the same results and no duplicate event

#### Scenario: Encrypted account
- **WHEN** an encrypted account's task is written to Outlook and the user renames the event there
- **THEN** the event was titled "Encrypted item" with no body, the task's title is unchanged, and a move of the event still moves the task

### Requirement: Microsoft throttling and refused credentials
A `429` or `503` answer from Microsoft SHALL end the cycle with the reason `rate_limited`, keep what the cycle already did, and delay the next attempt by at least the `Retry-After` the answer names, doubling from 5 minutes up to 6 hours. A refresh token Microsoft rejects as invalid or revoked SHALL stop the connection in `reconnect` until the user reconnects. A client secret Microsoft rejects SHALL stop every Microsoft connection with the reason `microsoft_client_refused`, SHALL be shown to the owner in the Microsoft client form, and saving a new secret SHALL clear that stop and schedule a cycle for each. A rotated refresh token SHALL be stored before the access token it came with is used. A target calendar that no longer exists SHALL stop the connection with `calendar_missing`, and one the user can no longer write with `calendar_read_only`, until another one is chosen.

#### Scenario: Throttled
- **WHEN** Graph answers 429 with `Retry-After: 120` in the middle of a cycle
- **THEN** the events written before it stay written, the connection reads `rate_limited`, and no request is made to Microsoft for that connection for at least 5 minutes

#### Scenario: Access revoked
- **WHEN** the user removes OpenTodo's access in their Microsoft account and the next cycle refreshes the token
- **THEN** the connection stops with state `reconnect`, nothing is synced, and reconnecting resumes it

#### Scenario: Client secret expired
- **WHEN** the owner's client secret expired and a cycle refreshes a token
- **THEN** every Microsoft connection stops with `microsoft_client_refused`, the owner's form says Microsoft refused the client secret, and saving a new secret resumes them within a minute
