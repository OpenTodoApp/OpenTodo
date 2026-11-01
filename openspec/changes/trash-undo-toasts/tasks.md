## 1. Trash offer and confirmation

- [x] 1.1 BulkActions: `TRASH_TOAST_MS = 15_000` for trash offers, other actions keep the base window
- [x] 1.2 Trash offers gain a "Show Trash" control navigating to the Trash view
- [x] 1.3 `trashTicked` asks the shared confirmation above `BULK_TRASH_CONFIRM_FROM` (20) and trashes at once below it; both keyboard Delete paths route through it
- [x] 1.4 Tests: small set immediate, large set asks with the count and trashes on confirm, fifteen-second offer with the second control

## 2. Every single-task delete offers Undo

- [x] 2.1 The command palette, Vim's `dd`, the Filter view and saved views call `deleteWithUndo`
- [x] 2.2 Tests assert the Undo offer and label on those paths

## 3. Focus time-entry failures

- [x] 3.1 `ToastActionHost` and the action-toast channel; the Shell mounts it
- [x] 3.2 A failed start or stop reports its consequence through `showActionToast`; the session keeps working
- [x] 3.3 The failure message waits for the Undo offer, starts its window when first shown and pauses on hover or focus
- [x] 3.4 The failure message moves clear of the focused element and its hold resets with the message
- [x] 3.5 Escape dismisses the failure message and returns focus
- [x] 3.6 Tests cover each behavior

## 4. Strings and checks

- [x] 4.1 New visible strings in all six catalogs, appended in each file's own order
- [x] 4.2 `make i18n-check`, web lint and typecheck, `make docs-check`, `make ui-lint`, the web suite
