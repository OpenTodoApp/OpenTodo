# Tasks

## 1. Screen gate

- [ ] 1.1 `A11Y_ONLY=1` and `A11Y_STRICT=1` in `scripts/ux-audit/tour.mjs` (axe serious/critical blocking, no screenshots in `A11Y_ONLY`); verify `node --test scripts/ux-audit/ux-audit.test.mjs` and a local run `A11Y_ONLY=1 WIDTHS=360,1280 LANGS=en make ux-audit` exits non-zero on a story with a nameless button
- [ ] 1.2 New measures in `audit-measures.mjs`: focus not obscured, reflow at 320×256 with `reflow-exempt.json`, text spacing; target size and focus walk made blocking under `A11Y_STRICT`; verify unit tests in `measure.test.mjs` for each measure with a pass and a fail fixture page
- [ ] 1.3 CI job `a11y-screens` (2 shards, 360 and 1280, light and dark, English) behind the web path filter, listed in the publish jobs' `needs`; nightly Interface audit sets `A11Y_STRICT=1`; verify the CI path filter test (`scripts/ci-changes.sh` cases) and a green run on the PR

## 2. Fixes from the automated gate

- [ ] 2.1 Run the gate on all 99 entries, fix every serious and critical violation and every measure failure (names, roles, landmarks, live regions, focus order, obscured focus, reflow, clipping); verify the gate passes, `npm test`, `npm run build`, `make ui-check`

## 3. Dragging and authentication

- [ ] 3.1 `data-drag-id` on every drag and swipe source, `scripts/ux-audit/drag-alternatives.json`, `web/src/lib/a11y/dragAlternatives.test.ts`; verify `npm test`
- [ ] 3.2 Missing alternatives: Move up / Move down / Move to top in row, section and sidebar item menus, wired to the existing ordering ops; translations in the six languages; verify interaction tests for each menu item (happy-dom), offline reorder test, `node scripts/i18n-check.mjs`
- [ ] 3.3 Auth screens: `autocomplete` values, no paste blocking, test with a synthetic paste on every credential field; verify `npm test`

## 4. Native shells

- [ ] 4.1 Android lint accessibility checks as errors in `mobile/android`; fix findings; verify `make android`
- [ ] 4.2 iOS UI test with `performAccessibilityAudit()` on sign-in, settings and widget configuration; fix findings; verify the iOS CI job

## 5. Manual audit and statement

- [ ] 5.1 Manual passes on the 57 core screens (keyboard, NVDA+Firefox, VoiceOver macOS, VoiceOver iOS shell, TalkBack Android shell, 200% zoom with text size 20) recorded in `docs/accessibility/audit-1.0.0.md`; every core failure fixed with an issue and a test; verify the record has no `fail` on core screens
- [ ] 5.2 `scripts/accessibility-statement.mjs` and `docs/accessibility.md` (statement, method, generated table, exceptions, feedback); `scripts/accessibility.test.mjs` in `make repo-check` (generated table up to date, core rows complete, failures listed as exceptions); verify `make repo-check` and `make docs-check`
- [ ] 5.3 `scripts/release/prepare.mjs` refuses a release more than 12 months after the latest audit; verify `node --test scripts/release/prepare.test.mjs`
- [ ] 5.4 Link the statement from README, `docs/README.md` and the Help landing page; `CONTRIBUTING.md` describes the gate and how to add a drag alternative; CHANGELOG entry under Unreleased; verify `make check`
