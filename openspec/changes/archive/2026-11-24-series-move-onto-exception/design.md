# Design

## Context

`dueUndoable` and `doOnUndoable` (`web/src/lib/undoActions.ts`) write a series' `due` as for any task and show "Date changed". After the pull that echoes the op, `seriesUpkeep` (`web/src/lib/seriesRepair.ts`) runs `planRepair`, which finds the series due on an exception date and writes `moveDates` to the next free occurrence, shifting the start by the same number of days.

## Decisions

**D1. Refuse on the device, before writing.** `exceptionOn(series, date, rows)` (`recurring.ts`) answers the state of the lineage record on that date (the same exception set `planRepair` reads), or null. The two date actions check it for a series with a calendar rule whose date changes; when taken they write nothing and return the reason with `refused`. `setDueWithUndo` and `doOnWithUndo` show it as the action toast, replacing the last offer, so the refusal is never queued behind an older Undo. The panel's When, drags of a series row in Day, Week, Month and Plan, and Triage go through these two actions.

Alternative: honour the move by trashing or reopening the record. Rejected: it destroys a completion the user did not ask to change, and needs a design for Completed and `for N times`.

**D2. The repair stays.** It is still what makes concurrent devices converge; the refusal only stops this device from writing a value it would undo itself.

## Data model

None. No op field or entity changes; the check reads synced rows only and works offline.

## Interface budget

No new control, row or shortcut: one toast message instead of another.

## Size

A few hundred bytes in the entry chunk; no dependency.
