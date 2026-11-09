# Design

## Context

See proposal.md. Every one-task Actions menu except the selection bar's is rendered only while open (`useRowMenu`, `TaskListView`'s and `useBulkList`'s `.` menu), so state kept inside `BulkActionsMenu` dies when the menu closes. A pick closes the menu first, then the review plan resolves and sets state on an unmounted component.

## Decisions

### D1: The follow-up dialog lives in a module store with one host in the Shell

`bulkDialog` (a `createStore` in `BulkActions.tsx`) holds the review (title and plan) or the date step (ids and count). `BulkDialogHost` renders it and clears it on close; `ActionToasts` mounts the host next to `BulkConfirmHost`, which already does the same for the big-Trash confirm. A new request replaces an earlier one.

*Alternative considered:* keep each row menu mounted until its dialog closes. Rejected: three callers would each need the extra lifetime rule, and the next caller would forget it.

## Size

A few lines in modules already in the first load. No dependency.
