# Proposal

## Why

Since `phone-ui-default` a window narrower than 768 px shows the phone screens, and a switch in Settings, "New phone screens", brings the earlier phone layout back on a device. That change kept the switch "for one release as the way back". The owner decided on 2026-11-27 that the way back is no longer needed: the phone UI is what a phone shows.

While the switch exists, the app has two phone interfaces. Each check that opens the app at a phone width runs twice, tests fix the structure of a layout almost nobody sees, and every change to a shared screen has to be right in both.

## What Changes

- **The switch is removed.** Settings → Appearance no longer shows "New phone screens". Its four strings leave every catalogue.
- **The width alone decides.** Below 768 px the app shows the phone screens. Nothing a person can set changes that.
- **A device that had turned the switch off shows the phone screens** from this update on. The value the switch stored on the device is not read any more, and the app removes it when it opens.
- **The checks of the earlier layout go.** The second run of the layout check in CI (`PHONE_UI=0`), the second phone run of the time benchmark (`PERF_PHONE_UI=0`), and the unit tests that fixed the earlier layout's structure. A test of behaviour the phone UI also has is rewritten against the phone UI.
- **The guide says so.** `docs/phone-screens.md` no longer describes a way back.

Nothing changes from 768 px.

Out of scope: removing the responsive branches (`max-md:`, `useMediaQuery` below 768 px) inside components the desktop also renders, the shell's own phone bar, and the tests and stories that render those components at a phone width outside the phone UI (design D4 lists them as the follow-up); tablets; the Android and iOS shells; archiving the four open `phone-ui` changes this builds on.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `phone-ui`: no switch and no second phone layout. The capability's requirements are in changes not archived yet (`phone-ui-trial`, `phone-lists`, `phone-calendar`, `phone-all-screens`, `phone-ui-default`), so this change adds one requirement and edits the deltas of those changes where they name the switch (design D1).

## Impact

- `web/src/phone/prefs.ts` (deleted), `web/src/app/Shell.tsx` (the condition), `web/src/app/PreferencesPanels.tsx` and `web/src/app/settingsPages.tsx` (the toggle), `web/src/lib/settingsCopy.ts` and `web/src/locales/*.json` (four strings), `web/eslint.config.js` (only the shell imports the phone UI), sixteen test files.
- `scripts/e2e-layout.mjs`, `scripts/perf/run.mjs`, `scripts/perf/run.sh`, `.github/workflows/ci.yml`: the earlier layout's runs.
- `docs/phone-screens.md`, `docs/contributing/tests-and-checks.md`, `mobile/AUDIT.md`, `ROADMAP.md`, `changelog.d/Removed/phone-ui-only.md`.
- No op field, no route, no server change, no environment variable, no dependency. One device value (`opentodo.phoneUi`) is no longer written or read.
