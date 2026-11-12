# Tasks

- [x] 1.1 Read a calendar's events over the window in one `calendar-query`, its halves down to a day when the answer is over 4 MB, and a day still over it by ETag and `calendar-multiget`, keeping each event once. Verify: `go test ./internal/calsync -run TestLargeCalendarIsReadInPieces`.
- [x] 1.2 Halve a `calendar-multiget` batch whose answer is over 4 MB. Verify: `go test ./internal/calsync -run TestMultigetHalvesALargeBatch`.
- [x] 1.3 Replace a listing of changes over 4 MB by the events OpenTodo wrote, read back by multiget, from the calendar's current sync token on, with and without sync tokens. Verify: `go test ./internal/calsync -run TestLargeCalendarIsReadInPieces` (moved and deleted events on a calendar whose listing is over 4 MB).
- [x] 1.4 The in-process CalDAV server honours a query's time-range and requested properties and reports its largest answer. Verify: `go test ./internal/calsync`.
- [x] 1.5 Say how large calendars are read in `docs/calendar-sync.md`. Verify: `make docs-check`.
