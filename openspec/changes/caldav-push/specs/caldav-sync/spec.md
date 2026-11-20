## ADDED Requirements

### Requirement: Push to calendar apps
The owner SHALL be able to turn on push to calendar apps (WebDAV-Push, draft-bitfire-webdav-push) with a switch under CalDAV in Settings, off by default, with an optional `OPENTODO_CALDAV_PUSH` override. Only the owner SHALL change it; every signed-in user SHALL be able to read it. While it and CalDAV are on, every `/dav/` resource SHALL list `webdav-push` in its `DAV` header, and the calendar home and each calendar inside the app password's scope SHALL answer PROPFIND with `transports` holding the server's VAPID public key, a `topic` that is stable for that calendar and reveals nothing about it, and `supported-triggers` with `content-update` at depth 1. While it is off, none of these SHALL appear and a registration SHALL be refused with 403 `push-not-available`. The setting is server configuration, never an operation.

#### Scenario: Advertised while on
- **WHEN** the owner has turned on CalDAV and push to calendar apps, and DAVx⁵ sends PROPFIND for `transports`, `topic` and `supported-triggers` on a calendar
- **THEN** the response holds the VAPID public key, a topic, and `content-update` with depth 1, and `OPTIONS` lists `webdav-push` in `DAV`

#### Scenario: Off by default
- **WHEN** CalDAV is on and push was never turned on
- **THEN** no resource lists `webdav-push` or the three properties, and a `push-register` POST answers 403 `push-not-available`

#### Scenario: Member cannot turn it on
- **WHEN** a member calls the route that changes the push setting
- **THEN** the response is a 403 `forbidden` error and the setting is unchanged

### Requirement: Push subscriptions
A CalDAV client authenticated with an app password SHALL register a subscription by sending `POST` with a `push-register` body to a calendar or the calendar home in the password's scope: one Web Push subscription (an absolute `https` push resource the server's outbound policy accepts, `aes128gcm`, a P-256 public key and an auth secret), a trigger with `content-update`, and an optional expiry. The server SHALL answer 201 with a `Location` registration URL for a new subscription, 204 with the same `Location` when the same user registers the same push resource on the same collection again (renewing it), and an `Expires` header with the expiry it chose, between 3 and 7 days from now (7 days when none was asked). A subscription SHALL end when it expires, when `DELETE` is sent to its registration URL by the same user, when its app password is revoked, when the push service answers 404 or 410, or after repeated failures over at least 3 days. A user SHALL have at most 20 live subscriptions. Subscriptions are server configuration, never operations, and are left out of the user's export like app passwords.

#### Scenario: DAVx⁵ subscribes
- **WHEN** DAVx⁵ posts a `push-register` with a UnifiedPush endpoint to the calendar "Garden" with an app password
- **THEN** the response is 201 with a `Location` under `/dav/push/` and an `Expires` 7 days ahead, and posting it again a day later answers 204 with the same `Location` and a new `Expires`

#### Scenario: Authentication required
- **WHEN** a `push-register` POST or a `DELETE` on a registration URL arrives without valid app password credentials
- **THEN** the response is 401 and nothing is stored or removed

#### Scenario: Invalid subscription
- **WHEN** the push resource is `http://` or a private address the owner did not allow, or the public key does not decode to a P-256 point, or no trigger has `content-update`
- **THEN** the response is 403 with `invalid-subscription` (or `no-supported-trigger` for the trigger) and nothing is stored

#### Scenario: Another user's registration
- **WHEN** a user sends `DELETE` to a registration URL that belongs to another user
- **THEN** the response is 404 and the subscription is unchanged

#### Scenario: Outside the scope
- **WHEN** an app password scoped to the workspace Work posts a `push-register` to Personal's calendar
- **THEN** the response is 404, as for every request on a calendar outside the scope

### Requirement: Push messages
When the content of a subscribed calendar changes (a task in it is added, changed, completed, deleted, purged, or moved in or out, from any device, including changes made offline that reach the server later), the server SHALL send each live subscription to that calendar, and each subscription to the calendar home, one Web Push message within about a minute: a `push-message` holding the calendar's topic and its new sync token, encrypted with aes128gcm (RFC 8291) and signed with the server's VAPID key (RFC 8292), naming no task, project or person. Changes close together SHALL be merged into one message, and one subscription SHALL get at most one message per 30 seconds. A CalDAV write carrying `Push-Dont-Notify` SHALL not notify the listed registrations of the same user (all of them for `*`) about that write; registration URLs of other users SHALL be ignored. The sync token in a message SHALL be one a `sync-collection` report accepts, so the client converges with every other device by syncing as it does today. No message SHALL be sent to an expired subscription, while the switch is off, or on the public demo.

#### Scenario: A change in the web app wakes the phone
- **WHEN** DAVx⁵ is subscribed to "Garden" and the user adds a task to Garden in the web app
- **THEN** within about a minute the push resource receives one encrypted message with Garden's topic and a sync token whose `sync-collection` report lists the new task

#### Scenario: The writer is not woken by its own change
- **WHEN** DAVx⁵ uploads a task to Garden with `Push-Dont-Notify` naming its own registration URL
- **THEN** that subscription gets no message for the upload, and a subscription of the same user on another device still gets one

#### Scenario: A gone subscription
- **WHEN** the push service answers 410 to a message
- **THEN** the subscription is removed and gets no further message

#### Scenario: Many changes at once
- **WHEN** 200 tasks of a subscribed calendar change in one import
- **THEN** the subscription gets one message, not 200
