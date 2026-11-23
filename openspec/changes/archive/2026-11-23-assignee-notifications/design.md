## Context

- Events: `internal/sync/apply.go` hands the events of a committed batch to the notify sinks (`emitAssignments`, `emitMentions`, `emitUnblocked`). Each one leaves out the change's author. Sinks must be quick and can never fail a batch (`internal/notify`).
- Web Push: `internal/push` keeps one subscription per device with its "include task titles" choice (`include_content`) and sends reminder payloads; `web/public/push-sw.js` shows them in the language stored on the device.
- Channels: `internal/channels` queues the events switched on per channel (`Events`).

## Decisions

### D1. The status event
`notify.StatusChanged{AssigneeID, ActorID, ActorName, TaskID, TaskTitle, ProjectID, ProjectName, Completed, At}` is emitted once per task whose `completed_at` went from null to a value (Completed true) or from a value to null (Completed false) in a committed batch, when the task's stored assignee is someone other than the batch's author and the task is not deleted. A new occurrence record of a repeating task counts as a completion of that occurrence; a skipped occurrence (`skipped`) and a task created already completed (an import, a copy) do not count. A new occurrence record copies its series' assignee, which is not an assignment either: `emitAssignments` no longer reports it (a fix for the bell too). Titles go through `e2ee.Display`, so an encrypted title is never shown. It is a new optional interface, `notify.StatusSink`, like `UnblockedSink`; sinks that do not implement it receive nothing.

*Rejected:* a section or board-column move as a status. Columns are per project and named by people; "moved to Doing" would need the column's name at emission time and is noisy. Kept for later if asked.

### D2. Opt-in per device, on the push subscription
Two columns on `push_subscriptions`, `notify_assigned` and `notify_status`, default 0. `POST /api/v1/push/subscriptions` takes an optional `notify: {assigned, status}`; the subscription's JSON returns them. Settings re-registers the subscription to change them, as it does for "include task titles". A request without `notify` (an older web app, the Android app's UnifiedPush registration) keeps the stored choices. A device without push enabled cannot turn them on.

*Rejected:* a synced user preference. Every other push choice is per device (titles, the test); a person may want assignments on the laptop but not the phone; and a per-user setting would need a new op field for a server-only consumer.

### D3. The push sink
`push.Service` implements `Assigned` and `StatusChanged`. For each of the recipient's subscriptions that opted in to that event and is not disabled, it sends `{type: "assigned"|"status", taskId, actorName, completed?, title?}`; `title` only when the subscription opted in to titles. The push topic is the task's id (`topicFor`), so an undelivered message for one task is replaced by a later one at the push service; urgency and TTL are the reminders'. A rotating task's turn passing (`Assigned.Turn`) is not pushed: nobody assigned it, and the bell and channels word it as a turn. Each event's sends run in a goroutine, to all of the recipient's devices in parallel, with a deadline of 15 s; at most 32 events are in flight and one that finds them all busy is dropped, so the sink never blocks the sync and one slow push endpoint holds at most one slot. A send that fails is logged and counted on the subscription like a reminder's; there is no retry (best effort, as the bell's events).

*Rejected:* the channel delivery queue (`deliveryq`). It is durable and retried, which suits third-party services; a push for "Kim completed X" that arrives an hour late after a restart is worse than none.

### D4. The worker
`push-sw.js` shows `assigned` as "{name} assigned you a task" and `status` as "{name} completed a task" or "{name} reopened a task", with the title as the body when the payload has one and, else, the title read from the local store, else no body. Tag `task:<id>`, so a later event for the same task replaces the earlier one. A click opens `/?task=<id>` in an open window, else a new one. With the app in front, no system notification is shown: the bell already says it. The texts are in the stored language, pinned to the catalog like the reminder texts.

### D5. Channels
`channels.Events` gains `status`; a new channel's default set stays reminder, assigned and mentioned. The channel message reads like the push text.

## Data model impact

A Go migration step (`store.migratePushNotify`, as ALTER TABLE ADD COLUMN cannot be repeated) adds `notify_assigned INTEGER NOT NULL DEFAULT 0` and `notify_status INTEGER NOT NULL DEFAULT 0` to `push_subscriptions` (device state, outside the op log and the export). No op field changes.

## Size

No dependency. A few dozen lines in the worker; two checkboxes in Settings → Notifications.

## Interface budget

Settings → Notifications gains two checkboxes under "Include task titles", shown only while push is on for this device. No list, no shortcut, no sidebar destination changes.
