# Design

## Context

- **After `series-exceptions`**, an occurrence can be acted on alone and has at most one record (`occurrenceId`, `occurrence_date`); exceptions are derived from records; the occurrence panel has the scope control This occurrence · All occurrences.
- **Past occurrences are already preserved.** Done and skipped records are copies; editing the series never touches them. So "this and following" from the *current* occurrence is exactly an All-occurrences edit. A split is only needed from a later occurrence, where the series must keep producing the dates in between with the old values.
- **The rule grammar allows one end condition** (`until` or `for N times`), and `for N times` counts done records of the series (`recurring-tasks`, "End conditions").
- **Habits** derive their streak from the series' rule and records (`web/src/lib/habits.ts`), one series at a time.

## Goals / Non-Goals

**Goals:** change a series from a date on without touching earlier occurrences, keep history, streaks and counts across the change, converge offline, round-trip through CalDAV and the vault.

**Non-Goals:** merging pieces; linking a CalDAV client's own split; splitting completion-relative rules.

## Shared series model

The three series changes (`series-occurrences`, `series-exceptions`, `series-split`) share this model. Each design.md carries the same section so each change can be read, built and archived alone; a later change only adds the parts marked with its name. It names the model `recurring-tasks` already ships and extends it.

**M1. The series row is the task.** A recurring task is one row that holds the rule and stands on its *current occurrence*: its `due` (unchanged since `recurring-tasks`). Edits to the row are edits to the series. There is no separate "series definition" entity and no stored list of future dates.

**M2. An occurrence is a date of the series.** The *occurrence dates* of a series are the dates its rule produces from the current occurrence onward, within its end condition (`until`, `for N times`) and, after a split, within its piece (M7). An occurrence is identified by `(series id, occurrence date)`. Nothing is stored for an occurrence nobody acted on: it is drawn as a *projected occurrence*, computed on each device from the synced series row and its occurrence records, so every device draws the same ones (`series-occurrences`).

**M3. An occurrence record is the one row an occurrence can have.** When someone acts on one occurrence alone (completes it, skips it, moves it, edits it, or uses "This occurrence only"), the occurrence becomes a task row with:
- the id `occurrenceId(series id, occurrence date)`, the derivation completion records use today (`nameId("occurrence", "<series>:<date>")`), so devices acting on the same occurrence offline write the same row;
- `series_id` = the series, `recurrence` = null, the series' other fields copied as completion records copy them today;
- the additive field `occurrence_date` = the occurrence date it stands for (iCalendar `RECURRENCE-ID`), written once at creation and never changed by the app (`series-exceptions`).

A record is in one of four states: **open** (moved or edited, still to do: `completed_at` null), **done** (`completed_at` set), **skipped** (`completed_at` set and `skipped` true, as habits already write) or **trashed** (`deleted_at` set; only an older client or the Trash writes it, the app removes an occurrence by skipping it). A record written before `series-exceptions` has no `occurrence_date`; its occurrence date reads as its `due.date`, which is how `completedOccurrences` recognises it today. A "This occurrence only" copy made before `series-exceptions` (id `detachedId`) stays a standalone task and is not a record.

**M4. Exceptions are derived from the records, never stored on the series.** The *exception dates* of a series are the occurrence dates of its records, in any state. A projection is never drawn on an exception date, and the series never stands on one: moving the series to its next occurrence (completion, skip, "This occurrence only") goes to the first occurrence date after the current one that is not an exception. This is iCalendar's EXDATE, kept where it converges: two devices that each act on a different date offline each write their own record, and both exceptions survive the sync. A list field on the series (an `exdates` register) would lose one of them under last-writer-wins.

**M5. Repair when a device rolled before it saw a record.** A device that moved the series before it received another device's record can leave the series standing on an exception date. Any device that may edit the task and finds the series on an exception date writes the series' `due` (and the `deadline` and `start` that move with it) to the next non-exception occurrence date. The value is a pure function of the synced rows, so every device that repairs writes the same value and they converge; the server's completion path (REST, CalDAV, assistant) applies the same rule before it writes.

**M6. Counting.** `for N times` keeps the meaning `recurring-tasks` gave it: done records count, skipped records do not, so a skip extends the series by one. An open record is an occurrence still to come, so it uses up one of the remaining N while it is open. The series' remaining budget is `N − done records − open records`; the current occurrence and the projections together never exceed it. `until` bounds every date, records included.

**M7. A split makes pieces of one lineage (`series-split`).** "This and following" from an occurrence after the current one ends the series the day before (`until`) and starts a new series row, the *piece*, on that date, with the id `nameId("series-split", "<series>:<date>")` and the additive field `split_from` = `{series, date}`. The pieces of one lineage are the root series and every piece whose `split_from` leads back to it. Each piece produces occurrence dates from its own `split_from.date` until the day before the next piece's `split_from.date` (pieces ordered by that date), whatever its own `until` says; records of earlier pieces dated on or after a piece's first date are exceptions of that piece too. Habit history and the `for N times` count are taken over the lineage.

**M8. Who sees what.** Projections are read from local rows and work offline. A viewer of a shared project sees projections and records but cannot act on them. On an encrypted account the device copies and encrypts content into a record itself (a ciphertext is bound to its entity id, so it cannot be copied as is); the server, which cannot read the series' title, writes the records it creates without content fields, and every client shows a record's missing title and notes from its series until an unlocked device fills them in.

**M9. Outside the app.** CalDAV serves the series as one VTODO (DTSTART/DUE = current occurrence, RRULE), every exception date from the current occurrence on as `EXDATE`, and open records as their own VTODOs; a `RECURRENCE-ID` override or an `EXDATE` a client sends becomes the matching record (`series-exceptions`). The Markdown vault writes the series line at its current occurrence as today and each open record as an ordinary task line; done and skipped records stay out of the files. Calendar sync to a user's own calendar keeps writing the next occurrence only.

## Decisions

### D1. Split by ending the series and starting a piece

A split at date D (an occurrence date after the current one, of a calendar rule) writes in one batch:

1. the series' `recurrence` with its end replaced by `until D−1` (the pattern unchanged);
2. a new task, the piece, with id `nameId("series-split", "<series id>:<D>")`, the series' fields with the user's change applied, `split_from: {series: <series id>, date: D}`, `habit` copied, and `due` = the first occurrence date of the piece's rule on or after D that is not an exception of the lineage, with the series' time unless the change sets another; the piece's rule keeps the series' end condition (`for N times` is counted over the lineage, D4);
3. copies of the series' relative reminders onto the piece (ids derived from the piece id and the reminder id, as `series-exceptions` D7 does for records);
4. the change carried to the series' open records dated on or after D that still hold the old value (`series-exceptions` D6).

One Undo reverts the batch. Splitting needs edit permission on the series.

- **Alternative: one series with versioned rules** (a list of `{from, rule, fields}` on the row). Rejected: a whole-list register loses concurrent splits, every view would have to evaluate field versions, and CalDAV and the vault have no form for it.
- **Alternative: no link, just end and create.** Rejected: a habit's streak and a `for N times` count would restart, which is the complaint.
- **Alternative: a random id for the piece.** Rejected: two devices splitting the same series at the same date offline would make two pieces.

### D2. `split_from` is one whole value

`split_from` is one register holding `{series, date}`, validated as a task id in the same sharing scope and a `YYYY-MM-DD` date, set once at creation and refused as a change afterwards (like `occurrence_date`). One register, so a series and a date from two different writes can never mix, as `origin` and `location` are single registers. Not content.

### D3. Lineage bounds are derived, so concurrent splits converge

The pieces of a lineage are the root series and every task whose `split_from` chain leads to it. Ordered by `split_from.date` (the root first), each piece produces occurrences from its own start (the root: unbounded) to the day before the next piece's start, and never after its own `until`. Records of earlier pieces dated on or after a piece's start are exceptions of that piece (M7). So:

- two devices splitting at the same D write the same piece id; field last-writer-wins merges their changes;
- two devices splitting at D1 < D2 offline make two pieces; after sync the root runs to D1−1, the D1 piece to D2−1, the D2 piece from D2. Each piece shows the change made from its date. Nothing is duplicated and nothing is lost.

Because `until` is part of the rule text that CalDAV, the vault and older clients read, a device that may edit a piece whose stored `until` is later than its derived end (or missing) writes the derived `until` (a repair, a pure function of synced rows, as M5).

### D4. Counting across the lineage

`for N times` counts the done records of every piece of the lineage. The remaining budget of the lineage is `N − done − open` (records of any piece), shared in date order: the earlier pieces' remaining occurrences come first, the last piece gets what is left. So a 20-session series split after session 8 still totals 20, and skipping still extends the last piece by one.

### D5. Habits across the lineage

A habit's scheduled dates are, for each piece, the dates its rule produces in its range, plus every date with a record of any piece. The streak walks back across the split as if it were one series; the month grid shows the lineage. Two vectors are added to `habits.vectors.json` (a weekday change mid-month, a split on a day already done).

### D6. Where it lives in the interface

- The scope control gets a third option, **This and following**, between the two, shown when the panel is on a projection or a record of an occurrence after the current one, for a calendar rule and an editor. The first edit under it performs the split; the panel then shows the piece with All occurrences selected and a toast "Changed from Wednesday 14 October on · Undo".
- A projection's menu gains **Delete this and following** (`until D−1` on the series, no piece), with Undo.
- The panel of a piece shows "Continues <title> from 14 October" linking to the earlier piece; the earlier piece shows "Continues as <title> from 14 October" (computed from the pieces pointing at it).
- No new shortcut, no list chrome, no row property. Simple-list users never open a projection, so they see nothing new.

### D7. CalDAV and the vault

- CalDAV serves each piece as its own recurring VTODO (own UID, RRULE from its rule, DTSTART/DUE its current occurrence) with `RELATED-TO;RELTYPE=SIBLING:<previous piece UID>`, and the ended series with its `UNTIL`. A CalDAV client's own "this and future" edit (it rewrites the master's UNTIL and PUTs a new object) maps to a rule edit and a new task, without a lineage link.
- The vault writes the piece as its own line with `🔁 <rule>` and the old series' line with `until` in its rule; both read back as they are.
- Calendar sync keeps writing each live series' next occurrence.

### D8. API and CLI

- `POST /api/v1/tasks/{id}/split` with `{"from": "YYYY-MM-DD", "changes": {task fields}}` performs D1 through `ApplyStrict` and answers the piece. Policy `signedIn`; refused for read and agent tokens; not demo-denied. Errors: `400 not_an_occurrence` (not an occurrence date, the current occurrence or earlier, or a completion-relative rule), `400 not_recurring`, `400 invalid_input`, `403` for a viewer, `404`, `401`.
- `ot task split <id> --from <date> [--time] [--rule] [--title] …`.
- The occurrence list (`GET …/occurrences`) walks the lineage when asked for a range past the split, reporting each date's `series_id`.

## Risks / Trade-offs

- **Two offline splits at different dates** produce pieces whose changes do not combine (the later piece lacks the earlier piece's change). It is deterministic and visible; editing All occurrences on the later piece fixes it. Documented.
- **Lineage queries** walk `split_from` chains; chains are short (each needs a deliberate split). Bounded at 50 pieces per lineage; beyond that the oldest are treated as ended at their own `until`.
- **Older clients** see two independent series, correct on their own because of the `until` repair.

## Migration Plan

None. Existing series are lineages of one.

## Open Questions

- Should All occurrences on a piece offer to apply to earlier pieces too? Proposed: no; earlier pieces are mostly past, and the panel names the scope.
