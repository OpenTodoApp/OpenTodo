# Design

## Context

Routines (`routines`) are rules with typed steps; the step types are Text, Task, Tasks, Project, Date, Number and Lines, declared once in `internal/ruleval/steps.go` and mirrored by `web/src/lib/rules/steps.ts`, pinned by `steps.vectors.json`. Note steps today (`note_text`, `append_to_note`, `clear_note`) take a Task or a Project. Triggers are task events, time triggers and `manual`. Standalone notes (`standalone-notes`) are a synced `note` entity with a mergeable document, a project, labels and a workspace, already covered by agent tools (`create_note`, `update_note`, `append_to_note`, `trash_note`, `note_to_task`).

## Goals / Non-Goals

Goals: a note can start a routine, a routine can find, write and file notes, with the same type checking, planning, limits, undo, encryption and sharing rules as tasks; nothing new to learn in the editor.

Non-goals: routines on task or project notes as notes (they have their task and project), a notes query language on the server beyond what Find notes needs, new routes.

## Decisions

### D1. Note and Notes are types, not a kind of Task

A standalone note is not a task (it is never in task lists or counts), so a Task input never accepts a Note. Note and Notes mirror Task and Tasks: a Note where Notes is accepted, one note as a list of one, for-each by the existing rule. Get note text gains a Note input and a `field` of `text` (default) or `title`, so Format text reads a note's title through it, and the "A note is not text" error gets the same insert-step fix as Count. The step declarations stay one table on each side.

Alternatives considered:
- **A generic Item type for tasks and notes.** Rejected: every task step would need a runtime check, and a type error would become a run failure.
- **Note as Text (its body).** Rejected: a routine could then not change a note's labels or move it.

### D2. Three note triggers and a manual run on a note

`note.created`, `note.label.added` and `note.edited` cover "a new note", "file it" and "after I wrote". Edits of a note arrive every few seconds while typing (`notes-save-cadence`), so `note.edited` fires after 5 quiet minutes, keyed by (rule, note, last change time): a job entry in `internal/tenant/jobs.go` with `Next` the earliest pending wait, so the server holds no goroutine per note and a restart neither loses nor repeats a wait. `manual` gains `on: "note"`; an absent `on` means task, so every stored manual routine reads as before. A note trigger is accepted only with `steps`: `actions` are task changes.

Alternatives considered:
- **Fire `note.edited` on every batch.** Rejected: dozens of runs per writing session.
- **`note.label.removed`, `note.moved`.** Left out until asked for; adding a kind later is additive.

### D3. Conditions on note triggers are project and labels

The condition matcher (`internal/ruleval`, shared vectors) reads plaintext task fields. Notes carry project and labels in plaintext, the other predicates (due, priority, blocked…) mean nothing for a note, so only those two keys are accepted and the matcher reads them from the note. New vectors pin it.

### D4. Note steps reuse the agent tools' planning

Create note, Add to a note, Change notes (Trash), Turn into task are planned by `internal/agenttools` like `create_tasks` is for Create tasks, so a routine, an agent and the assistant plan the same change. A routine acts as its run-as person, so `trash_note`'s "only notes this token created" does not apply. Change notes' project change across scopes reuses the device's copy-and-trash, since the server refuses a scope change.

### D5. Find notes is structured, with the shared word matcher

Find notes takes a project (sub-projects included), labels (any, all, none), a change window (`within_days` or `unchanged_days`) and optional words. Words use `internal/notesearch`, already the twin of `web/src/lib/noteSearch.ts`; the Notes page's chip tokens stay client-only (`notes-space`). If `note-search-operators` lands, Find notes inherits `OR` and the field prefixes through the same matcher.

### D6. Encryption

A step that reads or writes a note's title or text, and Find notes with words, is `Content: true`, so on an encrypted account the routine runs on an opted-in device by the existing device-run path; the device planner gains the note steps, pinned by vectors. Label, project and date work stays on the server. Run records hold note ids only.

### D7. Sharing and workspaces

The existing scope checks (`shared.go`, `workspace.go`) extend to notes: a shared routine sees and writes only its project's notes; a workspace routine only its workspace's; a viewer's note fails the run before writing. Pin is personal, so unavailable in a shared routine.

### Data model

No new entity or op field. `trigger` gains kinds and an optional `on`; `steps` gains kinds and a `note` reference form. Both are whole values converging by last-writer-wins as today; a device without this change keeps them and shows "Made with a newer version". `POST /api/v1/rules/{id}/run` gains an optional `note_id`.

### Interface budget

No new screen, row of chrome, sidebar destination or scroll region. Run routine… is a menu item in the note's existing menu and a palette command; no new shortcut. The editor's pickers are the existing ones with note entries.

### Size

A few KB in the lazy routines and Notes chunks, nothing on the first load; no dependency; one small job entry on the server.

## Risks / Trade-offs

- `note.edited` is late by design (5 minutes). A user expecting instant reaction can use Run routine… on the note.
- Find notes with words on an encrypted account always needs a device; the editor's existing encrypted-account warning covers it.
