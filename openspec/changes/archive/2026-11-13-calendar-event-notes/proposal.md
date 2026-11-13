# Proposal

## Why

Calendar sync wrote a task's notes as the event's description, but rewrote an event only when its title or times changed. Notes added or edited after the event was written never reached the calendar, so most events showed only a title. The event's link also pointed at the task's day, not at the task (issue #1231).

## What Changes

- **Notes follow the task.** A change of a task's notes rewrites its event. The pull still compares only times and title, so an event is never read back as a change because of its notes.
- **The event links to its task**: `URL` is `<base URL>/task/<id>` (also in the subscription feed). Microsoft events, which have no URL property, end their text with the link.
- Existing events are written again once after the update, then only when something changes (the usual 200 writes per cycle apply).
- Encrypted accounts: still no notes; the link is the only text.

Not in scope: a marker for repeating tasks in the title. The title is read back from the calendar, so a marker would come back as a rename; it needs its own design.

## Capabilities

### Modified Capabilities

- `calendar-sync`: Tasks written to the calendar carry the notes and the task's link, and a notes change rewrites the event.

## Impact

`internal/calfeed/feed.go`, `internal/calsync/{cycle,mapping,store,graph_events}.go`; no migration (the body hash lives in the link's stored snapshot JSON); docs/calendar-sync.md.
