# Design

## Context

The end of a timed Focus run is derived on every device from the shared record (sync-focus-sessions D3): the engine `useFocusTimer` re-reads the clock every second and when the tab is shown or focused, writes the done state through `finishIfDue`, and derives the sound and the notification from that row change (`useEndEffects`). Today a hidden tab shows the notification and keeps the sound for the moment the tab is shown again; the Long alert stops itself when the tab is hidden. In a hidden tab, browsers throttle `setInterval` to about once a minute (Chrome's intensive throttling after five minutes), so the end is noticed late too. The tone is generated with the Web Audio API on one `AudioContext` per tab, created and resumed by the Start click (`primeTone`).

## Decisions

### D1. Schedule the tone on the audio clock while the tab is hidden

While the tab is hidden, the device owns the session (`!state.remote`), a timed run is running, the sound is on, the page is not in a native shell, and the tab's audio context exists and runs, the engine schedules the chosen sound on the audio clock: `currentTime + (plannedEnd − serverNow()) / 1000`. Short is one tone at its usual peak; Long is ten tones one second apart at Long's peak. The audio clock runs on the audio thread and keeps time in a hidden tab, so the tone plays at the planned end whatever the browser does to timers.

The schedule follows the state: a pause, an adoption of another device's change (`remote`), a new planned end, a change of the sound setting, or the tab being shown before the end cancels the tones that have not started. A context that was never woken in this tab is not created from a hidden tab (no gesture, so autoplay rules would keep it suspended), so such a tab keeps today's behaviour.

Alternatives: a timer (throttled to a minute); a silent looping sound that exempts the tab from throttling (the issue's workaround: a speaker icon on the tab, power use); scheduling at Start, also while visible (it would ring alongside the visible path, and Long's acknowledgement by click or key would no longer apply); the service worker (it cannot play audio); a notification with sound (the system chime, suppressed over fullscreen apps).

### D2. The tone wakes the engine

The first note's `ended` event (an audio event, not a timer, so not throttled) makes the engine read the clock at once. The run is then due, `finishIfDue` writes the done state, and the notification is shown with the sound instead of up to a minute later. Nothing else changes in how the end is written.

### D3. One ring per session end

The key of a session end is the run's start, its planned end and its phase: the key the done state carries (`ended.runStartedAt`, `ended.at`, `ended.kind`), so it is known before the end. Every ring (scheduled in a hidden tab, played in a visible tab, played when a tab is shown) first claims the key in the device's storage (`focusAlertRung`, one value, also kept in memory when storage is refused); a key already claimed is not rung again, so two tabs of one browser ring once. A scheduled tone cancelled before it started gives its claim back. When the done state arrives in a hidden tab whose scheduled tone has started, nothing is kept for the return; when the tone did not start (a phone browser that suspended the audio), it is cancelled, its claim given back, and the tone plays when the tab is shown, as before. Between devices the rule of sync-focus-sessions D4 stays: only the owner rings.

### D4. Long in the background

The background Long has no click or key to wait for, so its repeats stop when the tab is shown again (coming back is the acknowledgement) or after ten. No vibration: it is a desktop path. The constants (`REPEAT_MS`, `REPEATS`, `LONG_PEAK`) move to `tone.ts`, re-exported by `alert.ts`, so the lazily loaded alert chunk stays out of the first load.

## Data model

None: no op field, nothing synced. One device-local storage key, `focusAlertRung`.

## Size

`tone.ts` gains one function and the engine one hook: well under 1 KB gzip on the first load. No dependency, no image or memory impact.

## Interface budget

No screen changes: no new control, text, row or shortcut.
