# Design

## Context

- **Calendar:** `lib/calendar.ts` computes day loads. `internal/frames` and `web/src/lib/frames.ts` expand frames. Slots are their own entity. Subscribed calendar events are read-only rows on the device.
- **Statistics** already draws bars for tracked time.
- **Display tools** are defined once in `internal/assistant/blocks.go`.

## Decisions

### D1. Free time is one shared computation

`internal/freetime` (Go) and `web/src/lib/freeTime.ts` compute free slots from the working day minus busy intervals: events, frames, slots, and timed tasks with estimates. They are pinned by `freetime.vectors.json` and listed in `docs/contracts.md`. The registry's `find_free_time`, the device twin and the `show_free_time` renderer all use it.

### D2. Blocks render from local rows

- `show_time` reads `time_entries` through `lib/time.ts` totals.
- `show_free_time` uses `freeTime.ts` with the device's grid settings.
- `show_deadlines` reuses the deadline countdown words.

The renderers are lazy chunks like the others.

### D3. Encrypted accounts

Event titles may be encrypted. The free-time computation needs only times, which are not content fields, so it works on encrypted accounts. The block shows "busy" blocks without titles when they can't be read.

## Data model, size, interface budget

- **Data:** no change.
- **Size:** a few KB per lazy renderer.
- **Interface budget:** blocks sit in the transcript and add no chrome.

## Risks / Trade-offs

- **Event timezones and all-day events.** Use the calendar's existing event clipping (`eventBlocks`), covered by the vectors.

## Implementation notes

- **Timed tasks.** A timed task takes its estimate, else 30 minutes, as the calendar draws it (`blockFor`), so a timed task without an estimate is not free time.
- **Working day.** The server cannot read the device's calendar settings, so `find_free_time` takes `day_start_hour` and `day_end_hour` (default 6 and 22, the calendar's defaults). The app sends its working day with every turn and the server fills both when the model names neither; the device twin reads the settings itself. Today starts at the current minute rounded up to 15.
- **Busy time.** The block shows no busy blocks at all: free stretches as times and as a strip across the working day. Titles are never read, readable or not.
- **Disclosure.** The consent list names the free time (`DisclosureVersion` 5; earlier consents still count, since only free stretches leave the server, never an event's title).
