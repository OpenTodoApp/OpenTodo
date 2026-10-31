# Design

## Context

- **All occurrences edits the series row** (M1 of the shared series model, `series-split` design): the row stands on its current occurrence. Since `series-exceptions` D6 the same batch carries title, priority, labels, project, section, estimate, time, assignee and location to the series' **open** records that still hold the series' previous value; done and skipped records and notes never change.
- **A split series is a lineage of pieces** (`series-split` M7, D3): earlier pieces end the day before the next one starts; each piece has its own records. All occurrences on a piece edits that piece only (the open question of `series-split`).
- **The carry is the app's.** The server's `PATCH /api/v1/tasks/{id}` writes the row it names and nothing else; the fixture's carry cases are `client_only`.

## Goals / Non-Goals

**Goals:** let a person fix a name, notes, labels, project or priority across the whole history of a series in one undoable step, without ever moving a past date or a completion; keep the panel as light as it is when there is no past.

**Non-Goals:** changing later pieces; rewriting past dates or completions; an API parameter.

## Decisions

### D1. A second choice, shown only when there is a past

Under the scope control, while the panel shows a series on All occurrences to an editor, a second segmented control "Apply to" offers **Only future ones** (selected) and **Also past ones**. It is shown only when the series has a past to affect: an earlier piece of its lineage, or a done or skipped record of the series or of an earlier piece (`hasPast`). Otherwise there is no question, so a series nobody completed yet, and every series on Only future ones, looks as before.

- It is the same `SegmentedControl` (WAI-ARIA radio group, arrow keys, 44 px on touch) as the scope, so it needs no new primitive and no story; under Also past ones a line says what changes ("Past occurrences take the new title, notes, labels, project and priority; their dates and completions stay.").
- The choice holds while the panel shows that series and resets to Only future ones when the panel leaves it, so a later edit never rewrites history by surprise.
- **Alternative: ask after each edit** (a dialog "Also change past ones?"). Rejected: a modal question on every keystroke-sized edit is heavy, breaks typing in the title and notes, and is worse on touch.
- **Alternative: a menu item "Apply to past occurrences" after the fact.** Rejected: it needs the previous value of every field after it was already changed, which the carry rule cannot recover.

### D2. What Also past ones writes

An edit of series S with patch P, with Also past ones chosen, writes in one batch:

1. S's own change and today's carry to S's open records (unchanged);
2. to each done or skipped record of S, the *past fields* of P (title, notes, labels, project with its section, priority) whose record value still equals S's previous value (the carry rule of `series-exceptions` D6: an occurrence changed on its own keeps its value). Notes compare on their Markdown text and write the note document with it;
3. to each earlier piece E of S's lineage: the past fields of P as they are (a piece is the series, so it takes the new value whatever it held); a new due time and zone on E's own due date; a new calendar rule with E's end kept (`until` = the earlier of E's own `until` and its derived end); a completion-relative rule, a cleared rule or a cleared date are not carried;
4. to E's open records: today's carry from E with that change; to E's done and skipped records: (2) against E's previous values.

Completion (`completed_at`, `completed_by`), `skipped`, `occurrence_date`, `due.date`, deadline and start of a record never change; time and rule never reach a record's past date. Later pieces are not written (Non-Goals). The planning is a pure function (`planPast` in `web/src/lib/seriesPast.ts`) pinned by client-only cases in `series.fixture.json`.

### D3. One batch, one Undo

When Also past ones adds writes to an edit, the whole batch goes through `applyBatch` and the panel shows "Changed past occurrences too · Undo"; one Undo restores the series and every past row. When it adds nothing (the edit is a date, or nothing past holds the old value), the edit is the ordinary one. Notes are saved by the note editor in pauses (`notes-save-cadence`); under Also past ones each save is followed at once by a batch that writes the new text to the past records and earlier pieces holding the series' previous text, without a toast (the editor's own Undo takes the series' note back and the next save carries it again).

### D4. Where the routing lives

`updateTask` and `setRecurrence` in `ops.ts` (first load) commit a series edit through `seriesPastActions.ts` (lazy) when the panel chose Also past ones for that series id; the choice is a module value set by the scope control, like the `redirectNextEdit` hook of `series-split`. Every other edit path is unchanged.

## Data model

No new field and no migration. The writes are ordinary task field ops; they converge per field by last-writer-wins like any edit. Offline: everything is planned from local rows and written locally first.

## E2EE

Title and notes are content fields. The device writes them for every row in plaintext to `mutateMany`, which encrypts each row's value bound to its own id, as it does for the series. The server is not involved.

## Interface budget

No new chrome above lists, no task property, no destination, no scroll region and no shortcut. The control appears only in the task panel, only on All occurrences and only when there is a past.

## API and CLI

`PATCH /api/v1/tasks/{id}` on a series changes that row only; it never carried values to records, so it has no All-occurrences semantics to extend and no `scope` parameter is added. A script changes a past record by `PATCH /api/v1/tasks/{record id}` or `PATCH /api/v1/tasks/{id}/occurrences/{date}` (open records). Documented in `docs/recurrence.md`.

## Size

No dependency. The control and the planning live in the lazy scope-control and series-planning chunks; `ops.ts` gains the routing: the first load measures 727.8 of its 728 KB budget (+0.2 KB).

## Risks / Trade-offs

- **A wide rename touches many rows** (a daily habit of two years: about 700 records). One batch of field ops, small each; the same cost as a bulk edit of those tasks. Accepted.
- **Two devices**, one renaming with Also past ones and one completing an occurrence offline: the new record copies the title its device had; per-field last-writer-wins applies as for any concurrent rename.

## Migration Plan

None.

## Open Questions

None.
