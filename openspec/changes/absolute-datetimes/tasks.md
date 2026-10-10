# Tasks

## 1. Validation and format (server)

- [ ] 1.1 Extend the `due` validation in `internal/sync/ops.go` to accept an optional `tz` only with `time`, as a known IANA zone of at most 64 characters, importing the standard library's embedded zone data in `cmd/opentodo`; verify `TestValidateZonedDue` (valid, tz without time, unknown zone, too long) (`go test ./...`)
- [ ] 1.2 REST create and patch accept and echo `tz`, rejecting invalid combinations with `invalid_input`; verify `TestRestZonedDueRoundTrip` and `TestRestZonedDueWithoutTimeRejected` (`go test ./...`)
- [ ] 1.3 Record the binary size before and after embedding zone data in `CHANGELOG.md`; verify `make build` output size noted and under budget
- [ ] 1.4 Update `docs/sync.md` (due type with optional `tz`) and `docs/api.md`; verify the examples match the validator

## 2. Client date layer

- [ ] 2.1 Add `tz?: string` to `Due` in `web/src/lib/types.ts`; `dueToInstant`, `instantToLocalDue`, `localDueOf`, `zoneHint` and viewer-zone resolution in `web/src/lib/dates.ts` with gap and overlap rules; verify `dates.test.ts` with fixed zones: Berlin 09:00 seen from Los Angeles, Tokyo 02:00 crossing midnight, spring-forward 02:30, autumn overlap (`npm test`)
- [ ] 2.2 `compareDue`, `describeDue`, `formatDateHeading` and Today/Upcoming grouping use the local triple; verify `dates.test.ts` sorts a zoned `09:00 Berlin` before a floating `08:00` when viewed from Los Angeles (`npm test`)
- [ ] 2.3 Conversion helpers `fixDueToZone(due, zone)` and `releaseDue(due, zone)` producing one due edit through `updateTask`; verify `dates.test.ts` round-trips fix then release without changing the displayed time (`npm test`)
- [ ] 2.4 Re-resolve the viewer zone on visibility change; verify `dates.test.ts` with a mocked resolved zone switching between two values (`npm test`)

## 3. UI

- [ ] 3.1 Detail panel "Fixed to time zone" toggle (keyboard reachable, disabled without a time, shows the zone name), clearing the time drops the zone; verify browser flow: fix a `09:00` task, the row still reads `09:00`, sync, second device in another zone shows the converted time with the hint; `npm run build` passes
- [ ] 3.2 Zone hint in task rows, headings and the detail panel when zones differ; verify browser flow with the browser zone overridden: hint appears and disappears when zones match
- [ ] 3.3 Shortcut help and README section "Floating vs fixed times"; verify the help lists the toggle shortcut and the README section exists

## 4. Integration

- [ ] 4.1 Two-device flow with different browser zones: A fixes a time offline, B edits the title offline, reconnect; verify B shows A's zoned time converted and the `tz` key survives B's edit, with no console errors
- [ ] 4.2 Mixed-version check: run the previous release's client against the new server and edit a title on a zoned task; verify the `tz` key is unchanged in the export afterwards
- [ ] 4.3 `make check` passes and `CHANGELOG.md` Unreleased lists the change; verify command output
