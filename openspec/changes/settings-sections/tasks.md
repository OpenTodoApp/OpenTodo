# Tasks

## 1. Routes

- [ ] 1.1 Optional `section` on the settings route in `web/src/app/router.ts`; `/settings/<id>` for every section, `/settings/import` unchanged, unknown ids → overview; verify `parseRoute`/`routePath` round-trip tests for every section in `web/src/app/settingsSections.test.tsx` (`npm test`)

## 2. Settings screen

- [ ] 2.1 Section table (`web/src/app/settingsSections.ts`): ids, labels, descriptions, role visibility, demo-refused features; verify unit tests for visibility by role (`npm test`)
- [ ] 2.2 Overview, section pages, side navigation with `aria-current`, phone back link, focus on the heading (`web/src/app/SettingsView.tsx`); panels moved unchanged; verify render tests for the overview list, opening a section, deep link, back link, owner/admin/member visibility and demo notes (`npm test`, `npm run build` in web/)
- [ ] 2.3 UI and server strings that name a Settings path use the section path; verify `npm test` and `go test ./...`

## 3. Docs and checks

- [ ] 3.1 `docs/settings.md` by section; "Settings → …" paths in `docs/` and `README.md`; `make docs` twice with no diff; verify `make docs-check`
- [ ] 3.2 `scripts/e2e-layout.mjs` visits the overview and every section and runs the settings overlays on their sections; `scripts/docs-screenshots.mjs` opens the sections; verify `ENGINES=chromium make layout-check`
- [ ] 3.3 CHANGELOG entry under Unreleased (Changed)

## 4. Verify

- [ ] 4.1 `make check` passes
- [ ] 4.2 `npx @fission-ai/openspec validate --all --strict` passes
- [ ] 4.3 Main chunk size before/after recorded in design.md
