## Context

`calfeed.WriteEvent` renders a task for calendar sync. It drops the task's `RRULE` (calendar-two-way D5: a repeating task is written as its next occurrence), so the calendar can't show its own repeat icon. `graph_events.go` builds the Outlook body from the same `calfeed.EventTitle`. When the calendar is read back (`calsync.EventSnapshot`, `EventOps`), a hash of the event's `SUMMARY` is compared with the snapshot stored when OpenTodo last wrote the event. A changed hash becomes a `title` op. `cycle.go` rewrites an event when the wanted `Snapshot` (struct equality) or `BodyHash` differs from the stored link.

## Goals / Non-Goals

**Goals:** a repeating task is recognisable at a glance in any calendar view, including narrow week columns, and the marker never reaches the task's title.

**Non-Goals:** marking calendar feeds or CalDAV (both carry `RRULE`); a setting; the rule in words; any change for tasks that don't repeat.

## Decisions

### D1. A leading 🔁 in the title, not a line in the notes

The marker is `🔁` and one space before the title. It goes in the title because the title is the only text every calendar shows in its grid. Notes appear only after the event is opened, which defeats the point. It goes first because week and month views cut titles off at the end. Calendar sync writes no `RRULE`, so the marker never sits beside the calendar's own repeat icon (the concern raised on the issue). A symbol needs no translation, and the server doesn't know the user's language.

**Alternative considered:** the first line of the notes reading "Repeats every week". It shows only when the event is opened, and it needs the rule in the user's language on the server. Rejected.

### D2. A task repeats when it has a rule

The marker is added when the feed task has an `RRULE` or `RDates` before `WriteEvent` clears them. This covers every repeat rule, including "after completion", as the feed does. A span that repeats is marked too.

### D3. Removed on read-back, only where it was written

`Snapshot` gains `Repeats bool` (`json:"repeats,omitempty"`), set by `TaskSnapshot`.
- **Hashing on the task side:** `Snapshot.Title` remains the hash of the title *without* the marker.
- **Reading an event:** when the stored snapshot says `Repeats`, `EventSnapshot` removes one leading `🔁` and the spaces after it before hashing. `EventOps` does the same before `cleanTitle`.

What follows from this:
- An unedited event matches; a renamed event becomes the new title without the marker.
- An event whose marker the user deleted matches, so nothing happens.
- A task that doesn't repeat and whose own title starts with 🔁 is never stripped.

### D4. Rewrites

The wanted `Snapshot` now includes `Repeats`, so it differs from the stored one whenever a task starts or stops repeating. `cycle.go` already rewrites the event when that happens. Stored links have no `repeats` field, which reads as false. After the upgrade, each repeating task's event is therefore rewritten once, and no other event is touched. `bodyVersion` stays as it is.

### D5. Encrypted accounts

For an encrypted account, or an encrypted title, the title stays `e2ee.Placeholder` with no marker, and `Repeats` is false. This tells the provider nothing new and keeps encrypted events exactly as they are.

## Risks / Trade-offs

- **The marker shows in other apps.** A calendar app the user shares with others shows 🔁 too. That is the point, and the rule is not visible.
- **A single rewrite after upgrade.** It costs as many writes as there are repeating tasks in the window, inside the existing per-cycle limits.
- **Size.** About 30 lines of Go, no dependency, binary unchanged.

## Interface budget

Nothing in the app changes: no toggle, no string, no screen.
