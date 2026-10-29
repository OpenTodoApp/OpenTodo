## 1. Field and preference

- [ ] 1.1 `internal/sync/ops.go`: kind `kEnergy` (`""`, `deep`, `medium`, `low`), additive `task.energy` and `user_prefs.energy`; `internal/sync/testdata/schema_fixture.json`; tests: valid values apply, `high`, a number and `null` are rejected; `go test ./internal/sync/...`
- [ ] 1.2 `web/src/lib/types.ts`, task and user_prefs defaults in `web/src/lib/ops.ts`, `web/src/lib/energy.ts` (read: unknown reads as none; `energyLevelsOn(prefs)`); unit tests; `npm test`
- [ ] 1.3 Check that `energy` is not in `internal/e2ee.ContentFields` or `CONTENT_FIELDS` (a test in `e2ee` lists the non-content task fields); `go test ./internal/e2ee/...`

## 2. Parsers

- [ ] 2.1 `web/src/lib/nlp`: `~deep|~medium|~low` and `~d|~m|~l`, last wins, `~` otherwise literal, only when the switch is on (parser option); chip "Deep energy"; suggestions after `~`; tests in `quickadd.test.ts` and `suggest.test.ts`
- [ ] 2.2 `internal/quickadd`: the same token; vectors added to `quickadd.vectors.json` and run by both `vectors.test.ts` and `go test ./internal/quickadd/...`
- [ ] 2.3 `web/src/lib/filter`: `energy`, `no energy`, `energy: value`, error on an unknown value, reserved word; tests
- [ ] 2.4 `internal/filter`: the same grammar so saved views validate; parser tests; `go test ./internal/filter/...`

## 3. Interface

- [ ] 3.1 How you work: **Energy levels** row with a switch writing `user_prefs.energy`; copy in `web/src/lib/settingsCopy.ts` within the copy limits; `settingsCopy.test.ts`
- [ ] 3.2 Task page and docked panel: Energy in the Details group (Add menu while on; row when set, with Clear; read-only for viewers); `facetsOf`, `TaskFacts`; happy-dom tests for on, off with a value, viewer
- [ ] 3.3 Row menu Energy submenu after Priority (while on, editable tasks only); test with Undo
- [ ] 3.4 `TaskRow`: the muted word when set, a hideable row property in saved views; `budget.test.tsx` still passes; phone row unchanged in the layout check
- [ ] 3.5 Strings in the six catalogs (en, de, fr, it, es, pt); `make i18n-check`
- [ ] 3.6 Stories updated for the task facts and a row with energy; baselines; `make ui-lint`

## 4. API, CLI, agents, mappings

- [ ] 4.1 REST task shape and `POST`/`PATCH /api/v1/tasks` validation with `invalid_energy`; tests for valid, invalid, unauthenticated (401) and viewer (403); `go test ./internal/httpapi/...`
- [ ] 4.2 CLI `--energy` on `ot add`/`ot edit`, list column and `--json`; `internal/cli` tests
- [ ] 4.3 `internal/agenttools`: `energy` in the planning properties and the read shape; tests for set, clear and an invalid value; `go test ./internal/agenttools/... ./internal/mcp/...`
- [ ] 4.4 CSV export column and CSV import mapping with the report for invalid values; JSON export carries the field; `go test ./internal/importer/...`
- [ ] 4.5 CalDAV `X-OPENTODO-ENERGY` out and in, invalid kept in `ical_extra`; `go test ./internal/caldav/... ./internal/httpapi/...`
- [ ] 4.6 Vault `[energy:: …]` write, read, invalid reported; fixture `internal/vault/testdata/vault/` and `docs/vault.md`; `go test ./internal/vault/...`

## 5. Docs and checks

- [ ] 5.1 `docs/api.md` (task shape, error code), `docs/cli.md`, `docs/filters.md` (the terms), the quick add guide (the token), a short "Energy levels" section in the How you work guide; `make docs-check`
- [ ] 5.2 CHANGELOG Unreleased "Added" (at archive)
- [ ] 5.3 `make check`, `npm run build`, `make openspec-validate`
