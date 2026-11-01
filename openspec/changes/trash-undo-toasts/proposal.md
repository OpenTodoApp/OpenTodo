# Trash undo and failure notices

## Why

Deleting a task from the command palette, Vim's `dd`, the Filter view or a saved view wrote a bare tombstone and skipped the Undo offer the main list shows. A bulk Trash offer also held Undo for only ten seconds, and the keyboard's Delete on a large ticked set trashed it without asking, so a big delete could not be undone once the shared window was replaced. Separately, a failed Focus time entry was logged only to the console: the timer kept running while the minutes were not recorded, and the person never learned about it.

## What Changes

- **A bulk Trash offer holds Undo for fifteen seconds** and carries a "Show Trash" control that opens the Trash view. Every other toast keeps the base windows.
- **Trashing more than twenty ticked tasks asks first**, through the shared confirmation dialog naming the count; smaller sets stay immediate. Both keyboard Delete paths use it.
- **Every way of deleting one task offers Undo**, including the command palette, Vim's `dd`, the Filter view and saved views, with the same subtree semantics as the row menu.
- **A failed Focus time entry is reported in a toast** saying whether the session is not tracked or its minutes may not be logged, while the timer keeps working.
- **The failure message never covers the Undo offer:** it waits while an offer shows, takes the toast region when it leaves, starts its window when first shown, moves clear of the focused element, resets its hover or focus hold with the message, and closes on Escape with focus returned.

## Out of scope

- Changing the five-second window of a single task's own actions.
- Any change to the Trash itself (restore, purge, retention) or to the Focus timer's phases.
- Server-side behavior: this is device interface state only.

## Roadmap

Extends ROADMAP "bulk-edit" and "design-system"; no new roadmap item.

## Capabilities

### Modified Capabilities

- `bulk-actions`: the Undo requirement gains the fifteen-second Trash window, the "Show Trash" control and the confirmation above twenty ticked tasks.
- `task-list-presentation`: the single-action Undo requirement covers every delete surface, not only the task's row menu.
- `design-system`: the toast primitive gains the longer named destructive window and the waiting, dismissing and focus behavior of a background failure message.
- `focus-mode`: a time entry that cannot be written is reported to the person instead of failing silently.
