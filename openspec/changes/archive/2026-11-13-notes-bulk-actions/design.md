# Design

## Context

Task lists have bulk actions (`bulk-actions`): a cursor distinct from the ticked set, `x`/Space, range selection, a grip on touch, a selection bar with the count, an Actions menu on `.`, actions written as one batch with one Undo, moves into another sharing scope reviewed first and written as copy-and-tombstone. The Notes page (`notes-page` as `notes-space` leaves it) lists one-line rows of three kinds; only standalone notes have their own menu (Pin, Turn into task, Move to Trash), while a task note opens its task and a project note its project.

## Goals / Non-Goals

Goals: the same selection and Undo as task lists; the actions people need when tidying notes; one batch per action; no new keys to learn.

Non-goals: bulk edits of text, bulk actions on task or project notes, selection in Graph mode.

## Decisions

### D1. Only standalone notes are tickable

A task note's project and labels are its task's; moving or labelling it from the Notes page would change a task from a page about notes, and pinning or trashing it has no meaning (task notes are not pinnable; trashing would trash the task). Ticking skips those rows like read-only tasks: `x` on such a row does nothing, a range passes over them, and `Ctrl+A` ticks only standalone notes the user may write. Notes in a shared project where the user is a viewer are skipped the same way.

Alternatives considered:
- **Tick every kind, disable actions per kind.** Rejected: most actions would be disabled for most mixed selections, and the reasons would need helper text.

### D2. Reuse the task selection model

The selection hook of the task lists is generalised over the row id and a `tickable(row)` predicate; the Notes page passes its rows and D1's predicate. The bar, the checkbox slot (the 20 px slot where the kind icon sits, so the row's grid does not move), the grip, the haptic pulse and the Escape order are the same components. "Select notes" is an item of the header's overflow menu (added by `notes-sort`; created here if absent).

### D3. The actions

| Action | Key | Writes |
| --- | --- | --- |
| Move to project | `m` | `project_id` per note; a note whose new project is in another sharing scope is copied there and the original tombstoned, as for a single note (`standalone-notes` "Notes follow their project"); the review of `bulk-actions` "Moves and assignments are reviewed first" is shown only when at least one note changes scope |
| Labels | `Shift+L` | each note's `labels` read just before writing and written whole, with the all-or-add rule of `bulk-actions` "Labels on several tasks" |
| Pin / Unpin | `p` | the user's favourites list once, adding or removing every ticked note (Unpin when all are pinned, else Pin) |
| Turn into tasks | (menu) | per note, the same batch as the single "Turn into task", all in one batch |
| Move to Trash | Delete | `deleted_at` per note; more than twenty asks the shared confirmation first |

`m` and `p` are registered in the Notes page scope; the registry test confirms no conflict (`m` is used only in Inbox triage, `p` already pins the focused note and now acts on the ticked notes when any are ticked). The menu shows each key.

### D4. One batch, one Undo

Each action is one `mutateMany` batch, applied locally first and queued offline. Undo restores the previous values as one new batch, with the rules of `bulk-actions` "Undo a bulk action in one step" (a field changed since is skipped and named; a cross-scope move's copies go to the Trash and originals come back). Turn into tasks undo removes the tasks and restores the notes. Concurrent edits converge per note and field by last-writer-wins, the document by merging, as for single edits.

## Data model

None. Every write uses existing note fields and the favourites preference.

## Size and memory

The menu, the review list and the batch writers load with the Notes chunk (under 2 KB gzip expected); the selection components are already in the entry chunk. No server change.

## Interface budget

The selection bar replaces nothing permanent: it appears only while notes are ticked, in the place the task lists put it, so the chrome above the first row stays the header and the search field. No new scroll region. New shortcuts `m` and `Shift+L` in the Notes page scope, and `p`, `.`, `x`, Space and Delete with their task-list meaning, registered without a conflict.

## Risks / Trade-offs

- People may expect to tick task notes; the row simply does not tick, and the docs say so once.
- A large Turn into tasks creates many tasks at once; it shows the count in the toast and is undone in one step.
