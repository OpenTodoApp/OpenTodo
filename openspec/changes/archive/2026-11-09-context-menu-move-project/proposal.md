# Proposal

## Why

Issue #839 (v0.20.0, desktop Chrome): right-click a task, choose **Move to project…**, pick another project. The menu closes, and nothing else happens: the task stays where it was.

A move from the Actions menu is reviewed before it is applied (bulk-edit D6): the pick asks `BulkActionsMenu` (`web/src/app/bulk/BulkActions.tsx`) to show the review dialog, and the dialog is component state of that menu. The right-click menu (`web/src/app/bulk/useRowMenu.tsx`), the row's More button and `.` with nothing ticked render the menu only while it is open, so closing the menu after the pick unmounts it together with the review it was about to show. The plan is prepared, the dialog never appears, and no op is written. Only the selection bar's menu, which stays mounted while tasks are ticked, showed the review. "Pick a date…" in the same menus loses its date dialog the same way.

## What Changes

- The follow-up dialog of a task Actions menu (the move or assign review, the "Pick a date…" date) is held in a module store and rendered by one host the Shell mounts with its other action feedback, so it outlives the menu that asked for it.
- Nothing else: the review, its Apply and Undo, and the writes (`applyBatch`, through ops) are unchanged.

Fixes #839

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `action-menus`: new requirement "A menu step outlives the menu that opened it", with the scenario of #839.

## Impact

- **Code:** `web/src/app/bulk/BulkActions.tsx` (the store and `BulkDialogHost`; the unused `onApplied` prop of `BulkActionsMenu` goes), `web/src/app/ActionToasts.tsx` (mounts the host).
- **Data model, ops, sync, API, server:** none.
- **Size:** a few lines in modules already in the first load; no dependency.
