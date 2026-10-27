# Tasks

## 1. Plugin contract and registry

- [x] 1.1 Add `web/src/plugins/types.ts` with the `Plugin` and `PluginCommand` interfaces (kebab-case `id`, translated `name`, one-line `description`, optional `icon: IconName`, optional `commands`) and `web/src/plugins/registry.ts` exporting `PLUGINS` from static imports and `pluginCommands(disabled)` returning the enabled plugins' commands; verify `cd web && npx vitest run src/plugins` passes on the new guard test
- [x] 1.2 Add the guard test `web/src/plugins/registry.test.ts`: every folder under `web/src/plugins` other than the shared modules exports a manifest registered in `PLUGINS`, ids are unique and kebab-case, manifests carry only known fields, and every command id is unique within its plugin; verify the test fails when a manifest is removed or an id duplicated

## 2. The synced enable/disable field

- [x] 2.1 Add `disabled_plugins` (string, default `""`, comma-separated ids of the plugins the account turned off) to `user_prefs` in `internal/sync/ops.go` and regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync ./internal/e2ee` passes with the regenerated `web/src/generated/opSchema.ts`, `internal/e2ee/contentfields.go` and contract fixture
- [x] 2.2 Add the reader and writer helpers in `web/src/lib/plugins.ts` with `readDisabledPlugins(row)` (unknown ids ignored, stored value never rewritten), `setPluginEnabled(id, on)` through `mutate` and `watchPluginsPref`; verify `cd web && npx vitest run src/lib/plugins.test.ts` passes, including the "unknown id is kept" case

## 3. Settings → Plugins

- [x] 3.1 Add `'plugins'` to `SETTINGS_SECTION_IDS` in `web/src/app/router.ts` after `capture`, and the section entry in `web/src/app/settingsSections.ts` (App group, `wrench` icon, one-line description); verify `cd web && npx vitest run src/app/settingsSections.test.tsx` passes after updating the expected ids and group order to thirteen sections
- [x] 3.2 Add `web/src/app/PluginsSection.tsx` listing every registered plugin as a `SettingRow` with its one-line description and an enable `Switch` (checked = not in `disabled_plugins`), and wire `case 'plugins'` in `SectionCards` in `web/src/app/settingsPages.tsx`; verify `npx vitest run src/app/pluginsSection.test.tsx` renders every registered plugin and flipping a switch stores `disabled_plugins` through the op log

## 4. Palette

- [x] 4.1 Add `disabledPlugins?: ReadonlySet<string>` to `PaletteContext`, fill it in `web/src/app/palette/CommandPalette.tsx` from `useUserPrefsRow()`, and append `pluginCommands(ctx.disabledPlugins)` in `commands()`; verify `npx vitest run src/app/palette` passes and a new case in `src/app/palette/palette.test.tsx` shows a plugin command when enabled and hides it when disabled

## 5. Example plugin

- [x] 5.1 Add `web/src/plugins/daily-digest/` (manifest + command "Copy today's tasks as Markdown" writing today's open tasks to the clipboard) and register it; verify `npx vitest run src/plugins/daily-digest.test.ts` passes (command copies the expected Markdown for a seeded day) and the guard test from 1.2 covers it

## 6. Copy, docs and gates

- [x] 6.1 Extract and translate every new string in the six catalogs; verify `make i18n-check` passes
- [x] 6.2 Add the Plugins section to `docs/` settings documentation and a CHANGELOG.md entry under Unreleased; verify `make docs-check` passes
- [x] 6.3 Update `web/src/app/settingsSections.test.tsx`, `web/src/app/settingsAnatomy.test.tsx` and any other tests that pin the section list or copy limits; verify `cd web && npm test` passes
- [x] 6.4 Run the full gates: `make check` in the repository root (lint, web-lint, staticcheck, tests, fmt, ui-lint, i18n-check, docs-check, templates-check, openspec-validate, deploy-check, repo-check), `cd web && npm run build` with `make bundle-budget`, and record the gzip delta; verify every gate passes
- [x] 6.5 Validate the change itself; verify `make openspec-validate` passes with `plugin-section`
