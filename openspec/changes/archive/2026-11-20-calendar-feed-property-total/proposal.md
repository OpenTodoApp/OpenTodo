## Why

A calendar is read as it arrives, and each event of it has its own limit of 1 MB and 5,000 content lines. The calendar's own properties (its name, time zone and other top-level lines) are kept until the end of the read, but they had no limit of their own: the per-event count started again at every event, so they could grow up to the 32 MB download limit. Fetches made by the routes (creating a subscription, changing its address, Refresh now) also ran outside the two-at-a-time bound of the background fetches.

## What Changes

- A calendar's own properties have one limit for the whole calendar, the same as one event: 1 MB and 5,000 content lines. Past it the fetch fails with `too_large`, and the previous events are kept.
- The fetches made by the routes share the background bound: at most two calendars are fetched at once. A request waits for its turn; one that ends while waiting records nothing.

Out of scope: the download, event and kept-events limits, which do not change. No ROADMAP item: a fix to `calendar-feeds`. No **BREAKING** change: no op field, no environment variable.

## Capabilities

### Modified Capabilities

- `calendar-feeds`: "Scheduled fetching" bounds the calendar's own properties and the fetches running at once.

## Impact

- `internal/caldav/stream.go` (the root's running total), `internal/calfeed/worker.go` (shared slots).
- Tests in both packages. No dependency, no web change.
