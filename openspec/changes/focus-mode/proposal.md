# Proposal

## Why

The app is good at deciding what to do (the Daily check picks up to three tasks for today, Next shows one action per project) and then leaves the doing to the list: a row among twenty, the notes a panel away, the time spent invisible. People who want to work on one task at a time with a timer and a nudge to rest keep a separate timer app beside OpenTodo, and the time they spend never reaches the time entries that `time-tracking` introduces. ROADMAP.md lists "a focus timer with time tracking" among the items set aside; `time-tracking` delivers the tracking half, and this change is the timer half on top of it.

## What Changes

- A **Focus** screen at `/focus` (and `/focus/<task id>`) that shows one task with its notes and subtasks and a large timer, reachable with `g` then `Shift+F`, from "Focus on this task" in the task panel's menu and in the command palette. Without a task in the address it takes the first open task of today's focus (the Daily check's list, `weekly-review`), and after a session moves on to the next task of that list.
- Three timer modes, chosen in Settings and switchable from the screen: **Pomodoro** (a work length, a short break, a long break every N cycles, optional auto-start of breaks and of the next work session), **Flowtime** (open-ended, the user stops) and **Countdown** (a length chosen per session). Space starts and pauses, Enter completes the task, Esc leaves the screen. A finished session shows a done state, plays a short generated tone when the user has turned sound on, and shows a system notification through the existing service worker when the tab is hidden.
- A session is a time entry of `time-tracking` (the `time_entries` collection): starting a session starts an entry on the task, pausing ends it and resuming starts a new one (each stretch of work is one entry), completing or leaving stops it, breaks are never logged. When time cannot be logged the timer works the same without logging; this is the degraded behaviour, not an error.
- **Break reminders**: after N minutes of continuous tracked work (default 90, off by default) a notice offers "Take a break", which ends the entry and starts a break, or "Not now".
- Timer state (task, phase, started at, cycle) lives in the device's local store and is never synced; the settings (mode, lengths, auto-start, break reminder, sound) are personal preferences added to the synced `user_prefs` row as additive fields that carry no content.
- The screen works offline, respects the interface budget, and announces the timer to assistive technology at intervals rather than every second.
- New shortcuts: `g Shift+F` (global) and, in the Focus view only, `Space`, `Enter`, `Esc`, `b` and `n`. No new dependency, icon, route on the server, API or environment variable.

Out of scope: idle detection, a desktop app, statistics of sessions beyond what time entries already give, shared or team focus sessions, a focus mode on the server or in the CLI, changes to the time entry entity itself (owned by `time-tracking`), and an audio asset (the tone is generated with the Web Audio API).

Advances ROADMAP.md: the "focus timer with time tracking" item under "Considered and set aside", second half, after `time-tracking`; serves `open-loops-method` (the Daily check's focus has a place to be done) and `stats-and-review` (sessions become time entries).

No new environment variable. The op log format gains additive `user_prefs` fields only. Not **BREAKING**.

## Capabilities

### New Capabilities

- `focus-mode`: the Focus screen, its task selection, the three timer modes and their phases, the done state with sound and notification, keyboard operation and accessibility, the device-local timer state, the synced focus preferences, the link to time entries and the break reminder.

### Modified Capabilities

- `web-app`: a new requirement "Keyboard navigation to Focus" (`g` then `Shift+F`), beside the existing "Keyboard navigation to the review and statistics".
- `settings-navigation`: the "Account and General section contents" requirement gains Focus among the General section's contents.
- `command-palette`: the "Commands by name" requirement's command families gain "Go to Focus" and "Focus on this task" for the selected task.

## Impact

- Web app: a new `web/src/app/focus/` (the screen, the timer engine hook, the done state, the settings card, stories and tests), `web/src/lib/focus/` (pure timer model, the logger seam to time entries, the Web Audio tone), a `focus` route in `web/src/app/router.ts` and `Shell.tsx`, a Dexie table for the device-local timer state (`web/src/lib/db.ts`, schema version 21), new fields in `web/src/lib/types.ts` and `web/src/lib/ops.ts`, the registry entries in `web/src/lib/shortcuts.ts` and `VIEW_SCOPES`, palette commands in `web/src/app/palette/registry.ts`, a menu item in `web/src/app/task-detail/TaskDetail.tsx`, a Focus card in `web/src/app/PreferencesPanels.tsx`, one notification click case in `web/public/push-sw.js`, and catalog entries for the six languages.
- Server: the additive `user_prefs` fields in `internal/sync/ops.go` `Schema` and nothing else; no route, no job, no migration.
- Specs: new `openspec/specs/focus-mode/spec.md`; deltas on `web-app`, `settings-navigation`, `command-palette`.
- Docs: new `docs/focus.md`, `docs/keyboard.md` regenerated from the registry, `docs/settings-app.md` (the Focus card), `docs/method/rhythms.md` (the focus list has a screen), `docs/README.md`, a `focus-light.webp` / `focus-dark.webp` screenshot pair.
- Bundle: about +7 KB gzipped (screen, engine, settings card, tone; no asset, no dependency). Binary and container image unchanged; runtime memory unchanged.
- Depends on `time-tracking` for logging; without it the timer still works and nothing is written for a session.
