# Tasks

## 1. Data model

- [x] 1.1 Add `theme_mode` and `theme_accent` (`kString`) to `Schema["user_prefs"]` in `internal/sync/ops.go`, with a comment naming this change and the value sets. Verify a sync test that applies both ops to the personal scope, that they converge per field by last-writer-wins, and that the export lists them. Run `go test ./...`.
- [x] 1.2 Add the fields to `UserPrefs` in `web/src/lib/types.ts` and the defaults (`'system'`, `'emerald'`) to `USER_PREFS_DEFAULTS` in `web/src/lib/ops.ts`. Verify `npm run typecheck` and the existing ops tests with `npm test`.
- [x] 1.3 Change the importer's preview title for the `user_prefs` row to "Preferences" (`internal/importer/profile_opentodo.go`), and check that the appearance fields import with the row. Verify an importer test that round-trips an export with `theme_accent: "indigo"`. Run `go test ./...`.

## 2. Accent tokens and checks

- [x] 2.1 Create `web/src/ui/tokens/accents.ts` with the ordered accent list, display labels and light bar colours (D6). Verify a unit test that the list has eight entries, starts with `emerald` and contains no red family.
- [x] 2.2 Add the `[data-accent]` raw value blocks for the seven non-default accents and switch the light and both dark blocks to the `var(--ot-accent-{l,d}-*, <emerald>)` mapping, with selectors that also match `[data-accent]` elements (D3, D4). Verify `theme.test.ts` still passes (dark blocks identical) and that the computed emerald values are unchanged. Run `npm test`.
- [x] 2.3 Extend `css.ts` with `parseAccents` and `contrast.test.ts` to check the accent pairs for every accent × mode, with failures naming accent, mode, pair and ratio. Add `theme.test.ts` checks that every accent defines all seven tokens in both modes and matches `accents.ts` (D5). Verify `npm test`, and that a deliberately failing value makes the test name the accent.
- [x] 2.4 Show every accent in light and dark in the Foundations colour story using `data-accent` subtrees. Verify `npm run build-storybook` succeeds and the a11y gate (`make ui-check`) passes without new baselines.

## 3. Applying the appearance

- [x] 3.1 Extend `lib/userPrefs.ts` with `readAppearance(row)` (unknown to default, row unchanged) and `setAppearance(field, value)` through `mutate`. Verify unit tests for the defaults, an unknown accent reading as `emerald` without writing an op, and an offline change landing in the outbox. Run `npm test`.
- [x] 3.2 Add `web/public/appearance.js` (classic script, try/catch, reads `localStorage["ot.appearance"]`, sets `data-theme`, `data-accent` and `theme-color`) and load it synchronously in `index.html` `<head>`. Verify it is precached in the built service worker manifest (`npm run build`), and that the server's CSP (`script-src 'self'`) loads it with no console error on `./bin/opentodo`.
- [x] 3.3 Add `AppearanceProvider` next to `DateTimePrefsProvider`. It applies mode and accent to `<html>`, keeps `color-scheme` and the `theme-color` meta in sync (D2, D8, including the two media metas under `system`), and writes the local cache from the synced value only. Verify happy-dom interaction tests: dark mode on a light system sets `data-theme="dark"`, a synced change updates attributes without remounting, the cache never produces an op, and the bar colour follows mode and accent. Run `npm test` and `npm run build`.

## 4. Settings panel

- [x] 4.1 Build `AppearanceSection` at the top of Settings → Preferences (D9): a mode radio group and theme tiles with roving focus, real-token previews through `data-accent`, and text labels. Verify happy-dom tests for selecting a theme with arrow keys and Enter/Space, `aria-checked` on the current tile, and the app root attributes changing at once. Run `npm test` and `npm run build`.
- [x] 4.2 Add a story for the panel (light and dark only) and verify `make ui-lint` and the a11y gate in `make ui-check` pass with no new screenshot baselines.
- [x] 4.3 Document Appearance in `docs/settings.md` under Preferences, with an `appearance` help anchor for the panel's help link. Regenerate the help and docs with `make docs`. Verify `make docs-check` passes and the in-app Help opens the section from the panel.

## 5. Integration

- [x] 5.1 Manual smoke on `./bin/opentodo`. Verify each of these is observed (all scripted and observed; the installed PWA title bar is accepted by the maintainer as covered by the theme-color tests, see design "Implementation notes"):
  - Pick `orange` + `dark` on one browser; a second browser signed in as the same user follows without a reload.
  - Reload: the first frame is already dark and orange, with no flash.
  - A second user's appearance is unchanged.
  - The installed PWA's title bar follows the theme.
  - Walking Today, Upcoming, a project board, the task detail and Settings in `orange` shows no leftover emerald.
- [x] 5.2 Add a CHANGELOG entry under Unreleased and the theming row in ROADMAP.md (shipped once archived). Run `make check`. Verify it passes, including `openspec validate --all --strict`.
