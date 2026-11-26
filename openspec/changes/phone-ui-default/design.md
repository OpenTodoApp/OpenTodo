# Design

## Context

`web/src/phone/prefs.ts` keeps one device value, `opentodo.phoneUi`: `'1'` while the trial is on, absent otherwise. `Shell.tsx` shows the phone screens when it is on and the window is narrower than 768 px. Everything that checks the app at a phone width (the unit tests with a narrow `matchMedia`, the layout check, the end-to-end checks, the UX audit, the accessibility gate, the time benchmark's phone profile) starts from an empty device storage, so today all of them see the earlier layout unless told otherwise, and the phone screens are a second run beside it.

## Goals / Non-Goals

**Goals**

- A phone shows the phone screens without anyone opening Settings.
- One way back, per device, for one release.
- The default the checks exercise is the default people have.

**Non-Goals**

- Removing the earlier phone layout or the switch.
- Any change from 768 px.

## Decisions

### D1. Only "off" is stored

The value reads on unless it is `'0'`, and writes `'0'` for off and nothing for on. A device with `'1'` from the trial reads on; a device with nothing reads on; only a person's own "off" is kept. No migration runs and no version is stored.

Alternative: flip the default for new installs only. Rejected: the people who gave the feedback are existing installs.

### D2. The switch keeps its place and changes its words

It stays under Settings → Appearance, below 768 px only. Its card no longer says "a trial" and its row no longer names two screens: the card is "Phone screens", "Screens made for a phone. This device only.", and the row "New phone screens", "The app in the design made for a phone. Turn it off for the earlier screens." Two strings change in every catalogue; two are unchanged.

### D3. Tests of the earlier layout say so

Unit tests that render at a phone width and assert the earlier layout (the shell's phone bar, the desktop row at 390 px, the list's own add row) are about the way back now. Each such file turns the switch off in its setup, through one helper in `ui/test-utils` that writes the stored value, so the file says which layout it is about. Tests that should hold in both layouts are left to run with the default. No assertion is weakened.

### D4. Which run is the default

- `scripts/e2e-layout.mjs`: `PHONE_UI=0` turns the switch off; unset, the run has the default, the phone screens. CI's main layout run is therefore the phone UI's, and the second run on a fresh server is the earlier layout (`PHONE_UI=0`), kept until the switch goes.
- `scripts/perf/run.sh`: the phone profile is the phone UI's by default; the second phone run sets `PERF_PHONE_UI=0`.
- `scripts/e2e-phone.mjs` no longer sets the switch.
- The other end-to-end scripts drive a 1280 px window and are untouched; any that open a phone-width page are run and fixed in 3.2.

### D5. What a person notices, and the note

The first open after the update shows the new screens with no prompt. The changelog entry and the guide say what changed and where the switch is. No dialog: a one-time notice is one more thing between a person and their list, and the switch is where every appearance choice already is.

## Risks / Trade-offs

- **Someone depends on something only the earlier layout did** → the switch is the way back for one release, and `mobile/AUDIT.md` asks for reports; removing it is a separate change.
- **WebKit has not run the phone screens** (it runs only in the nightly and release runs) → this change is merged only after the full CI run with the WebKit legs has passed on its branch, started by hand without a base (`gh workflow run ci.yml --ref phone-ui-default`), and task 3.3 records it.
- **A real iPhone in Safari and both apps were not tried** → the owner decided on 2026-11-25 that no check on real devices is needed before this merges (task 4.1). The WebKit legs (3.3) are the automated stand-in for Safari; the switch is the way back for a person who meets a problem, and reverting D1 is a three-line change for everyone.

## Migration Plan

No data. Reverting D1 restores the opt-in. Builds on `phone-all-screens`, which must merge first.
