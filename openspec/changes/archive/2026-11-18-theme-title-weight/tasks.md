## 1. Build

- [x] 1.1 Format: `titleWeight` (400, 500, 600, 700) in `format.ts` and `themes.go`, shared examples, JSON Schema
- [x] 1.2 Apply: resolved and applied theme, `themeCss`, `validApplied`, the boot script, the preview, the row title rule
- [x] 1.3 Editor: Task titles in Shape and type; strings in every shipped language
- [x] 1.4 Tests: shared examples (Go and web), `apply.test.ts`, `appearanceBoot.test.ts`; docs `themes.md`

## 2. Checks

- [x] 2.1 `go test ./internal/themes`; web typecheck, lint and tests; `make i18n-check`; `make openspec-validate`; `make repo-check`
