## 1. Server

- [x] 1.1 `calfeed.FeedOptions.FloatingZone` and `calfeed.FloatingIn`: `WriteEvent` writes a floating timed task (not a span) in that zone, with its TZID and VTIMEZONE; verified by `TestFloatingTaskWrittenInCalendarZone` (winter and summer time in Europe/Amsterdam, read back unchanged, moved in the calendar)
- [x] 1.2 The cycle passes the target calendar's zone (not for Microsoft, which writes in the mailbox zone) and `BodyHash` includes it for floating timed tasks, so events written floating before are written again once; verified by `TestFloatingEventRewrittenInCalendarZone`
- [x] 1.3 A time in a daylight saving gap is written as given (DTSTART literal, DTEND the RFC 5545 instant plus the length) and read back from the written wall time (`calfeed.WallIn`, `Point.Wall`); verified by `TestDaylightSavingGapRoundTrip` (Amsterdam, Sydney, New York)
- [x] 1.4 A project calendar's zone is found by its calendar key, with or without a trailing slash; verified by `TestProjectCalendarZone`

## 2. Docs

- [x] 2.1 `docs/calendar-sync.md` says a floating task is written in the calendar's zone, read on connecting and on **Sync now**; changelog fragment `changelog.d/Fixed/calsync-calendar-zone.md`

## 3. Check

- [x] 3.1 `go test ./internal/calsync/... ./internal/calfeed/... ./internal/caldav/...`, `go vet`, `make docs-check`, `openspec validate --all --strict`
