## 1. Entity and sync

- [ ] 1.1 `internal/sync/ops.go`: kinds `kClock` and `kWeekdays` with validation; entity `frame` (fields of design D1, `title` as Content) resolving to the personal scope; `internal/sync/testdata/schema_fixture.json`; `go test ./internal/sync/...` covers valid and invalid values and the personal scope
- [ ] 1.2 Migration `internal/store/migrations/NNNN_frames.sql` and the materialized reads (following `rules`); `go test ./internal/store/... ./internal/sync/...`
- [ ] 1.3 `internal/e2ee.ContentFields` and `web/src/lib/e2ee.ts` `CONTENT_FIELDS` gain `frame.title`; the shared e2ee field test passes
- [ ] 1.4 Export includes `frames`; `go test ./internal/httpapi/...` export test
- [ ] 1.5 `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`, a Dexie store in `web/src/lib/db.ts` (new version); `npm test` (db upgrade test)

## 2. Occurrences

- [ ] 2.1 `web/src/lib/frames.ts`: occurrences for a range, validation, the "times need fixing" state; `frames.test.ts`
- [ ] 2.2 `internal/frames` Go twin; shared vectors `web/src/lib/frames.vectors.json` run by `frames.test.ts` and `go test ./internal/frames/...`

## 3. Calendar

- [ ] 3.1 `calendar/FrameBand.tsx` layered under blocks in Day and Week, overlap columns, dimmed past days, title button; pointer-events and drop behaviour unchanged (drag tests in `calendar.test.tsx` still pass, new `frames.test.tsx` covers drop inside a band and capacity unchanged)
- [ ] 3.2 Popover with Plan from this frame (planning list source and the placement target, `placementStart` preferring the first fitting start inside the occurrence), Edit and Delete with Undo; tests for fit, no fit, deleted source and keyboard only
- [ ] 3.3 `FramesDialog.tsx` (lazy): list, reorder, form with weekday toggles, times, colour, Combobox source, optional dates; 50-frame limit; the overflow item in Day and Week and the palette command New frame; tests in `frames.test.tsx`
- [ ] 3.4 Phone agenda heading below 640 px and the bottom sheet; `make layout-check` at 360 and 390 px
- [ ] 3.5 Hook for `calendar-clarity`'s empty-slot menu (New frame here…), added when that menu exists; test there
- [ ] 3.6 Story `calendar/frames.stories.tsx` (Week with bands, overlap, past day, phone agenda) and baselines; `make ui-lint`

## 4. API, CLI, MCP

- [ ] 4.1 `internal/httpapi/frames.go` routes with policies (reads all scopes; writes refused to `read` and `agent`), `ApplyStrict` + `NotifyApplied`, validation 422, encrypted-account handling; `policy_test.go` and `frames_test.go` (401, 403, 422, create, patch, delete)
- [ ] 4.2 `internal/cli`: `ot frames`, `ot frames add`, `ot frames rm` with `--json`; `go test ./internal/cli/...`
- [ ] 4.3 `internal/agenttools`: read tool `list_frames` and resource `opentodo://frames`, titles through `e2ee.Display` and marked untrusted; `go test ./internal/agenttools/... ./internal/mcp/...`

## 5. Docs, strings, checks

- [ ] 5.1 Strings in the six catalogs; `make i18n-check`
- [ ] 5.2 `docs/frames.md` (new, with a screenshot shot in `scripts/docs-screenshots.mjs`), links from `docs/time-blocking.md`, `docs/calendar-views.md` and `docs/README.md`; `docs/api.md`, `docs/cli.md`, the route matrix; `make docs-check`
- [ ] 5.3 CHANGELOG Unreleased "Added"
- [ ] 5.4 `go test ./...`, `cd web && npm test && npm run build`, `make openspec-validate`, `make check`
