# Design

## Context

Focus (`focus-mode`) is a full screen at `/focus` with a device-local timer row (`web/src/lib/focus/session.ts`, `state.ts`) and synced preferences on `user_prefs` (`focus_*` fields). Its only visible way in is "Focus on this task" in the open task's ⋯ menu (`web/src/app/task-detail/TaskActionsMenu.tsx`). The task Actions menu is built once by `bulkMenuGroups` (`web/src/app/bulk/BulkActions.tsx`) and is opened by `.`, the row's More button, a right-click, a fine-pointer touch hold and the selection bar. On a coarse pointer a long press ticks the row (`holdSelect` in `web/src/app/task-list/RowSwipe.tsx`), which calls `navigator.vibrate` directly and so ignores the haptics preference (`web/src/app/motion.ts`). The Sidebar's More entries and the promotable ids live in `web/src/app/Sidebar.tsx` (`moreEntriesOf`) and `web/src/lib/appearance.ts` (`PROMOTABLE`). The session tone is already synthesized with Web Audio (`web/src/lib/focus/tone.ts`).

## Goals / Non-Goals

**Goals:** make Focus findable by mouse, keyboard and touch without adding a primary destination or a shortcut. Add the three timer comforts as calm opt-ins.

**Non-Goals:** changing the meaning of a long press on phones, moving the timer state off the device, any server work.

## Decisions

### D1: Focus is a More entry, promotable like the others

Focus is added to `moreEntriesOf` after Statistics, with the `clock` icon used by "Focus on this task", and `focus` joins `PROMOTABLE`. In Open Loops first it stays in More, because the six primary places are fixed there. Promoting it follows "Sidebar destinations preference" unchanged.
*Alternatives:* a fixed primary destination (breaks the six-destination budget for everyone); a footer button beside the running-entry pill (the footer is one row and already full on phones).

### D2: One "Start focus" action, three placements

Three placements share one function, `startFocus(taskId)`:
- the Actions menu (when it targets exactly one open task the user can edit), placed in the same group as Start tracking;
- the task panel header's Focus button (`clock` icon, tooltip "Start focus");
- the existing "Focus on this task" item, which keeps its label and also starts the session instead of only opening the screen. That way the menu, the button and the item do the same thing.

`startFocus`:
- If the device's session already runs on this task, it only navigates to `/focus/<id>`.
- If a session runs on another task, it leaves that session first, as "Change task" does (`leaveSession`): the previous entry stops and nothing is lost. A toast then names the task that was left, with Undo, and Undo goes back to that task and resumes it.
- In Countdown mode it opens the screen with the length dialog (D4) instead of starting at once.

The Actions menu hides the item for several tasks, a completed or trashed task, and a viewer's task. The palette lists it as a command for the selected task, through `flatItems`.
*Alternative:* only navigate, without starting. Rejected: issue #543 asks for "start a timer", and a second press on the screen is the friction being removed.

### D3: Long press stays select; one ticked task gets the full menu

Following the maintainer's call in #553, the coarse-pointer long press keeps ticking. With one task ticked, the selection bar's Actions already renders `bulkMenuGroups` for n = 1, so adding Start focus there (D2) is enough. `holdSelect` calls the shared haptic helper (`tick()` in `motion.ts`), so the tick respects `user_prefs.haptics`. The `task-list-presentation` sentence that says the row menu is reachable by long press is corrected to "by the selection bar's Actions after a long press".
*Alternative:* a long press opens the menu (the #535 ask). Deferred: it would change a convention that `bulk-actions` and the swipe gestures rely on. We asked the reporter, and a later change can add it if they want it.

### D4: Extending a finished session

The done state of a work session in Pomodoro or Countdown gains "+5 min" and "+15 min". Flowtime has no end, and breaks are not extended. Extending moves the phase back to `work` with a new run of 5 or 15 minutes on the same task and the same cycle number, so the Pomodoro cycle count does not advance twice. Because the session's time entry stopped when the session ended, extending starts a new entry, as resuming does: each stretch of work is one entry (`time-tracking`). The time spent on the done state is not logged. The extension is offered for 10 minutes after the end. After that, or after a break or the next session has started, it is gone. With "Start breaks automatically" on, the buttons are shown for the moment the done state is shown, and choosing one cancels that auto-start. Otherwise auto-start keeps its behaviour, and the buttons go away when the break starts.
*Alternative:* add the minutes to the finished entry. Rejected: entries are ops, and rewriting a stopped entry's end from another device's done state could clash with edits in the time log.

### D5: Countdown presets

`user_prefs.focus_presets` is a comma-separated list of up to four whole minutes, each from 5 to 180, de-duplicated and kept in the user's order. An empty or invalid value reads as `10,20,40`, and entries that are out of range or not numbers are ignored when read. The Countdown dialog shows the presets as chips above the length field. A chip starts the session at once, and the field still takes any length. Settings → General → Focus edits the list as up to four number fields with Reset. The value is validated before it is stored, like the other focus bounds.
*Alternatives:* presets per device (people expect their 40 minutes on the phone too); presets as chips on the idle Focus screen for every mode (that mixes modes: a chip would silently switch to Countdown).

### D6: Background noise, synthesized

`user_prefs.focus_noise` is `''`/`off`, `white`, `pink` or `brown`. Unknown values read as off and are kept unchanged. While it is on, noise plays only while a work phase runs (not paused, not on a break, not in the done state), on whichever screen the user is, because the shell-mounted timer controller (`BreakReminder`/`useFocusTimer`) owns it. The noise is two seconds of generated samples in an `AudioBuffer` (white: uniform random; pink: Paul Kellet's filter; brown: integrated white), looped through a `GainNode` with a 300 ms fade in and out.

The volume is a device setting (`deviceStorage`, 0–100, default 40), because speakers differ per device. It is shown under the noise choice, with a Preview button.

Autoplay rules: after a reload the browser may refuse audio until the user interacts. The controller then waits for the next pointer or key event in the app and starts at that point, and it shows no prompt. Noise respects the device's mute state, as any web audio does. The Focus screen's overflow menu gets "Noise on" and "Noise off" as a quick toggle that writes the same preference.

There are no audio files and no dependency. The added code (about 1 KB) sits in the lazily loaded focus chunk.
*Alternatives:* bundled recordings (hundreds of KB, licences); a per-device noise choice (the choice is a preference like the sound; only loudness is per device).

### D7: Interface budget

- **Sidebar:** one More entry and no new primary destination. The six-destination cap is unchanged; a promoted Focus counts like any other promotion.
- **Panel header:** one icon button beside ⋯. The panel header stays one row.
- **Task properties and chrome:** no task property and no chrome row above lists.
- **Focus screen:** the done state gains two buttons and the overflow menu gains one item. The screen still has at most two visible header actions and one scroll region.
- **Shortcuts:** no new shortcut. Start focus appears in the palette.

## Data model, size and budget

- **New `user_prefs` fields:** `focus_presets` (string, default `""`) and `focus_noise` (string, default `""`). They are additive, not content, converge per field by last-writer-wins, and are exported.
- **Device storage:** `ot.focus.noiseVolume`, cleared on sign-out with the other focus device state.
- **Size:** no dependency, so no image or memory change. Web Audio buffers take about 350 KB of memory only while noise plays (2 s of stereo float samples at 44.1 kHz).

## Risks / Trade-offs

- [The noise keeps playing in a hidden tab] → This is intended while working. It stops at every phase change and on sign-out.
- [Start focus from a row leaves a session running on another task] → The toast names the task that was left and Undo resumes it.
- [An older client receives `focus` in the promoted list] → It ignores unknown entries (existing rule) and keeps the value.
- [Phone users still need three taps to start focus from a row] → Long press, Actions, Start focus. The panel's Focus button is two taps (open, Focus). Revisit with #535's reporter.

## Migration Plan

None. The fields default to empty, so they read as the defaults. To roll back, ship a client without the controls; the stored values stay and older clients ignore them.
