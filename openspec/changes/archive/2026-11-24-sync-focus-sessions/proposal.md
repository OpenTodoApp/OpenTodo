# Proposal

## Why

A Focus session lives on the device that started it (focus-mode, "Timer state stays on the device"). Start a Pomodoro on the laptop, pick up the phone, and the phone's Focus screen shows nothing: only the time entry syncs, and it disappears while the session is paused or on a break. People who move between devices want to see, pause and finish the same session wherever they are ([#1943](https://github.com/OpenTodoApp/OpenTodo/issues/1943)).

## What Changes

- **One session per person, on every device.** The running session (task, mode, phase, start, pause state and time accumulated, planned length, cycle, break, its time entry and how the last run ended) is stored in one additive field on the user's synced preferences row, `user_prefs.focus_run`, as a small JSON record. Starting, pausing, resuming, stopping, taking a break, extending, completing or leaving on one device shows on the others after sync.
- **Nothing ticks.** The record holds timestamps; every device computes the clock from them, so a running session writes nothing until someone changes it. The end of a timed run is derived on every device from the record and is never written.
- **Conflicts are last-writer-wins.** The record is one field, so two devices that change the session offline converge on the later change as a whole; a mix of two sessions is impossible.
- **One device rings.** The device that made the last change owns the session: only it plays the sound, shows the system notification, plays background noise, shows the break reminder and hands the session to a native shell's lock-screen timer. The other devices show the same state silently.
- **Offline** works as before: the change applies at once on the device and the op waits in the outbox.
- A restore from an export does not bring back an old session: the importer drops `focus_run`, as it drops `app_link_schemes`.

Not **BREAKING**: one additive op field; older clients ignore it and keep their device-local session. No route, no environment variable.

## Out of scope

- Moving the task to an In Progress status or section when a session starts (the second idea in #1943). It is a project setting with its own permission questions and deserves its own change.
- Showing a session to coworkers. The record is personal (user_prefs reaches only the author's devices); a running work stretch is already visible to others as a time entry.
- REST and MCP routes for the session. `GET /api/v1/time-entries/running` and `opentodo://time-entries/running` (focus-session-readable) keep describing the running stretch; reading or writing the record from outside is not trivial to keep correct and is left out.
- A takeover action ("Ring here"). Any change on a device (pause and resume) moves the sound to it.

ROADMAP item advanced: milestone 0.20 "Everywhere" of the 1.0 plan (the same session on every device).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `focus-mode`: "Timer state stays on the device" is replaced by "Session syncs across the user's devices"; "Sessions are time entries" loses the promise that the degraded path writes no op.
