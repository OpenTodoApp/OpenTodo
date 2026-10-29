## ADDED Requirements

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

## MODIFIED Requirements

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
