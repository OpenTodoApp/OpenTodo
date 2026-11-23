# Suggest ticked items in the phone's add sheet

## Why

`reusable-suggest` (#1839) left the phone's add sheet out: on a phone, the floating add button is the usual way to add, so in a reusable list the few-letters way back to a ticked item was missing where it is used most.

## What Changes

- The add sheet opened in a reusable list suggests its ticked items while typing, exactly as the list's own quick add does: the same items, order, keys and reopen. Opened in any other view, it suggests nothing.
- In the sheet, a suggestion list (ticked items, and the `#`, `@`, `~` and priority lists) sits under the line in the sheet's flow, so the sheet grows to show it instead of cutting it off over its tool row.
- Esc while a suggestion list is open closes the list and keeps the sheet open: the field claims Escape (`data-claims-escape`) and the overlay stack lets it through.

No new string, field, route, op or environment variable.

## Impact

- Web: `web/src/app/QuickAddSheet.tsx` passes the list to its quick add; `QuickAdd.tsx` places the list in the sheet's flow; `TokenSuggest.tsx`, `quickadd/TickedSuggest.tsx` and `ui/overlay/stack.ts` (Escape).
- Docs: `docs/reusable-lists.md`; `changelog.d/Added/reusable-suggest-sheet.md`.
