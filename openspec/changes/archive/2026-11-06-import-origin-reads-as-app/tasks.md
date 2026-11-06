## 1. An import reads as its app

- [x] 1.1 `importApp`, `originLabel` and `originText` in `web/src/lib/taskOrigin.ts`; the chip, the history, the Inbox's source line and the palette use them; verified by `web/src/lib/taskOrigin.test.ts` "imported origins read as their app" and `web/src/app/taskRow.test.tsx` "imported tasks in a list (issue 945)"
- [x] 1.2 `Origin.Label()` and `ImportApp` in `internal/origin`, with import cases in the shared label vectors; verified by `go test ./internal/origin ./internal/cli` and the vectors in `taskOrigin.test.ts`

## 2. The row's end is one width

- [x] 2.1 Every list row has its trailing group; from 40 rem it is 6 rem wide (`web/src/app/TaskRow.tsx`, `web/src/index.css`); verified by `taskRow.test.tsx` and by `scripts/ui-check/alignment.spec.ts` on the story `Screens/Task row` ImportedAlignment at 1280, 768 and 390 px (date and label cells start within 0.5 px; 160 px apart before)

## 3. Checks and docs

- [x] 3.1 `npm test`, `npm run typecheck` and `npm run build` in web/, `go test ./...`, `make web-lint`, `make ui-lint`, `make i18n-check`, the visual baselines regenerated with `make ui-baselines`
- [x] 3.2 Changelog fragment, `make openspec-validate`
