## 1. Served form

- [x] 1.1 A one-off zoned due is served in UTC, a repeating one with TZID (`internal/caldav/vtodo.go`); verified by `internal/caldav` `TestZonedVTODOGolden` (Europe/Berlin in summer and winter, America/New_York, Asia/Kolkata) and `internal/httpapi` `TestCaldavZonedDueServedInUTC`, `TestCaldavZonedSeriesKeepsTZID`
- [x] 1.2 The VTIMEZONE is written from the zone's yearly rules, before the VTODO (`internal/caldav/vtimezone.go`); verified by `TestVTimezoneGolden` and `TestVTimezoneMatchesZoneDatabase` (every hour of five years in 21 zones against the zone database)
- [x] 1.3 The calendar feed shares the definition; verified by `internal/calfeed` `TestWriteFeedZoneDefinition`

## 2. Reading back

- [x] 2.1 `Inbound.KeepZone` reads UTC times in the task's zone (`internal/caldav/decode.go`, called by `internal/httpapi/davroutes/write.go`); verified by `TestKeepZone`, the fixture round trip `TestICalRoundTripFixtures`, and `internal/httpapi` `TestCaldavZonedDueEchoWritesNothing` and `TestCaldavZonedDueMovedKeepsZone`

## 3. Docs

- [x] 3.1 `docs/caldav.md` describes the served forms and the reading back; `make docs-check`
- [x] 3.2 `go test ./internal/caldav/... ./internal/httpapi/... ./internal/calfeed/...`, `go vet ./...`, `make openspec-validate`
