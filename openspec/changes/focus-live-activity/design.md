# Design

## Context

The focus timer's state lives in one device-local row (`web/src/lib/focus/state.ts`, `FocusState`: `taskId`, `mode`, `phase`, `startedAt`, `resumedAt`, `accumulatedMs`, `plannedMs`, `cycle`, `breakKind`, …). It is never an op and never leaves the device (focus-mode "Timer state stays on the device"). The shells reach the web app through bridge version 1 (`web/src/lib/shell.ts`). Capabilities gate every method, so adding one needs no version bump.

The platforms:
- **iOS.** ActivityKit has been available since iOS 16.1, so it is inside the shell's 16.4 floor. An activity's content can only change when the app runs, or by push. Two things work without either: the system can draw a running clock from a date (`Text(timerInterval:countsDown:)`, `Text(_:style: .timer)`), and an activity can carry a `staleDate`. Interactive buttons (`Button(intent:)`) exist from iOS 17 and run an App Intent in the app's process.
- **Android.** An ongoing notification with `setUsesChronometer(true)` and, from API 24, `setChronometerCountDown(true)` draws a running clock with no updates. The shell already holds the exact-alarm permission flow for reminders.

## Goals / Non-Goals

**Goals:**
- See the time left and the phase without unlocking or opening the app.
- Be told when a session ends while the app sleeps, inside the shells too.
- Change nothing for browsers and for users who never use Focus.

**Non-Goals:**
- Controlling the timer without opening the app, push updates, other devices' sessions, a watch.

## Decisions

**D1. One method, the whole state, every time.**
`publishFocus(json)` carries:
`{v: 1, state: "running"|"paused"|"done"|"none", taskId?, title?, mode, phase: "work"|"break", breakKind?, cycle?, cycleLength?, phaseStartedAt, runningSince?, elapsedMs, plannedEndAt?, plannedMs?}`.

- `elapsedMs` is the time accumulated before the current stretch.
- `runningSince` is set only while the session runs.
- `plannedEndAt` is computed by the web app for timed phases. It is absent for Flowtime work and while paused.

The web app publishes the whole state on every transition: start, pause, resume, phase change, end, task change, leaving the screen, and the break reminder's "Take a break". It also publishes on start whenever a row is stored, and `{state: "none"}` on sign-out, on lock of an encrypted account and when no session is stored. A shell replaces what it shows with what it last received.

Alternative: separate `start`, `pause` and `end` methods. They are more calls to get right in two languages, and a missed call leaves a stale activity. A full snapshot is idempotent.

The payload is part of the shared bridge fixtures (native-shells "Shared bridge fixtures"), so both shells parse the file the web app produces.

**D2. The system clock does the counting, and a stale date marks the end.**
Neither shell receives updates while the app sleeps, so nothing may need them:
- **iOS.** A timed phase shows `Text(timerInterval: runningSince…plannedEndAt, countsDown: true)`. Flowtime shows `Text(phaseStart, style: .timer)`, with the start shifted by `elapsedMs` so the total is right. A paused session shows the frozen elapsed time. The activity's `staleDate` is `plannedEndAt`. When `context.isStale`, the view reads "Session done · open to continue". The activity is ended with `dismissalPolicy: .after(plannedEndAt + 15 min)` once the web app publishes `done` or `none`. When the web app never runs again, the system's 8-hour limit removes it.
- **Android.** The ongoing notification uses `setWhen` and the chronometer (count-down for timed phases). At `plannedEndAt` the shell's exact alarm replaces it with a normal "Session done" notification and cancels the ongoing one.

Rejected: APNs push to update the activity. It needs a server sender and a credential per instance (ios-shell D3), and it would send the session's existence to Apple's servers.

**D3. The shell owns the session-end notification.**
Both shells schedule a local notification ("Session done" or "Break over", naming the task when a title was handed over) at `plannedEndAt`. They reschedule it on every publication and cancel it on `paused`, `done` and `none`. In a shell that lists `focus`, the web app skips the service-worker notification of focus-mode "Session end notification", so the user never gets two. A tap opens `/focus`. Pomodoro auto-start of the next phase still happens in the web app when it next runs, computed from the clock as today.

**D4. Pause and Resume open the app.**
The lock-screen view and the expanded Dynamic Island carry **Pause** (or **Resume**) as a link to `opentodo://focus?action=pause|resume`. The Android notification carries the same as an action with a `PendingIntent` opening the activity. The shell maps the link to `/focus?action=…`, and the web app applies it through the same transition code as the Space key, then removes the parameter (as `shellActions.ts` does for reminder actions).

Alternative: iOS 17 interactive buttons (`LiveActivityIntent`) that pause without opening the app. Pausing must stop the running time entry (focus-mode "Sessions are time entries"), which is an op written by the web app. Doing that from the background means loading the web app in a hidden run under a 30-second budget, and a pause that silently fails is worse than one extra unlock. This is the same reasoning as ios-shell D12 for reminder actions. It can be revisited once hidden runs are measured on devices.

**D5. Titles follow the reminder rule.**
`title` is included only when the device's "include task titles" option (the one the reminder schedule uses) is on **and** the account is not encrypted. Otherwise the activity and the notification read "Focus session". The lock screen is visible to anyone holding the phone, and an encrypted account's titles never leave the web view in clear. Pause and Resume carry no content.

**D6. No OpenTodo setting.**
The user turns the activity off in iOS (Settings ▸ OpenTodo ▸ Live Activities) or the "Focus" channel in Android's notification settings. Each shell honours the system switch (`ActivityAuthorizationInfo().areActivitiesEnabled`; a disabled channel). The web app does not need to know, because publishing is harmless when nothing is shown. `docs/focus.md` names both places. A setting in Settings → General → Focus would only duplicate the system's switch and add a row that browser users would have to see.

**D7. Lifecycle and cleanup.**
The shell deletes the last publication, ends the activity, cancels the notification and the alarm:
- when it receives `none`,
- on "Change server" (`AppModel.forgetServer` / Android's equivalent),
- on sign-out (the web app publishes `none` before the reset),
- when the web app's own reset publication arrives.

A Live Activity started by the app survives the app being killed. On the next launch the web app publishes the stored state and the shell reconciles: it updates the existing activity rather than starting a second one. There is at most one activity per app, and the shell ends any extra one it finds.

## Data model impact

None. No op, field, route or migration. The shell keeps the last publication in its private storage (the iOS App Group, for the widget extension that draws the activity; Android's private preferences). The data is deleted as described in D7.

## Size

- Web: the publisher (`web/src/lib/focus/shellPublish.ts`) and the `/focus?action=` handling, under 1 KB gzip. Checked by `web/bundle-budget.json`.
- iOS: the activity views in the existing widget extension, about 80 KB, ActivityKit only.
- Android: one channel, a notification builder and an alarm receiver, about 10 KB, no new library.
- Server: none.

## Interface budget and progressive disclosure

No screen of the web app changes. Nothing is added to the Focus screen's header, to any list, to the sidebar or to the shortcut registry. A browser user and a Simple-list user who never starts Focus in a shell see nothing new.

## Relation to other changes

- `focus-session-readable` (same milestone) makes the running session readable through the server, using the work session's time entry. This change does not depend on it and does not write anything new to the server.
- `apple-shortcuts` adds the `capture` capability and its own payload to the same fixtures. The two capabilities are independent.

## Risks

- **A stale activity after the app was killed mid-session** that never runs again: the 8-hour system limit and `staleDate` bound it.
- **Auto-start while asleep.** With "Start breaks automatically" on, the lock screen says "Session done" until the app runs, because the break starts only when the web app computes it. The docs say so.
