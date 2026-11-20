## Context

CalDAV is served by `internal/httpapi/davroutes`, authenticated by app passwords (`internal/auth/apppasswords.go`), narrowed by each password's scope (`internal/syncscope`). Every calendar's sync token is the account's op cursor (`urn:opentodo:sync:<seq>`), so a token says "nothing changed for this account since", and a calendar's CTag changes only when one of its resources does. Web Push already exists for reminders: `internal/push` holds the server's VAPID key pair, `Encrypt` (RFC 8291, aes128gcm) and `VAPIDAuthorization` (RFC 8292). Background work is a `jobs.Job` woken by `jobs.Signal` (`Changed` after every commit). Requests to addresses a user supplied go through `internal/outbound`.

The draft (draft-bitfire-webdav-push-00, namespace `https://bitfire.at/webdav-push`) defines discovery properties, a `push-register` POST, a `DELETE` on the registration URL, and an encrypted `push-message` body. It is experimental and may change; this design keeps every draft-specific name in one place (`internal/caldav/push.go`) so a later revision is a small diff.

## Goals / Non-Goals

**Goals:** DAVx⁵ (and any client that follows the draft) stops polling short intervals: a change on any device reaches a subscribed calendar app within seconds. No task data leaves the server in a push. Nothing is sent unless the owner turned it on and a user's client subscribed.

**Non-Goals:** property-update triggers; CardDAV; a push service operated by OpenTodo; VAPID key rotation messages; push for calendar feeds or calendar sync connections.

## Decisions

### D1. An owner switch, off by default

`caldav.push` is a `settings.Switch` (default off, `OPENTODO_CALDAV_PUSH` override), shown under CalDAV in Settings as **Push to calendar apps**, with routes and the 404 gate from `internal/httpapi/switch.go`. It only matters while CalDAV is on. Off by default because a push goes to a third-party push service the client chose (often Google's FCM through DAVx⁵), which AGENTS.md rule 5 allows only as a target the user configured, and the owner decides whether the server sends anywhere at all. While it is off, nothing is advertised and registration answers 403 `push-not-available`.

### D2. What is advertised

While on, `OPTIONS` on any `/dav/` resource adds `webdav-push` to `DAV`. The calendar home and every calendar in the password's scope answer PROPFIND with:
- `transports` → `web-push` → `vapid-public-key type="p256ecdsa"` (the existing VAPID public key, base64url);
- `topic`: base64url of the first 16 bytes of HMAC-SHA256(key, user id ‖ calendar path), the key a random 32-byte secret in `<data>/secrets/dav-push.json` created on first use. Stable for the calendar, unique across the server, meaningless outside it, so it reveals nothing to the push service;
- `supported-triggers` → `content-update` with `DAV:depth` 1.

Resources (single VTODOs) advertise nothing: a client subscribes to a calendar or the home.

### D3. Registration

`POST` on a calendar or the calendar home with `Content-Type: application/xml` and a `push-register` root: one `subscription` with one `web-push-subscription` (`push-resource`, `content-encoding` `aes128gcm`, `subscription-public-key type="p256dh"`, `auth-secret`), one `trigger`, an optional `expires`.

- The push resource must be an absolute `https` URL that `internal/outbound` accepts (no private targets unless the owner allowed them); the keys must decode to a P-256 point and 16 bytes. Anything else is 403 `invalid-subscription`.
- A trigger without `content-update` is 403 `no-supported-trigger`; a deeper depth is lowered to 1, `property-update` is ignored.
- Expiry: the requested `expires`, clamped to between 3 and 7 days from now; 7 days when absent. The response carries `Expires`.
- Same user, same collection, same push resource: the row is updated and the answer is 204 with the same `Location`. Otherwise a new row and 201 with `Location: <base>/dav/push/<id>` (an `ids.Secret`).
- Limits: at most 20 live subscriptions per user; the 21st is 403 `push-not-available`. Registration is rate-limited with `s.limit("dav-push", 30, time.Hour)` per app password.
- Refused on the public demo (`OPENTODO_DEMO`), like other routes that make the server send outbound requests.

`DELETE /dav/push/<id>` with the same app password's credentials removes it (204); another user's or an unknown id is 404. A registration is tied to its app password: revoking the password removes its subscriptions, and only calendars inside the password's scope can be subscribed (outside: 404, as every request there).

### D4. Data model

One migration adds `dav_push_subscriptions` (server configuration like app passwords, never an op): `id`, `user_id`, `app_password_id`, `collection` (the calendar path or `home`), `push_resource`, `p256dh`, `auth`, `expires_at`, `created_at`, `last_notified_seq`, `last_ok_at`, `failures`, `last_error`. No new op field, no change to the op schema. Purge and account deletion delete the user's rows; backup and export leave them out, as they do app passwords.

### D5. When a push is sent

A new job `dav-push` in `internal/tenant/jobs.go`, woken by `Changed`:
1. For each user with live subscriptions whose op cursor moved past the lowest `last_notified_seq` of their subscriptions, build the password's DAV view once (the same `davView` CalDAV serves, so scope, Inbox membership and moves are counted exactly as a sync-collection report counts them).
2. A calendar subscription is due when the calendar's resources changed since its `last_notified_seq` (what a sync-collection report with that token would list); a home subscription when any calendar in scope changed or a calendar appeared or disappeared.
3. Each due subscription gets one message and its `last_notified_seq` moves to the cursor. Several commits before the job runs give one message (merging, as the draft allows). A subscription is sent to at most once per 30 seconds; a later change waits for the next run.

`Push-Dont-Notify` on a CalDAV write: after the write commits, every listed registration of the same user (or all of the user's, for `*`) has `last_notified_seq` set to the new cursor, so the writer's own change does not wake it; a change from elsewhere still does. Registration URLs of another user are ignored.

### D6. The message

Body (UTF-8 XML): `push-message` with `topic` and `content-update` holding the calendar's `DAV:sync-token`; for a home subscription, the home's topic. Encrypted with `push.Encrypt`, sent with `VAPIDAuthorization` (the existing subject), `Content-Encoding: aes128gcm`, `TTL: 86400`, `Urgency: normal`, and `Topic:` the subscription's topic, so the push service replaces an undelivered older message. All through `internal/outbound`, with the push package's timeout. The message names no task, project or person.

### D7. Failures and expiry

2xx resets `failures`. 404 or 410 deletes the row. Any other answer or a transport error increments `failures` and records `last_error`; a row whose `failures` reached 10 and whose `last_ok_at` is older than 3 days is deleted (the draft's tolerance window). Expired rows are never sent to and are deleted by the job. Nothing here changes a task.

## Risks / Trade-offs

- **An experimental draft.** Names may change; they are confined to `internal/caldav/push.go`, and the feature is off by default.
- **Metadata at the push service.** The push service sees when a calendar changed and the topic, not what changed. That is why the switch is off by default and the docs say it.
- **Load.** Building a DAV view per user per run costs what one sync-collection report costs; the 30-second minimum per subscription and the per-user cursor check bound it.
- **Size.** No new dependency; a few hundred lines of Go; image size unchanged within rounding. Runtime memory: one small row per subscription.

## Interface budget

One toggle on the existing CalDAV settings section (no new screen, no list chrome, no shortcut, no task property).
