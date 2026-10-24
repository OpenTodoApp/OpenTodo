## 1. Controls

- [x] 1.1 `StatusIndicator` in `web/src/ui/StatusIndicator.tsx` with five tones, exported from the barrel, with a story and a unit test (word read, dot hidden, no pulse under reduced motion); verify `npm test`
- [x] 1.2 The compact switch (D4) in `Switch.tsx` with `touch-target`; verify the switch stories and the accessibility gate
- [x] 1.3 The select chevron and the small controls inside `[data-setting-control]` in `index.css` (D4); verify the form-controls story

## 2. Settings layout

- [x] 2.1 `SettingsSection` flat only (D3): label-size heading without icon, hairline rows, the `tier` prop removed; `SettingRow` marks its control column `data-setting-control`; verify `settingsAnatomy.test.tsx` and `patterns.test.tsx`
- [x] 2.2 The breadcrumb header, the 228 px navigation pane and the page title with its lead line (D1–D3) in `SettingsView.tsx`; the phone list unchanged; verify `settingsView.test.tsx` and `settingsSections.test.tsx`
- [x] 2.3 The `/` shortcut `settings.search` in the registry and its handler; strings in the five catalogs; verify `shortcuts.test.ts` and `make i18n-check`
- [x] 2.4 State badges become status dots in the settings panels (D5); verify the panel tests

## 3. The stale path

- [x] 3.1 "Settings → AI → …" becomes "Settings → Integrations → …" in README, `internal/agenttools`, `internal/assistant`, `internal/cli`, `skills/opentodo-cli` and its plugin copy (D6); verify `go test ./...` and that no file outside the CHANGELOG history and the archive names "Settings → AI"

## 4. Docs, tests and baselines

- [x] 4.1 Update `docs/design-system.md` (switch, select, status dot, flat settings sections) and `docs/interface-guide.md` (the settings page), and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 4.2 Regenerate the visual baselines in the pinned Playwright image; verify `make ui-check` in CI
- [x] 4.3 Render Settings → Notifications from the real app at 1440×900 in dark next to `settings.png` and attach the side-by-side to the pull request
- [x] 4.4 Run `make check` with TZ=UTC, open the pull request and get CI green
