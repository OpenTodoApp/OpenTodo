# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **A habit is a flag on a series.** `task.habit` and the occurrence record's `skipped` are the only stored habit data (`habits` design D1). Streaks and the month grid are computed by the pure module `web/src/lib/habits.ts` from the series, its records and the logical today, pinned by `web/src/lib/habits.vectors.json`; the server computes nothing.
- **Records already carry a day.** Completing or skipping writes the occurrence record with the derived id (series id plus date), so two devices acting on the same day converge on one row (`recurring-tasks` "Occurrence records"). Editing a past day can reuse that row.
- **Opt-in features live in How you work.** Objectives is a `user_prefs` string read as off unless `on` (`plan-objectives` "Objectives switch", `internal/sync/ops.go`). ROADMAP.md's 1.0 principle "Calm by default" asks every new primitive to be opt-in there.
- **Today already treats habits specially.** A habit never takes a Today-limit slot (`web/src/lib/closedList.ts`), never waits in a sequence (`web/src/lib/flow.ts`), gets no default reminder (`web/src/lib/defaultReminder.ts`) and belongs to a part of the day (`day-parts`).
- **Series can be split into pieces of one lineage**, and habit history is computed over the lineage with each piece's dates inside its range (`habits` "Habit history across a split").
- **Reminder text is composed on the device** from its own copy of the task; a push carries ids only (`docs/reminders.md`).

## Goals / Non-Goals

**Goals:**
- One preference decides whether a user ever meets habits; "off" leaves no trace in the interface and loses no data.
- Every number stays derived on the device from rows that already sync, identical on every device, pinned by vectors.
- The screen, the strip and the form stay inside the interface budget of `docs/interface-guide.md`.

**Non-Goals:**
- A separate habit entity or log (rejected again for the reasons of `habits` D1).
- Server-side numbers (`habits-assistant`), notes per check-in (`habit-notes`), targets and amounts (`habit-targets`).
- A manual order of habits; the screen orders by part of the day, then time, then title.

## Decisions

### D1. One `user_prefs.habits` string with three states

`""` (not decided), `on`, `off`, declared in `Schema` like `objectives`, not content. A boolean cannot tell "never decided" from "turned off", and the difference is the whole point: not decided keeps the quiet ways in, off removes them. Unknown values read as not decided and are kept, as for every string preference.

The effective state is computed, never written: `on` if the preference is `on`; `on` if it is `""` and the device holds at least one open habit (existing users keep what they had without a migration op); otherwise the preference. Turning on **Track as a habit** while not decided writes `habit: true` and `habits: "on"` in one batch.

- **Alternative: write `on` for existing users in a migration.** Rejected: a migration op from every device of every user, for a value the device can derive.
- **Alternative: two booleans (enabled, dismissed).** Rejected: two fields to converge for one choice.

### D2. Off is presentation only

Every habit control reads one hook, `useHabitsEnabled()`, and renders nothing when it is false. No write path checks it: completing, skipping, the API, CalDAV and the assistant behave the same whatever the switch says, so a habit's records keep accruing and turning Habits on again shows an unbroken history. The `habit` filter keyword keeps working while off (a saved view is the user's own query).

### D3. The Today strip replaces rows instead of adding them

`habits` D5 rejected a Habits section in Today because it would list the same rows twice. The strip moves them: while on, `listGroups` takes habits out of Today's groups and the strip renders them. The strip is the list's first group (inside the list's scroll region), not chrome, so the budget of 2 chrome rows above the first item holds. One line, two at most on a phone, "+N" beyond.

### D4. Kept, strength, at risk and back on track in `habits.ts`

All four extend the existing pure function, over the same scheduled dates (rule dates plus record dates, lineage-aware):

- **Kept**: done or tiny records among the last seven scheduled dates before the current occurrence. Seven scheduled dates, not seven calendar days, so a weekly habit reads "3 of 7" over its last seven sessions.
- **Strength**: `s = s * (1 - a) + a * v` over scheduled dates in order, `v` 1 for done or tiny, 0 for missed, skipped dates skipped. `a = 1 - 0.5 ^ (sqrt(f) / 13)` with `f` the rule's scheduled dates per day (1 for daily, 3/7 for three a week), the half-life used by Loop Habit Tracker, so one miss after a long daily run costs about five points and the score means the same for daily and weekly habits. Shown rounded, 0 to 100.
- **At risk**: the two latest scheduled dates before the current occurrence are both missed. **Back on track**: the latest is done after two or more missed.

New vectors pin each: a 60-day run with one miss, two misses, a comeback, a weekly habit, a tiny day, a split lineage, a graduation gap.

- **Alternative: keep the streak as the headline.** Rejected: the research (Lally 2009; the abstinence-violation effect) and the Gentle mode plan both say an all-or-nothing counter drives people away. The streak stays on the habit's page.

### D5. Tiny version and anchor as task fields, `tiny` on the record

`habit_tiny` and `habit_anchor` are `Content: true` strings on `task` (user-written, encrypted on E2EE accounts); `tiny` is a bool on the record, set in the completion batch. Records copy the series' fields (`recordFields`), so `tiny` must be excluded from that copy and set only by the tiny action; `habit_tiny` and `habit_anchor` are copied like other fields and harmless. The reminder body is composed on the device from its copy of the series, so the tiny version reaches the notification on encrypted accounts too, wherever the device can read it; the push payload is unchanged.

### D6. Editing a past day writes or tombstones its record

Done, Tiny and Skipped on a past scheduled date write that date's record with the derived id and `occurrence_date`, like a completion, but without the series patch: the series keeps its due date. Clear sets `deleted_at` on the record. A record written for a date before the current occurrence already counts on its date (`habits` "Streak derived from the schedule and the records"), so the numbers follow without new rules. The editable range is from the first scheduled date of the lineage to the logical today; a future date stays the "done ahead of time" path.

- **Alternative: a separate backfill table.** Rejected: it would be a second source of truth for the same day.

### D7. Graduation ends the piece; Resume starts a new one

Graduate writes, in one batch, `habit_graduated_at` and the rule's `until` set to the last scheduled date before today. One availability predicate shared by Today, Upcoming, projections, reminders and the Today limit (`web/src/lib/occurrences.ts` and its Go port in `internal/recurrence`, used by `internal/push`) excludes a task with `habit_graduated_at` set. Resume splits the lineage from the next scheduled date on or after the logical today with the rule as it was before `until`; the new piece inherits `habit` and clears `habit_graduated_at`. The gap between the pieces is outside every piece's range, so it reads as unscheduled, not missed, with the existing lineage rules. "Kept for N days" is the count of done and tiny days over the lineage.

- **Alternative: a paused-ranges list on the task.** Rejected: a list field to converge, and the lineage already models "the schedule changed here".
- **Alternative: complete the series.** Rejected: it would put the habit in Completed and in `completed` queries.

### D8. Hue, thread and moment from tokens

The hue is the project's palette hue, or one of the 12 picked by a stable hash of the task id when there is no project. The thread is inline SVG in `web/src/app/habits/Thread.tsx` (no library): marks by shape (filled, half, dash, empty, ring), lines solid, dotted or absent, colours from `bg-hue-solid`/`text-hue` and `color-mix()` over tokens for the thin at-risk line. The check-in reuses the 400 ms completion moment and the haptic tick; under reduced motion it renders the end state. Storybook stories cover each state in every built-in theme, light and dark, at 360 px, and the visual-regression baselines include them.

Before release, a design review places screenshots of the screen, the strip and a habit page side by side with three to four leading habit apps; the notes stay in this change folder and are never published on the website.

### D9. Placement and keyboard, inside the interface budget

- **Sidebar:** Habits is a More destination, so the primary destinations stay at six or fewer; the sidebar order setting can promote it.
- **Habits screen:** one title row of chrome (title and **New habit**); rows show five properties (colour, title, anchor, thread, measure) plus the check button; one scroll region.
- **Task page:** the habit section stays under the repeat rule; tiny version and anchor are two lines there, not extra row properties.
- **Shortcuts:** `g` then `Shift+H` opens Habits (free in the registry); on a focused habit row, Space checks in and `Shift+Space` logs the tiny version, registered in the Habits screen's scope so they don't conflict with list scopes.

## Data model impact

Additive only, no rename: `user_prefs.habits` (string, not content); `task.habit_tiny`, `task.habit_anchor` (string, content); `task.habit_graduated_at` (nullable timestamp); `task.tiny` (bool). Regenerated `web/src/generated/opSchema.ts` and the v1 surface snapshot.

## Size and memory

No dependency. The strip and the switch add under 2 KB gzip to the first load; the screen, the form, the thread and the editable grid load in the Habits chunk. No server memory change; the Go availability check is one field read.

## Risks / Trade-offs

- **[An older client ignores `habit_graduated_at`]** → It would show a graduated habit as live until it updates. Client and server ship in one binary and the PWA updates on reload; the rule's `until` also stops new occurrences on old clients.
- **[Seven scheduled dates read oddly for a weekly habit]** → The label says "3 of last 7 sessions" in the habit's page, and the vectors pin it.
- **[Users expect habits in Today's list]** → The strip sits where the list starts, and Habits off brings the rows back.
- **[The strip crowds Today for many habits]** → Two lines at most, "+N" beyond, and the heading folds it per device.

## Migration Plan

None beyond shipping. Existing habits make the effective state on (D1). Rollback: a client without this change ignores the new fields; habits revert to rows with a streak chip.
