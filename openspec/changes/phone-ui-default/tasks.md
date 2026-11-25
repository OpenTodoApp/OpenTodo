# Tasks

## 1. The default

- [x] 1.1 `prefs.ts`: on unless `'0'` is stored (design D1). Verify: `prefs.test.ts`: unset reads on, `'1'` reads on, off writes `'0'` and reads off, on removes the key; `phoneSwitch.test.tsx` updated to the new default.
- [x] 1.2 The switch's words (design D2) in `settingsCopy.ts` and every catalogue. Verify: `node scripts/i18n-check.mjs`.

## 2. The tests of the earlier layout

- [x] 2.1 A helper in `ui/test-utils` that turns the phone screens off for a test file, used by every file that asserts the earlier phone layout (design D3). Verify: `npm test` in `web/` passes; no assertion removed (the diff of each file is its setup).

## 3. The checks

- [ ] 3.1 `scripts/e2e-layout.mjs` (`PHONE_UI=0`), `scripts/perf/run.sh`, `scripts/e2e-phone.mjs` and `.github/workflows/ci.yml` (design D4). Verify: the layout check with the default and with `PHONE_UI=0`, Chromium at 360 and 390 px, light and dark, prints `LAYOUT OK` twice.
- [ ] 3.2 The other end-to-end scripts and the UX audit at phone widths. Verify: `scripts/e2e.sh` passes; the full CI run passes.
- [ ] 3.3 WebKit. Verify: the full CI run on this branch (`gh workflow run ci.yml --ref phone-ui-default`, no base: every leg) passes its layout checks in WebKit.

## 4. On a phone

- [x] 4.1 The owner opens the app on an iPhone (Safari and the app) and an Android phone after the update. Verify: their findings fixed or recorded here. Not done, by the owner's decision of 2026-11-25: no check on real devices is asked for before this merges. What stands in its place: the owner's own use in Chrome on an iPhone during the trial, the Android app on an emulator (API 34), and the WebKit legs of 3.3. Not covered by any of them: Safari and the iPhone app on a device, and system Back over a sheet on Android.

## 5. Docs

- [x] 5.1 `docs/phone-screens.md`, `changelog.d/Changed/phone-ui-default.md`, `ROADMAP.md`, `mobile/AUDIT.md`, the docs build. Verify: `npm run docs:build` and `docs:check`; repo checks.
