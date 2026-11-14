# Design

## Context

`task-list-presentation` "Completed group in a project" keeps one device preference per project (`useShowCompletedPref`), offered only in the List layout, and the board shows open tasks only. Board columns are the project's sections, foldable per device (`sections-and-boards` "Fold a board column"), with drops and Shift+Left/Right moves that write `section_id`.

## Goals / Non-Goals

**Goals:** a project board can show its completed tasks in one column at the end, and a card can be completed or reopened by moving it.

**Non-Goals:** saved views and boards of filters; per-section completed cards; an order of the user's own inside the column; syncing the preference.

## Decisions

### D1. One preference for both layouts

The menu item reads and writes the same device preference as in the List layout, so a project shows its completed tasks in whichever layout is open. A second preference would make the same choice twice.

### D2. One Completed column, last, folded by default

Completed cards gather in one column after the last section (and before "Add a section"), not under each section: the board keeps its open work at a glance and the column is a single place to look. It is folded by default through the existing fold state (its key is the project's Completed column), so turning the preference on adds a strip, not a wide column. Most recently completed first, like the List group; no manual order.

### D3. Moving a card completes or reopens it

A drop on the column (or Shift+Right into it) writes `completed_at` exactly as the checkbox does, through the same completion path, so repeating tasks, the activity log, rules and Undo behave as for a tick. A drop of a completed card on a section column reopens it and sets its `section_id` in one batch. Reordering inside the column is refused (no drop line). A viewer cannot drop, as on any board.

### D4. Interface budget

No chrome is added above the first card: the column is one more column of the row, folded to a 48 px strip on a phone with its own snap point. No new shortcut: `z`, `h`/`l` and Shift+Left/Right keep their meanings. No new task property is shown.

## Data model

None: `completed_at` and `section_id` are existing fields; the preference and the fold state are device state.

## Size

A few hundred bytes in the board chunk, which loads lazily; the first load is unchanged.

## Risks

- A long Completed column on an old project. Mitigation: folded by default; the column virtualises like any other.
