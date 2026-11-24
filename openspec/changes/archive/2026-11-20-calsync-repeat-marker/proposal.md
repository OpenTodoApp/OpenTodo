## Why

Issue #1231. Calendar sync writes a repeating task as its next occurrence, a single event with no repeat rule, so in Google Calendar, iCloud or Outlook it looks exactly like a one-off task. The reporter, who uses the calendar as their main view of OpenTodo, asked for a 🔁 marker. #1264 shipped the other two parts of the issue (notes and the task link) and left this one out: calendar sync reads titles back, so a marker in the title would come back as a rename of the task.

## What Changes

- **A marker on repeating tasks only.** An event that calendar sync writes for a repeating task is titled `🔁 <task title>`. This covers CalDAV, Google and Microsoft. Tasks that don't repeat are unchanged.
- **Removed when read back.** The marker is removed before the title is compared with the task's or applied to it. Moving or renaming the event in the calendar does what it does today. Deleting the marker there changes nothing in the task.
- **Kept current.** When a task starts or stops repeating, its event is rewritten within a cycle. Existing events of repeating tasks are rewritten once after the upgrade. The events of all other tasks are not rewritten.
- **Encrypted accounts.** Their events keep the neutral "Encrypted item" title with no marker, so the calendar provider learns nothing more.

Out of scope:
- calendar feeds, which already carry the real `RRULE` and so get the calendar's own repeat icon;
- CalDAV (`/dav/`), where VTODOs carry their `RRULE`;
- a setting to turn the marker off;
- describing the rule in words.

No **BREAKING** change: no op field, no setting, no new route.

Roadmap: a follow-up of `calendar-two-way`, listed as `calsync-repeat-marker`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `calendar-sync`: new requirement "Repeating tasks marked in the calendar".

## Impact

- `internal/calfeed/feed.go` (the title of a written event).
- `internal/calsync/mapping.go`: the snapshot records whether the task repeats, and the marker is removed on read-back.
- `internal/calsync/graph_events.go` (the Outlook subject).
- Tests in `internal/calsync`.
- One line in `docs/calendar-sync.md`.

No new dependency. No change to the web app or to locales: the marker is a symbol, not a word.
