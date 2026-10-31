# Tasks

## 1. Preferences and schema

- [x] 1.1 Add `focus_presets` and `focus_noise` (strings, default `""`) to `Schema["user_prefs"]` in `internal/sync/ops.go`, `UserPrefs` in `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify `go test ./internal/sync/...` and the schema parity test in `npm test -- ops`
- [x] 1.2 Read and validate them in `web/src/lib/focus/prefs.ts`: presets parsed, de-duplicated, bounded 5–180, at most four, default `10,20,40`; noise `off|white|pink|brown`, with unknown values read as off and kept unchanged. Add the device volume key `ot.focus.noiseVolume` (0–100, default 40), cleared on sign-out; verify `npm test -- focus/prefs`
- [x] 1.3 Add `focus` to `PROMOTABLE` in `web/src/lib/appearance.ts` and the switch in Settings → Appearance (disabled in Open Loops first like the others); verify `npm test -- appearance`

## 2. Ways in

- [x] 2.1 Add `startFocus(taskId)` in `web/src/lib/focus/session.ts`: it navigates when the session already runs on this task, leaves another task's session and shows a toast with Undo that resumes it, asks for the length in Countdown, and otherwise starts. Unit-test the four paths in `npm test -- focus/session`
- [x] 2.2 Add Focus to the More group after Statistics (`moreEntriesOf` in `web/src/app/Sidebar.tsx`), promotable, and kept in More in Open Loops first; verify `npm test -- sidebar` with the scenarios of `app-shell` "Focus in the More group"
- [x] 2.3 Add the Focus icon button to the task panel header beside ⋯ (hidden for completed, trashed and viewer tasks), and make "Focus on this task" in `TaskActionsMenu.tsx` call `startFocus`; verify `npm test -- task-detail focusView`
- [x] 2.4 Add "Start focus" to `bulkMenuGroups` for one open, editable task, beside Start tracking, so it also appears in the palette through `flatItems`; verify `npm test -- bulk palette` (several tasks: absent)
- [x] 2.5 Make `holdSelect` use the shared haptic helper in `web/src/app/motion.ts`, so it follows `user_prefs.haptics`; verify with a test that mocks `navigator.vibrate` with haptics off (`npm test -- RowSwipe`)

## 3. Timer comforts

- [x] 3.1 Extend a finished session: "+5 min" and "+15 min" in the done state of Pomodoro and Countdown work sessions for 10 minutes, the same cycle, a new time entry, and a pending auto-break cancelled (`web/src/lib/focus/state.ts`, `FocusParts.tsx`); verify `npm test -- focus/state focusView` with the scenarios of "Extend a finished session"
- [x] 3.2 Show the preset chips in the Countdown dialog (`FocusParts.tsx`) and the preset editor with Reset in `FocusSettings.tsx`; verify `npm test -- focusView focusSettings` (one-tap start, bounds)
- [x] 3.3 Add the noise generator `web/src/lib/focus/noise.ts` (white, pink, brown buffers; gain fades; start on the next interaction when autoplay is refused), driven by the shell-mounted timer controller so it plays only during work phases on any screen; verify with a fake `AudioContext` in `npm test -- focus/noise breakReminder`
- [x] 3.4 Add the noise choice, the device volume slider and Preview to Settings → General → Focus, and "Noise on"/"Noise off" to the Focus screen's overflow menu; verify `npm test -- focusSettings focusView`

## 4. Words and docs

- [x] 4.1 Add every new string to `web/src/locales/messages.json` and translate it in de, es, fr, it and pt; verify `npm test -- i18n` and `make ui-lint`
- [x] 4.2 Update `docs/focus.md` ("Open it", extend, presets, noise) and `docs/bulk-actions.md` (Actions with one ticked task on phones); verify the docs link check in `make repo-check`
- [x] 4.3 Add the stories for the done state with extensions and the Countdown dialog with chips (`focusView.stories.tsx`); verify `make ui-check`

## 5. Integration

- [x] 5.1 Run `npm test` and `npm run build` in `web/`, `go test ./...` and `make check`. In the built app, check the scenarios by hand: Focus from More, the panel button, Start focus from the phone bar with haptics off, +5 min, a preset chip, and Brown noise that fades on pause
