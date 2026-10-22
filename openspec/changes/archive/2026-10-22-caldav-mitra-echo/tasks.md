# Tasks

## 1. Server

- [x] 1.1 `Encode` serves `DTSTART` = `DUE` for a due with time and no deadline and drops a remainder `DTSTART`; verify `TestDeadlineEncode` ("due with time", "due date only") and `TestICalRoundTripFixtures` in `go test ./internal/caldav/...` — done
- [x] 1.2 Decoder: `Inbound.SentDue`, and an equal `DTSTART` on a timed `DUE` is not kept as client data; verify `TestMitraFixtures` (echoed start, started date task) — done
- [x] 1.3 `dateWrites` echo rule with `dueEchoed`; verify `TestMitraEchoedDue` (timed, recurring, date-only scheduled, a changed `DUE` still a deadline, a deadline task unchanged) and `TestMitraScheduledUndated` (served with `DTSTART`, unchanged PUT writes nothing) in `go test ./internal/httpapi/...`; `TestInboundDateShapes` still passes (its `DUE`s differ from the current due) — done

## 2. Documentation

- [x] 2.1 `docs/caldav.md`: mapping rows for `DUE`/`DTSTART`, the shapes table row for the echoed `DUE`, the sentence on Mitra; `CHANGELOG.md` Fixed entry — done
