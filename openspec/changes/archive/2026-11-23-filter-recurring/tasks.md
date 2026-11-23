## 1. The keyword

- [x] 1.1 `recurring` in `internal/filter` (filter.go, evaluate.go) and `web/src/lib/filter` (parse.ts, evaluate.ts), with vectors in `web/src/lib/filter/evaluate.vectors.json`; the editor's name in `web/src/app/filter/conditionText.ts`. Verify: `go test ./internal/filter`, `npx vitest run src/lib/filter` (fail before the change)
- [x] 1.2 `docs/filters.md`; full web suite, typecheck and lint, `make docs`. Verify: `npm test`, `npm run typecheck`, `npm run lint` in `web/`
