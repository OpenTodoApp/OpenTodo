## 1. Format and official kits

- [ ] 1.1 `web/src/lib/kits.ts`: parse and validate the envelope (version, size, unknown keys), each part through its format's validator (project and routine templates, theme format, view fields, registry ids, `sidebar_layout`). Verify: `npx vitest run src/lib/kits.test.ts`, one test per scenario of "The kit".
- [ ] 1.2 `templates/kits/{essential,family,full,open-loops}/kit.yaml` with translations; the README section; `scripts/templates-check.mjs` validates kits and builds them into `generated/templates.json`. Verify: `make templates-check`, its own test with a broken kit.
- [ ] 1.3 The first run offers the official kits and applies the chosen one. Verify: the first-run tests, including "Open Loops from the first run".
- [ ] 1.4 MODIFIED deltas for `template-library` and `first-run`, each copying its requirement whole. Verify: `make openspec-validate`.

## 2. Web

- [ ] 2.1 Plan and apply: the PATCH first, then one batch of ops; outside-talking routines off; one Undo (features PATCHed back, sidebar and theme restored, created items to the Trash). Verify: `npx vitest run src/lib/kits.apply.test.ts`, covering a failed PATCH and "A digest routine".
- [ ] 2.2 Kits in the template dialog, file and paste entry, the plain-sentence preview, managers only, offline. Verify: rendered tests of "Use Family", "A member", "Offline" and "No state afterwards"; no network request in the kit tests.
- [ ] 2.3 Save as kit (Features page and workspace menu), projects unticked by default, through "Save a project as a template file". Verify: a rendered test of "Save and use elsewhere"; `make i18n-check`, `make ui-check`, `make bundle-budget`.

## 3. Docs and checks

- [ ] 3.1 A "Kits" section in the templates guide (with a screenshot), `changelog.d/Added/workspace-templates.md`, the ROADMAP row. Verify: `make docs`, `make docs-check`, `make check`, `go test ./...`, `cd web && npm test && npm run build`.
