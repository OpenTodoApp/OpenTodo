# Proposal

## Why

A task manager that cannot tell you about a task at the right moment pushes people back to the commercial apps they are trying to leave. OpenTodo stores due dates and times but never surfaces them unless the app is open. Reminders are the most requested gap in the time-management section of the roadmap, and web push is the only notification channel an installed PWA can offer without a native app or a third-party service.

## What Changes

- A new `reminder` entity in the operation log: a reminder belongs to one task and fires either relative to the task's due time ("30 minutes before") or at an absolute moment. Reminders are created, edited, snoozed and dismissed through the same field-level ops as every other write, so they work offline and converge across devices.
- Relative reminders follow the task: when the due date or time changes, the firing time is recomputed by the device that made the change.
- In-app delivery: while the app is open on a device, a due reminder shows an in-app notification with snooze and dismiss actions, with no server involvement.
- Web push delivery: each device may opt in to push notifications. The server keeps one push subscription per device and sends a push when a reminder is due, so a closed or background app still notifies. Push payloads carry only identifiers unless the device opts in to include the task title.
- Key material for push (a VAPID key pair) is generated on first use and stored under the data directory. No configuration is needed; an optional `OPENTODO_PUSH` switch lets an operator turn push off entirely.
- Settings gains a "Notifications" section: enable on this device, include task titles, test notification.

Out of scope: location-based reminders, e-mail or chat delivery (`webhooks` covers that), per-project default reminders, a reminders inbox view, natural-language reminder entry ("remind me at 5"), and reminders on recurring series beyond what follows automatically from the due date (recurrence is `recurring-tasks`).

This change advances ROADMAP.md section 4, "Reminders and web push notifications" (`reminders`).

Not **BREAKING**: the op log gains one additive entity; no field is renamed; no mandatory environment variable is introduced. Note on the "no third-party network calls" principle: sending a web push means the server contacts the push service that the user's own browser nominated when it subscribed. This happens only for devices whose user opted in, carries encrypted payloads the push service cannot read, and can be disabled by the operator.

## Capabilities

### New Capabilities
- `reminders`: reminder entity and lifecycle, relative and absolute firing, in-app and web push delivery, device push subscriptions, push key management, payload privacy, snooze and dismiss.

### Modified Capabilities
- none. The `http-api` and `offline-first-sync` contracts are unchanged; new routes and the new entity are specified inside `reminders`.

## Impact

- Op schema: new entity `reminder` (fields listed in design.md) in `internal/sync/ops.go`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`.
- Database: new tables `push_subscriptions` and `server_keys` (or a key file under the data directory, see design); one migration.
- New authenticated routes under `/api/v1/push/`.
- New server background job that scans due reminders and sends pushes.
- Service worker gains `push`, `notificationclick` and `notificationclose` handlers.
- Dependencies: none required; web push signing and payload encryption are implemented with the Go standard library (design D4). Binary and image size impact is negligible.
- Docs: `docs/api.md`, `docs/sync.md` (schema table), `docs/self-hosting/*` (push behaviour and the opt-out switch).
