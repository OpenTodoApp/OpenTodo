## 0. Dependency

- [x] 0.1 Confirm `calendar-frames` is applied (the `kClock` kind, the `frame` entity, `FrameBand` layering and the frame popover exist); stop otherwise

## 1. Entity and sync

- [x] 1.1 `internal/sync/ops.go`: entity `slot` (fields of design D1, `title` as Content, `task_ids` as `kIDList` capped at 20) in the personal scope; `schema_fixture.json`; `go test ./internal/sync/...` covers valid and invalid values and the scope (`slot_test.go`; the 20-task cap and the length of at most a day are slot rules in `Validate`, ids unique on the server like a frame's)
- [x] 1.2 Migration `internal/store/migrations/NNNN_slots.sql` and materialized reads; `go test ./internal/store/...` (no migration needed: like `frame`, a new entity is stored in the generic op log and `scope_fields`; materialized reads come from `sync.List`/`Get`)
- [x] 1.3 `slot.title` in `internal/e2ee.ContentFields` and `web/src/lib/e2ee.ts`; export includes `slots`; tests pass
- [x] 1.4 `web/src/lib/types.ts`, `ops.ts` defaults, Dexie store version; `npm test`

## 2. Logic

- [x] 2.1 `web/src/lib/slots.ts`: tasks a slot shows (design D2, first-created wins), the add batch (D3, date set, removed from other slots, viewer refusal, full slot), move and delete batches (D5), capacity contribution (D6); `slots.test.ts`
- [x] 2.2 Capacity helpers (`dayLoad`, `planLoad`, Month totals) count a slot once and skip its tasks; tests in `calendar.test.ts` and `plan.test.ts` (the slot cases live in `slots.test.ts`, which calls both helpers)

## 3. Calendar and lists

- [x] 3.1 `calendar/SlotBlock.tsx`: block, checklist rows, "+n" popover, keyboard rows, dimmed past, side-by-side layout; happy-dom `slots.test.tsx`
- [x] 3.2 Drop layer: drops on a slot add (D3), rows dragged out, slot move and resize with one Undo; tests in `slots.test.tsx`
- [x] 3.3 Placement `Shift+Enter` in the placement context, registered in the shortcut registry; the registry test passes
- [x] 3.4 New slot in the Day and Week overflow menu and the palette; Make a slot here in the frame popover; New slot here… in `calendar-clarity`'s empty-slot menu when it exists (it does not yet: `newSlotAt(date, start)` in `app/calendar/slotActions.ts` is ready for it, noted in `calendar-clarity` task 2.2)
- [x] 3.5 `TaskRow` time column shows the slot start with the stack icon for slotted tasks; `budget.test.tsx` still passes (no new property)
- [x] 3.6 Phone: Week agenda slot row that expands, Schedule sheet slot choices; `make layout-check` at 360 and 390 px
- [x] 3.7 Story `calendar/slots.stories.tsx` and baselines; `make ui-lint`

## 4. API, CLI, MCP

- [x] 4.1 `internal/httpapi/slots.go` with policies, `ApplyStrict` + `NotifyApplied`, `move_tasks`, 401/403/404/422 and encrypted handling; `policy_test.go`, `slots_test.go`
- [x] 4.2 `internal/cli`: `ot slots`, `ot slots add`, `ot slots put`, `ot slots rm` with `--json`; `go test ./internal/cli/...`
- [x] 4.3 `internal/agenttools`: read tool `list_slots`, resource `opentodo://slots`; `go test ./internal/agenttools/... ./internal/mcp/...`

## 5. Docs, strings, checks

- [x] 5.1 Strings in the six catalogs; `make i18n-check`
- [x] 5.2 `docs/slots.md` (new, with a screenshot), links from `docs/time-blocking.md`, `docs/frames.md`, `docs/README.md`; `docs/api.md`, `docs/cli.md`, route matrix; `make docs-check`
- [x] 5.3 CHANGELOG Unreleased "Added"
- [x] 5.4 `go test ./...`, `cd web && npm test && npm run build`, `make openspec-validate`, `make check`
