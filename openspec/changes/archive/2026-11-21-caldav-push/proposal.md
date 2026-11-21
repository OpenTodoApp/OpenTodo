## Why

Issue #1585. Calendar apps connected to `/dav/` (DAVx⁵ with Tasks.org, Thunderbird, Apple Reminders) only learn about a change when they poll. A short interval costs battery on every poll that finds nothing, and a long one leaves the phone silently stale. The reporter measured a change made on the phone reaching the server in about half a second; the delay is entirely in the other direction.

WebDAV-Push (draft-bitfire-webdav-push, published 29 October 2026, experimental) closes that gap. A client subscribes to a collection with a Web Push subscription. The server sends it a short, encrypted "this collection changed" message, and the client syncs that collection. No task data is sent. DAVx⁵ has supported the client side since 4.4.10, through any UnifiedPush distributor or Google's push service. Nextcloud, Xandikos and rustical support the server side.

OpenTodo already has most of what it takes: RFC 8291 message encryption and RFC 8292 VAPID keys in `internal/push`, sync tokens on every calendar, and one jobs model for background work.

## What Changes

- **Advertised only while on.** A new owner switch, **Push to calendar apps** (`caldav.push`, off by default, `OPENTODO_CALDAV_PUSH` override), sits under CalDAV. While it and CalDAV are on, the endpoint advertises WebDAV-Push:
  - `webdav-push` in the `DAV` header;
  - the `transports` property with the server's VAPID public key;
  - a `topic` and `supported-triggers` on the calendar home and on each calendar.
  While it is off, none of this appears and registration answers 403 `push-not-available`.
- **Subscribe, renew, unsubscribe.**
  - A client registers with `POST` and a `push-register` body on a calendar or the calendar home. It gets 201 or 204, a `Location` registration URL under `/dav/push/` and an `Expires` header.
  - Re-posting the same push resource renews the registration.
  - `DELETE` on the registration URL removes it.
  - A registration belongs to the app password that made it: it is removed when the password is revoked, and it only covers calendars inside the password's scope.
- **One small message per change.**
  - When a calendar's content changes (a task added, changed, moved, completed or deleted, from any device), each subscription to that calendar or to the home gets one push. The push is an encrypted `push-message` holding the calendar's `topic` and new `sync-token`, sent with VAPID through `internal/outbound`.
  - Messages to one subscription are merged and rate-limited.
  - A write sent with `Push-Dont-Notify` does not notify the listed registrations of the caller's own account.
- **Ends cleanly.**
  - A subscription expires: at most 7 days, at least 3 days when the client asks for that.
  - A push service's 404 or 410 removes the subscription.
  - Repeated failures over a tolerance window remove it too.
  - Expired subscriptions are never sent to.

Out of scope:
- property-update triggers (renaming a project or changing its colour);
- push for the calendar feeds and calendar sync connections, which are other features;
- any push service run or chosen by OpenTodo (the client brings its own);
- CardDAV;
- key rotation messages (the VAPID key is the one `internal/push` keeps, which does not rotate today).

No **BREAKING** change: no op field, no mandatory environment variable. Clients that don't speak WebDAV-Push see no difference.

Roadmap: a follow-up of `caldav` ("CalDAV two-way sync"), listed as `caldav-push`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `caldav-sync`: new requirements "Push to calendar apps", "Push subscriptions" and "Push messages".

## Impact

- `internal/caldav` (the WebDAV-Push XML).
- `internal/httpapi/davroutes` (properties, `POST` registration, `/dav/push/` delete, `Push-Dont-Notify`).
- A new `internal/davpush` package (subscriptions, change detection, sending).
- A new job in `internal/tenant/jobs.go`.
- One migration: `dav_push_subscriptions`, a side table, never an op.
- The owner switch in `internal/settings` and its route through `internal/httpapi/switch.go`.
- One toggle on the CalDAV settings screen, with its label in every locale.
- `docs/caldav.md`.

No new dependency.
