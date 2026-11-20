## 1. Format and official modes

- [ ] 1.1 `modes/schema.json`, `modes/README.md` (the format), `web/src/lib/modes.ts` parse and validate (size cap, version, names, ids, defaults, templates through the template rules, ignored keys). Verify: `npx vitest run src/lib/modes.test.ts`, one test per scenario of "The mode format".
- [ ] 1.2 `modes/essential.json`, `family.json`, `full.json`; `scripts/modes-check.mjs` and `make modes-check` in `ci-checks`; built to `web/src/generated/modes.json`. Verify: `make modes-check`, its own test with a broken file.
- [ ] 1.3 The first run and New workspace read the official modes. Verify: the first-run and New workspace tests.
- [ ] 1.4 The MODIFIED delta for `workspace-features` (presets from the files). Verify: `make openspec-validate`.

## 2. Server

- [ ] 2.1 Workspace `sidebar` and `defaults` columns, PATCH validation, sync response; `docs/api.md`, OpenAPI, the v1 surface. Verify: `go test ./internal/httpapi -run WorkspaceModes`, one test per API scenario (anonymous, member, read token, demo, invalid field).
- [ ] 2.2 The `saved_mode` entity in `Schema`, regenerated (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`), content fields encrypted. Verify: `go test ./internal/sync`.

## 3. Web

- [ ] 3.1 Fallback reading of `sidebar` and `defaults` behind personal preferences. Verify: a rendered test of "A personal sidebar wins".
- [ ] 3.2 The Modes card on the Features page (managers), the import dialog with its preview (file and paste), apply with one Undo, offline. Verify: rendered tests of "Apply Family", "Offline" and "A member"; no network request in the import tests.
- [ ] 3.3 Save this setup as a mode, the saved modes (Apply to…, Download, Delete), the palette's "Import a mode…". Verify: rendered tests of "Save and reuse" and "Saved offline"; `make i18n-check`, `make ui-check`, `make bundle-budget`.

## 4. Docs and checks

- [ ] 4.1 A "Modes" guide (with a screenshot), `changelog.d/Added/workspace-modes.md`, the ROADMAP row. Verify: `make docs`, `make docs-check`, `make check`, `go test ./...`, `cd web && npm test && npm run build`.
