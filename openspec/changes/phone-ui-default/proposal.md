# Proposal

## Why

The phone screens were a trial behind a switch that is off until a person finds it in Settings. Since `phone-all-screens` they cover the whole app: the task lists and the task page are written for a phone, and every other screen has the phone header and the phone task row. They are checked by the unit tests, the layout and accessibility check over the whole screen inventory, the visual baselines, the end-to-end check of the gestures, the time benchmark on the 10,000-task account, and in the Android app on an emulator. The owner tried them on a phone on 2026-11-25 and decided they are what a phone should show.

While the switch is off by default, almost nobody sees them, and the apps are still what the feedback called "a responsive version". The design of `phone-ui-trial` (D8) set the condition for the next step: when the everyday screens exist, the switch turns on by default and stays for one release as the way back. That condition is met.

## What Changes

- **The phone screens are on by default** below 768 px: in the Android and iPhone apps, in a phone's browser and in the installed web app. Nothing changes from 768 px.
- **The switch stays as the way back.** It is still in Settings → Appearance, still kept on the device and never synced. Turning it off brings the earlier screens back on that device. A device that had turned the trial on keeps it on; a device that had never touched it now has it on.
- **The switch's words say what it is now:** no longer a trial of two screens.
- **The checks follow the default.** The layout check, the end-to-end checks and the time benchmark run the phone widths with the phone screens, as people will have them, and once more with the switch off for as long as the way back exists.

Out of scope: removing the switch and the earlier phone layout (the change after one release, once nobody needs the way back), tablets and every width from 768 px, redrawing what is particular to a screen, and the Android and iOS shells.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `phone-ui`: the switch is on by default. The capability's requirements are in changes not archived yet, so this change adds one requirement that says which of the earlier words it replaces.

## Impact

- `web/src/phone/prefs.ts` (the default), `web/src/lib/settingsCopy.ts` and the catalogues (the switch's words), the tests that fixed the earlier phone layout (they turn the switch off, or move to the phone screens), `scripts/e2e-layout.mjs`, `scripts/perf/run.sh` and `.github/workflows/ci.yml` (which run is the default), `docs/phone-screens.md`, `mobile/AUDIT.md`.
- No op field, no route, no server change, no environment variable, no dependency. The first load is unchanged: the phone screens stay chunks loaded on demand, now fetched by every phone.
