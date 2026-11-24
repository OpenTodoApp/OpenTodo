# Design: keep-open-subtasks

## D1. One preference, two values

`user_prefs.complete_subtasks` is a new string field (default `""`), declared once in `internal/sync/ops.go`. `""` and every unknown value read as "complete them", `keep` as "keep them". It is written with one `mutate` op, so it applies at once, offline, and converges last-writer-wins. Older clients ignore the field and keep cascading; that is safe, because the rule of D2 does not depend on the preference.

Data model: one additive field on `user_prefs`. No task field, no new entity, no rename.

## D2. Kept is derived

A task is kept when it is open, not deleted, and has a live (not deleted) completed ancestor, at any depth, among the tasks the device or server holds. Nothing is written when a parent is completed or reopened; every device derives the same set from synced fields, so it converges whenever `completed_at`, `deleted_at` and `parent_id` converge. A cycle (subtasks "Cycle prevention") stops the walk. A completed subtask of a completed parent is not kept: it is completed work and shows in Completed as before.

The rule lives once per language: `keptIds` in `web/src/lib/subtasks.ts` and `kept.IDs` in the new leaf package `internal/kept`, both checked against `web/src/lib/kept.vectors.json` (listed in `docs/contracts.md`).

## D3. Where the web app applies it

The shared task snapshot (`taskSnapshot.ts`, `deriveSets`) leaves kept tasks out of both sets, as it leaves out tasks of a project in the Trash. Every list, count, filter, the palette, the calendar, the badge, the briefing, the display and progress in list rows read that snapshot, so one filter covers them. A patched snapshot (`patchSets`) derives the sets in full when a change flips a row's completion, deletion, parent or project while it is, or was, a subtask or has subtasks: then rows whose own fields did not change may change state. Every other change keeps the row's earlier keptness.

The parent's detail reads its subtasks from the database (`useSubtasks`), not from the snapshot, so it lists kept subtasks; opening one reads it by id, so it stays editable. Reminders and the shell's widgets and geofences read the database directly; each leaves out kept tasks (`reminderWatcher`, `shellPublish`, `geofences`).

## D4. Completion and undo

`planCompletePlain(id, all, now, keep)` adds the open descendants only when `keep` is false; `completePlain` and the bulk complete read the preference first. Undo already reverses every change of the batch it recorded, so the cascade path reopens the parent and its subtasks, and the keep path reopens the parent alone, which also ends the subtasks' kept state.

## D5. The server

`internal/kept` takes plain rows (id, parent, completed, live). The agent tools' snapshot computes the kept set once after it loads the tasks, and the list, search, Today summary, counts, deadlines and free-time tools skip kept tasks; `get_task` keeps them in a parent's subtasks and by id, and writes still reach them. The digest's counted rows and `ot` lists skip them (`ot list --parent` still shows them). The push scheduler walks a due reminder's ancestors and lets a kept task's reminder wait, as for a project in the Trash: nothing is recorded, so reopening the parent lets it fire.

## D6. Interface budget and size

One page in Settings → General with one switch row: no row of chrome above a list, no task property, destination, scroll region or shortcut. The Settings screen is already a lazy chunk, so the first load only gains the rule in the snapshot (a few hundred bytes). No dependency; no effect on the image size, and one set of ids per snapshot in memory.
