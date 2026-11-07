## 1. Preference

- [x] 1.1 `full_titles` in `internal/sync/ops.go` `Schema`, generated files refreshed (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`, then `go test ./internal/sync`)
- [x] 1.2 `web/src/lib/fullTitles.ts` (read, write, apply) and `data-titles="full"` from `AppearanceProvider`; verified by `web/src/app/fullTitles.test.tsx` "preference" and "applies at once on this device and arrives on another device through sync"

## 2. Rows, cards and Today

- [x] 2.1 The clamp lifted in `web/src/index.css`, the phone row's end cell on the first line, `RowTitle` not measuring while on; verified by `web/src/app/fullTitles.test.tsx` "the stylesheet lifts the title clamp" and the story `Screens/Task row` LongTitleFull at 375 and 1280 px
- [x] 2.2 `RowEstimate` measures again when the preference changes (`web/src/app/task-list/ListGroups.tsx`); verified by the phone and desktop runs of `scripts/perf/run.mjs` and End in the 2,000-task project

## 3. Settings, strings, docs

- [x] 3.1 The switch in Settings → Appearance, its copy and its settings search entry; verified by `web/src/app/fullTitles.test.tsx` "is found by the settings search"
- [x] 3.2 Strings in `web/src/locales/messages.json` and every shipped catalog (`make i18n-check`), `docs/sync.md` and the appearance docs (`make docs-check`)
- [x] 3.3 `npm test` and `npm run build` in web/, `make bundle-budget`, `make ui-lint`, `make web-lint`, `make openspec-validate`, the visual baselines
