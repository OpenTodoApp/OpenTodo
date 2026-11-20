## 1. Data and rule

- [ ] 1.1 `user_prefs.away` in `internal/sync/ops.go` `Schema`, regenerated (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`); a parser shared by the server and `web/src/lib` for the value (D3). Verify: `go test ./internal/sync` and a web unit test of the parser.
- [ ] 1.2 The skip plan on the device (D1, D2): which occurrences of which series, the completion-relative move, viewers excluded, derived ids; applied with `applyBatch` and one Undo. Verify: `npx vitest run` of the new test covering every scenario of "Skipping inside the period" and "Set an away period".

## 2. Screens

- [ ] 2.1 The Away dialog (lazy), with the range, Everything/Only with the Combobox, Pause reminders and the preview line; Today's menu item and the palette command; "Away until <day>" and End now in Today (D4); strings in every locale; stories and baselines. Verify: `make i18n-check`, `make ui-check`, `make bundle-budget`, and the scenarios of "While away" in a rendered test.
- [ ] 2.2 Local reminder notifications check the period. Verify: a web test with a reminder inside a quiet period.

## 3. Server

- [ ] 3.1 The reminder delivery and digest jobs read `away` and hold quietly (D4). Verify: `go test ./internal/push ./internal/digest` (or the packages that send), with a reminder inside and the day after.
- [ ] 3.2 `POST` and `DELETE /api/v1/away` with their policy in `policy.go`, through `ApplyStrict` and the server's occurrence code (D5); `docs/api.md`, the OpenAPI file, the v1 surface. Verify: `go test ./internal/httpapi -run Away`, one test per scenario of "Away through the API and CLI".
- [ ] 3.3 `ot away`. Verify: `go test ./internal/cli`.

## 4. Docs and checks

- [ ] 4.1 A short guide in `docs/`, `changelog.d/Added/away-periods.md`, the row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make openspec-validate`, `go test ./...`, `cd web && npm test && npm run build`.
