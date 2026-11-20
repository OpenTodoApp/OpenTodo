## Context

- **Skips.** A skip already exists for every repeating task. Skipping the current occurrence moves the series on; for a habit it also writes a skipped occurrence record. Skipping a later occurrence writes a skipped record. Records are exceptions: the series never lands on them (`recurring-tasks` "Act on one occurrence", "Exceptions come from the records").
- **Habits.** A habit's streak counts skipped records as kept, and they never count as done (`habits`).
- **Delivery.** Reminders go out from the server (push, and the notification channels through the same pass) and from the device (in-app reminders and local notifications, and the shells' scheduled alarms). The weekly email digest is sent by a server job.

## Goals / Non-Goals

**Goals:** one action that clears a period of repeating occurrences, also after the fact; streaks that survive; quiet reminders while away; the same through the API and the CLI.

**Non-Goals:** non-repeating tasks; telling project members; kinds of away; series created during the period.

## Decisions

### D1. An away period is skips, not a calendar that everything reads

The alternative was a stored calendar of away days that overdue logic, streaks, projections, counts and the server's occurrence code would all read. That is a new rule in a dozen places, each of which can drift. Skips already converge, work offline, keep streaks and are undone like any batch.

So **Away** turns the range into skips, using the rule that exists:
- For each covered series with a calendar rule, every occurrence whose date is in the range, from the current one on, is skipped as "Skip this occurrence" does it. The current occurrence moves the series to its next free date; later ones get skipped records.
- A completion-relative series whose due date is in the range moves to the day after the range. A habit also gets the skipped record of that date.
- The batch is one Undo. It is computed on the device from local rows, so it works offline. Two devices applying the same range write the same derived record ids and converge.

### D2. What it covers

The choice is **Everything** or **Only**, with projects and labels picked with the Combobox. A series is covered when its project or one of its labels is chosen.
- A series the user may not edit (a viewer in a shared project) is never covered.
- The dialog shows what it will do, for example "Skips 23 occurrences of 6 repeating tasks", before **Set away**.

### D3. The stored period: one field

`user_prefs.away` is a string: empty, or `YYYY-MM-DD..YYYY-MM-DD` followed by ` quiet` when reminders are paused.
- It is one field, so last-writer-wins never mixes the start of one device's period with the end of another's.
- Clients read a malformed value as no period, and keep it.
- The field is not content, so it is not encrypted: the server needs it to hold reminders.
- One period at a time. Setting a new one replaces it, and **End now** clears it. Past periods leave their skips behind and nothing else.

### D4. While away

Away holds while the user's logical today (`date-time-preferences`) is within the range.
- **Today:** the title's meta reads "Away until Friday". **End now** in Today's menu clears the field; its skips stay, and Undo of the original batch is the way to take them back.
- **With ` quiet`:** the server delivers no reminder (push, channels) and sends no email digest; a reminder it holds is marked dismissed, and a held digest is recorded with the outcome `away` for its date. Devices show no in-app or local reminder for a firing on a day of the period, and the shells are not handed one. The day is the user's logical day (their zone and day start).
- **Held reminders are dropped, not queued (on the server dismissed, on a device judged by the firing's day):** their occurrences were skipped anyway, and a non-repeating task's reminder is still listed on the task. The day after the period, delivery resumes.

### D5. Route and CLI

`POST /api/v1/away {from, to, projects?, labels?, pauseReminders?}`:
- sets the field and applies the D1 skips through `ApplyStrict`, using the server's own occurrence code, the same as the occurrence skip route;
- answers `{away, skipped}`;
- needs a session or a token allowed to write tasks, and refuses read and agent tokens like every other task write, and tokens limited to workspaces, since the period covers the whole account (the policy, `signedIn`, is declared where the route is registered and checked by `policy.go`);
- answers 400 `invalid_input` naming the field for a malformed date, `from > to` or a range over 90 days, and 404 for a project or label the caller cannot see.

`DELETE /api/v1/away` clears the field and answers 204. In the CLI, `ot away <from> <to> [--project …] [--label …] [--keep-reminders]` and `ot away --end` call them.

## Data model

One additive field, `user_prefs.away` (kString, default `""`). It changes no rows of other entities beyond the ordinary skips. No migration.

## Risks / Trade-offs

- **A series added after the action is not skipped.** Running Away again for the rest of the range covers it, and repeating the action writes no duplicate (derived ids).
- **Large accounts:** a 90-day range over many daily series could be thousands of records. The batch is bounded by the range cap. The preview shows the count before anything is written, and the existing batch limits apply.
- **Size:** the dialog is lazy, so the first-load budget is unchanged. No dependency, so image size and memory are unchanged.

## Interface budget

- No new row above a list: the Today line is the title's meta, which exists.
- One menu item in Today's menu and one palette command. No sidebar destination and no shortcut.
- The dialog has two date fields, a choice (Everything / Only, with a Combobox), one switch and the preview line.
