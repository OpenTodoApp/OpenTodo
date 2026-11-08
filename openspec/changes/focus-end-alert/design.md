# Design

## D1. Data: a second field, not a third value of `focus_sound`

`focus_sound` is `"on"`/`"off"` and a 1.0 client reads anything but `"on"` as off. Storing `"long"` there would silence a Long user's 1.0 devices. So the length goes into a new field, `focus_alert` (`"short"` | `"long"`, empty or unknown = short, kept as stored), and `focus_sound` keeps its meaning: a 1.0 client plays the short tone for Long, which is the closest it can do.

The Settings choice maps onto the two fields: Off → `focus_sound = "off"` (the length is left as stored); Short/Long → `focus_sound = "on"` and `focus_alert`. Both fields go in one `mutate` call, so they leave together and converge per field by last-writer-wins. Offline: the write applies locally at once and syncs later, like every preference.

Data model impact: one additive string field on `user_prefs`, default `""`, not content (a setting, not encrypted), no activity event, part of the export like the other focus fields.

## D2. Long alert

The long alert lives in `web/src/lib/focus/alert.ts`, loaded with `import()` only when a Long end plays (the engine is in the shell's first load, which has no room). It reuses the audio context of `tone.ts`: `playTone(peak)` takes the peak gain (0.2 for Short, as today; 0.5 for Long).

The alert plays one tone at once and one per second after, ten in all (about ten seconds). It stops at the first `pointerdown` or `keydown` anywhere on the page (captured, so it also covers the click on Start the break), when the page is hidden, or after the tenth repeat; a new alert replaces one still playing. Stopping clears the interval, removes the listeners and, on a dismissal, cancels a vibration in progress. An auto-started next phase does not stop it: the alert is there to be noticed, and it ends by itself.

Vibration: when `navigator.vibrate` exists and the haptics preference is on (the same check as `motion.ts`), each repeat calls `navigator.vibrate([200, 100, 200])`. Browsers that ignore it (desktop, iOS Safari) do nothing.

## D3. Interface

The sound row keeps its label ("Sound") and becomes one Select with Off, Short and Long; its description goes (no helper text). Nothing else on the screen changes. Interface budget: no new chrome, row, property, scroll region or shortcut.

## D4. Size

`prefs.ts` and `useFocusTimer.ts` grow by a few dozen bytes in the first load; `alert.ts` is its own chunk of well under 1 KB. No dependency; no effect on the container image or server memory.
