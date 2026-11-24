# Design

## Context

The Focus timer (focus-mode D1-D3) is one record, `FocusState`, in the device-local Dexie table `focus`, row `current`. Pure functions in `web/src/lib/focus/timer.ts` move it from state to state given `now`; `web/src/lib/focus/session.ts` runs each user action as one guarded transition (`transitionFocus` re-reads the row and gives up when the run moved on) and starts or stops the stretch's time entry. The engine `useFocusTimer` (mounted once by the shell) finishes a due run, pauses a run whose entry was stopped elsewhere, ends a run whose task went away, and derives the sound, the notification and the noise from the row. Only the time entry syncs today.

## Goals / Non-Goals

Goals: the same session on every device of a person, with no ticking writes, one device that rings, offline edits, and convergence without a prompt. The Focus screen and its tests keep reading the local row, so the change stays in `lib/focus`.

Non-goals: see the proposal (In Progress, coworkers, REST/MCP, a takeover action).

## Decisions

### D1. One JSON field on `user_prefs`

`user_prefs.focus_run` (`kString`, default `""`) holds the shared part of the record as JSON:

```json
{"v":1,"rev":"5f0c…","taskId":"…","mode":"pomodoro","phase":"work","startedAt":1764000000000,"resumedAt":1764000000000,"accumulatedMs":0,"plannedMs":1500000,"cycle":2,"breakKind":null,"entryId":"…","ended":null}
```

The user's preferences row is personal (it reaches only the author's devices), already synced, exported and per-user, so no entity, table, route or permission is added. A single field, not one field per property, because the op log merges per field: two devices that each change the session offline must converge on one whole session, never on the task of one and the start of the other. Last-writer-wins on the one field gives exactly that.

The device-only parts stay on the device: the last Countdown length (`lengthMinutes`), the "Not now" mark of the break reminder (`remindedAtMs`) and why a run paused itself (`pausedReason`). `v` lets a newer client change the shape; a record this client cannot read (unknown `v`, a missing or mistyped field, not JSON) is ignored and kept.

Alternatives: a new `focus_session` entity (a table, a migration and permission rules for one row per person: too much), additive fields per property (mixes sessions on a conflict), or the time entry (it does not exist during a pause or a break).

The value carries ids and timestamps only, no content, so it is not an encrypted field, like the time entry's `focus_mode` and `planned_end_at`. It is accepted by the existing kind check; clients validate the shape.

### D2. The local row stays the working copy; a revision decides what to adopt

Every published transition gives the local row a new random `rev` and adds the previous one to `seen` (the last eight). After the local write the device publishes the record with `mutate('user_prefs', 'me', { focus_run })`. The engine watches the preferences row; a record whose `rev` is neither the row's `rev` nor in `seen` came from another device and is *adopted*: the local row takes the record's fields, keeps its device-only fields, sets `rev` and marks the row `remote`. A record already seen is ignored, so the short window between the local write and the outbox write, or a second quick transition, never rolls the row back.

A revision instead of comparing timestamps: device clocks drift, and the op log has already chosen the winner by its own clock; the device only has to notice that the winner changed.

### D3. Only user actions are published

Published: start, pause, resume, stop (Flowtime's Done), break, extend, complete (on this device), leave or change the task, Undo of a left session, and recording the new entry id on the run. Local only: a timed run reaching its end, a run that pauses itself because its entry was stopped elsewhere, a run that ends because its task was completed or trashed elsewhere, and "Not now".

The local-only transitions are functions of synced data (the record, the preferences, the entry, the task), so every device computes them on its own. Publishing them would be ticking writes and could undo a newer change: a laptop waking from sleep would otherwise write the end of an old run over the session the phone started while it slept.

When a run ends on its own, every device that notices stops its entry at the planned end (the same value, idempotent). Starting the next phase on its own ("Start the next session automatically") attaches a new entry only on the owning device (D4), so two devices never start two entries for one stretch.

### D4. The device that made the last change owns the session

The row's `remote` flag is false after a local published transition and true after an adoption; local-only transitions keep it. Rows written before this change have no flag and are owned. The owner plays the sound and shows the system notification (focus-mode "Session end notification"), plays the background noise, shows the break reminder, attaches the entry of an auto-started work phase, and hands the session to a native shell's Live Activity or ongoing notification (focus-live-activity), whose own end notification then fires once. Other devices show the same state with no sound or notification. Any change on a device (a pause and resume) makes it the owner.

The alternative, every device notifying, rings the laptop and the phone at the same instant; ringing only where the person last touched the session matches the issue ("when I switch devices") without a setting.

### D5. Entries

Pausing, stopping or changing the session on device B stops the entry device A started: the entry is an ordinary synced row, so B's `updateTimeEntry` writes its end. A record that names an entry the device has not received yet must not look like an entry stopped elsewhere, so `timeTrackingLogger.running` reads a missing entry as still running (an own entry is always written locally before the record names it). Two devices that start sessions offline each start an entry; time-tracking's "One running entry per user" repair ends one of them after sync, without anything new here.

### D6. Import, export and sign-out

The export carries `focus_run` like every preference. The importer drops it (`internal/importer/profile_opentodo.go`), so restoring a backup never resumes a session from the past. Sign-out still clears the local row; signing in again adopts the account's current record.

## Risks / Trade-offs

- The server now knows that a session is paused and how much time was left (focus-mode said nothing leaves the device). It is the user's own server, the value holds no content, and the issue asks for exactly this sync. The time entry already told the server about running work.
- A change made on a device whose clock runs far ahead wins over later changes elsewhere, as for every other op (the hybrid logical clock limits it to the skew the server accepts).
- With "Start the next session automatically", the owner records the new work phase's entry on the run, which is published. An owner that wakes after the break's end and before it has pulled a newer session started elsewhere can therefore write over that session once; every device still converges on that one written state, and of the two running entries time-tracking's one-running-entry repair keeps one. Rare (an auto-start setting, a sleeping owner, a new session in between), so it is accepted rather than adding a takeover protocol.
- If the owning device is closed, the other devices show the end silently. Pausing and resuming on the device at hand moves the sound there.

## Data model impact

One additive field, `user_prefs.focus_run` (`kString`, default `""`), declared in `internal/sync/ops.go` `Schema`, generated into `web/src/generated/opSchema.ts`. The local `FocusState` gains three optional device-side properties (`rev`, `seen`, `remote`); no Dexie version bump, the table is keyed by `id` only.

## Interface budget

No screen changes: no chrome, property, sidebar entry, scroll region or shortcut is added. No new UI string.

## Dependencies, size and memory

No dependency. About 1 KB of code in the first-load bundle (`lib/focus/state.ts`); no image or memory impact.
