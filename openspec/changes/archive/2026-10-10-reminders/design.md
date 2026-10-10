# Design

## Context

Tasks already carry a floating `due` with an optional time. There is no way to be told about a task when the app is closed. The client is a PWA with a service worker, the server is a single Go binary with SQLite under one data directory, and every write must be an op in the per-user log. Web push is the only notification channel available to an installed web app on every platform; it requires a server-side key pair, per-device subscriptions and encrypted payloads.

## Goals / Non-Goals

**Goals:**
- Reminders that are plain op-log data: offline-editable, convergent, exported, visible through REST sync.
- Zero-configuration push: keys generated under the data directory, no account with any vendor.
- Privacy by default: payloads carry identifiers, not content.
- In-app delivery that works with no server and no permission at all.

**Non-Goals:**
- Delivery through e-mail, chat or webhooks (`webhooks`).
- Location reminders, per-project defaults, reminder digests.
- Guaranteeing delivery when the push service drops a message; the in-app path and the task list remain the source of truth.

## Decisions

### D1. Reminders are a new op-log entity, not an array on the task
Chosen: entity `reminder` with fields `task_id` (string), `kind` (`"relative"` | `"absolute"`), `offset_minutes` (number or null), `fire_at` (number or null, Unix ms), `delivered_at` (number or null), `dismissed_at` (number or null), `created_at` (number), `deleted_at` (number or null).
- Why: a task can have several reminders, and each needs its own LWW fields so that "device A snoozes, device B dismisses" converges per reminder instead of one device's whole array clobbering the other's. The schema change is purely additive (new entity, new validation kind for `kind`).
- Alternative: `reminders` array on the task, replaced wholesale like `labels`. Rejected: concurrent snooze and edit lose data; also the server scheduler would have to parse every task value.

### D2. Store a resolved instant, recompute on the editing device
`fire_at` is always an absolute instant computed by the client that last touched the reminder or the task's `due`. Relative reminders also keep `offset_minutes` so they can be recomputed. `updateTask` in the client data layer recomputes `fire_at` for all relative reminders of a task whenever `due` is in the patch, emitting the reminder ops with the same HLC timestamp as the due op.
- Why: the server scheduler then needs no time-zone knowledge and no rule evaluation; it reads `fields` for `reminder.fire_at <= now`. Because the due op and the reminder ops share a timestamp and device, LWW picks the same winner for both, so a task and its reminders never come from different edits (spec scenario "Two devices reschedule offline").
- Trade-off: the 09:00 default for date-only tasks and the time zone are those of the editing device. Acceptable; `absolute-datetimes` later makes the zone explicit.
- REST writes that change `due` through `PATCH /api/v1/tasks/{id}` perform the same recomputation server-side in the owner's last-known zone offset, which the client reports on sync; until then they use UTC. Documented limitation.

### D3. Server scheduler
A goroutine ticks every 30 s and selects reminders where `fire_at <= now`, `delivered_at IS NULL`, `dismissed_at IS NULL`, `deleted_at IS NULL` and whose task is open. For each it sends a push to every subscription of the user, then writes a `delivered_at` op through `sync.Apply` with `device = "server"`. Idempotent across restarts because `delivered_at` is persisted before the next tick; a crash between send and write can at worst send one duplicate.
- Query cost: one indexed query over `fields` (index on `(entity, field)` plus a numeric comparison on the JSON value; a small materialized `reminder_schedule` table keyed by reminder id and maintained in `Apply` is the fallback if this is slow).

### D4. Web push with the standard library
Chosen: implement VAPID (ES256 JWT over `crypto/ecdsa`) and payload encryption (`aes128gcm`: ECDH over P-256, HKDF from `crypto/hkdf`, AES-GCM from `crypto/aes`), roughly 300 lines plus tests against published test vectors.
- Why: no new module; the standard library has every primitive since Go 1.24. Binary size impact is under 100 KB, image size unchanged, runtime memory impact negligible (one goroutine, one HTTP client with a 10 s timeout).
- Alternative: a third-party web push module. Rejected only on the "justify every dependency" rule; it remains the fallback if the in-house implementation proves fragile against real push services.
- Push service calls are the one outbound request the server ever makes; they go only to endpoints registered by the user's own browser, and `OPENTODO_PUSH=off` (optional, default `on`) disables the routes and the scheduler.

### D5. Key storage
VAPID key pair generated with `crypto/ecdsa` P-256 on first need and stored as PEM in `<DATA_DIR>/push_vapid.pem` with mode 0600, owned by the server user. Stored as a file rather than a table so a key can be inspected or rotated by an operator; it is inside the backed-up directory either way.

### D6. Subscriptions table
`push_subscriptions(id, user_id, device_id UNIQUE, endpoint, p256dh, auth, include_content, created_at, last_ok_at, failures)`. Push service responses 404/410 delete the row; five consecutive other failures mark it for re-registration. Subscriptions are deleted on sign-out and when the session that created them is revoked.

### D7. Client delivery and the service worker
- In-app: a scheduler in the data layer watches reminders via live queries and fires those whose `fire_at` has passed; it shows a toast with Snooze/Dismiss and, when the page is hidden and the browser `Notification` permission is granted but no push subscription exists, a local notification.
- Service worker: on `push` it reads the payload, looks the task up in IndexedDB (same origin, same database) and shows a notification with actions `snooze10`, `snooze60`, `done`. If a window client is focused, it posts a message instead so the in-app path shows it. On `notificationclick` with an action it writes the reminder ops directly to the outbox store and asks any open client (or a one-shot fetch to `/api/v1/sync`) to push them; offline, the ops simply wait in the outbox. No new REST route is needed for actions.
- Dedup: the service worker records shown reminder ids with their `fire_at` in a small IndexedDB store; the in-app path skips a reminder already shown for the same firing time.

### D8. Data model impact
Additive: new entity `reminder` (eight fields), new tables `push_subscriptions`, new key file. No existing field is renamed or changed. Export includes reminders. `docs/sync.md` schema table gains the entity.

## Risks / Trade-offs

- [Push services delay or drop messages] → In-app delivery and the Today view remain authoritative; the notification says "Reminder" rather than promising exactness; `last_ok_at` is shown in Settings for diagnostics.
- [A device with a wrong clock computes `fire_at` wrong] → HLC offset correction already aligns the device with server time; reminders are computed from corrected time.
- [Relative reminder on date-only task fires at an unexpected hour] → Default 09:00 is shown in the picker, editable per reminder; a per-user default is a later addition.
- [Duplicate notification: push plus in-app on the same device] → Service worker checks for a focused client and the shared shown-set (D7).
- [Scheduler query over JSON values is slow on large logs] → Measured first; fallback is the `reminder_schedule` table maintained in `Apply`, which does not change the protocol.
- [Operators who forbid outbound traffic] → `OPENTODO_PUSH=off`; in-app delivery unaffected; documented in self-hosting docs.
- [Payload content opt-in leaks titles to the push service] → Payloads are encrypted end to end per the web push standard, so the service sees ciphertext; the opt-in exists because the device may not yet hold the task locally.

## Migration Plan

One additive migration (`push_subscriptions`). Existing clients that have not updated ignore the `reminder` entity in pulled ops (unknown entity rows are skipped on the client, never rejected) and keep working. Rollback: stop the scheduler; reminder ops remain in the log and are harmless.

## Open Questions

- Whether the 09:00 default should become a user preference once a settings entity exists.
- Whether REST-originated due changes should be able to carry the caller's zone offset explicitly (`X-Timezone` header) instead of using the last-synced one.
