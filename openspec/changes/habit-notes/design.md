# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Records copy the series.** `recordFields` (`web/src/lib/recurring.ts`) and the server's completion (`internal/sync`, `RecurringCompletion`) copy the series' fields into the occurrence record, `description` included. For a habit that would paste the habit's own note into every day.
- **A record is a task.** It already has a note field (`description` plus the rich-text document), with formatting, `[[` links, note search, end-to-end encryption and the merge rules of task notes.
- **Links are task links.** `[Run](?task=<id>)` in Markdown; the link index is computed on the device (`note-links`), and Linked references already work on any task page.
- **Make tasks from check-list lines** is specified in the active change `note-checklist-tasks`.

## Goals / Non-Goals

**Goals:**
- No new entity or op field: a check-in note is the record's note.
- Every piece degrades to plain task behaviour while Habits is off, on older clients and in plain-text readers.

**Non-Goals:**
- Ratings, moods or structured fields per check-in.
- Editing check-in notes from the CLI beyond what task notes already allow.

## Decisions

### D1. A habit's record copies no note

The copy of `description` and the document is skipped when the series has `habit` true, on the device and on the server, in the same commit, with a shared vector case in the occurrence fixtures so both sides agree. Records written before keep their copy; the Check-ins list shows only records whose note differs from the series' note at the time, so old copies don't appear as check-ins.

- **Alternative: a separate `checkin_note` field.** Rejected: a second note field with its own editor, search and encryption path, for what the existing note already does.
- **Alternative: clear the copy after writing.** Rejected: two writes per check-in and a moment where the copy exists.

### D2. The line after a check-in

The check button's completion keeps focus on the row; a single-line editor (the rich-text editor in its one-line mode) opens below the row on the Habits screen and the task page, and as a popover under the chip in the Today strip. Enter writes the note in its own batch (so Undo can remove the note and keep the check-in); Escape or blur discards. On phones it opens with the keyboard only after a tap on "Add a note", so a check-in stays one tap.

### D3. Check-ins list

`web/src/app/habits/CheckIns.tsx` reads the lineage's records with a non-empty note from Dexie (the same per-series query the month grid already runs), sorted by `occurrence_date`, paged by 20. The thread and grid get a note mark from the same set.

### D4. Habit mark in links

The picker and the link renderer ask `habitStats` for a task with `habit` true while Habits is on; the stored Markdown is unchanged (`note-links` "Links stored by id"). No new link kind, so the server, exports and older clients are untouched.

### D5. Make habits reuses Make tasks

The command runs the `note-checklist-tasks` pipeline with a habit preset: quick-add parsing of each line, a calendar rule kept or `every day` added, `habit: true`, and the line rewritten to a link. Completion-relative lines fall back to a plain task and are named in the result toast.

### D6. Weekly review section

A section component in the Look back step, lazy with the review chunk, reading `habitStats` for the review's week. Interface budget: it is content inside the step's scroll region, not chrome.

## Data model impact

None: no new field. The server and client stop copying `description` into a habit's records.

## Size and memory

No dependency. Under 1 KB gzip on the first load (the check-in line trigger); the editor line, the Check-ins list and the review section load with their chunks.

## Risks / Trade-offs

- **[Older devices still copy the note into new records]** → A record written by an older client holds the habit's note until it updates; D1's filter keeps it out of Check-ins. Client and server ship together.
- **[The prompt after each check-in feels like work]** → It is one line, never required, closed by Escape or by moving on, and on phones only after a tap.

## Migration Plan

None. Existing records are not rewritten.
