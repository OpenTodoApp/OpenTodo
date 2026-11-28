# Tasks

## 1. The switch

- [x] 1.1 Delete `web/src/phone/prefs.ts`; `Shell.tsx` shows the phone UI by the width alone and removes the stored `opentodo.phoneUi` when it mounts (design D2). Verify: `phoneScreens.test.tsx` "shows the phone screens below 768 px, whatever the switch had stored, and removes that value", "shows them at 767 px too", "keeps the desktop screens from 768 px".
- [x] 1.2 Remove the toggle from Settings → Appearance (`PreferencesPanels.tsx`, `settingsPages.tsx`, `settingsCopy.ts`) and its four strings from every catalogue. Verify: `node scripts/i18n-check.mjs` (7,930 messages, every shipped catalogue complete); no `[data-phone-ui-switch]` in a browser at 390 and 1280 px.
- [x] 1.3 Only the shell imports the phone UI (`web/eslint.config.js`). Verify: `layering.test.ts`.
- [x] 1.4 The Habits screen for the phone (`habits-complete`, merged while this change was open) no longer names the switch: the requirement "Habits on a phone" is modified in `specs/habits/spec.md`, and `phoneHabits.test.tsx` keeps its width case only. Verify: `phoneHabits.test.tsx`.

## 2. The tests

- [x] 2.1 The ten files that turned the switch off (design D3): six tests of the earlier layout's structure deleted, thirteen rewritten against the phone UI or the desktop (two of them in `sidebar.test.tsx` and `tabBar.test.tsx` had found the shell's bar only while the phone UI's chunk loaded). Verify: `npm test` in `web/`.
- [x] 2.2 The phone UI's parity tests: rows, groups and order against the same list at 1280 px; page menus as pinned lists (twenty-nine tests rewritten); the switch's own six tests (`prefs.test.tsx`, `phoneSwitch.test.tsx`) and "leaves every screen as it was while the switch is off" deleted. Verify: `npx vitest run src/phone` (118 tests pass).

## 3. The checks

- [x] 3.1 `scripts/e2e-layout.mjs` without `PHONE_UI`; `scripts/perf/run.mjs` and `run.sh` without `PERF_PHONE_UI` and the second phone run; `.github/workflows/ci.yml` without "Layout check with the earlier phone screens" (design D5). Verify: `ENGINES=chromium WIDTHS=360,768 node scripts/e2e-layout.mjs` prints `LAYOUT OK`; `node scripts/e2e-phone.mjs` passes; `node --test scripts/repo-checks.test.mjs scripts/perf/budgets.test.mjs`.
- [ ] 3.2 The time benchmark's phone profile without the second run. Verify: `scripts/perf/run.sh` in the nightly workflow. Not run here: it builds the 10,000-task account and takes the nightly's machine; the edit removes one invocation and one report path.
- [x] 3.3 WebKit and the full CI run (every layout leg, the visual job). Verify: `gh workflow run ci.yml --ref phone-ui-only` passes. Done: run 46053788943, every leg, after the layout check's stall timer counted per step (#2171).

## 4. The specs of the open changes

- [x] 4.1 Edit the `phone-ui` deltas of `phone-ui-trial`, `phone-ui-default`, `phone-lists`, `phone-all-screens` and `phone-calendar` so none names the switch or the earlier screens (design D1); one line in `phone-ui-default/proposal.md` says so. Verify: `grep -rn "switch" openspec/changes/phone-*/specs/phone-ui/` finds only this change's requirement; `openspec validate --all --strict` passes.

## 5. The desktop is untouched

- [x] 5.1 Today, a project, the board, the calendar and Settings at 1280 px on `origin/main` and on this branch. Verify: screenshots of both builds on one copied account, compared pixel by pixel in three rounds with `origin/main` captured twice as the control. Done: Today, the project, the board, the calendar and Settings → Appearance are identical in every round. Settings differs in 49 anti-aliased pixels at the corners of its search field, each by one colour level of 255; two captures of `origin/main` differ in the same 49 pixels (round 3), where the branch equals the second, so it is the renderer's rounding and not this change.

## 6. Docs

- [x] 6.1 `docs/phone-screens.md`, `docs/contributing/tests-and-checks.md`, `mobile/AUDIT.md`, `ROADMAP.md`, `changelog.d/Removed/phone-ui-only.md`. Verify: `npm run docs:build` and `npm run docs:check` in `web/`; the repo checks.
