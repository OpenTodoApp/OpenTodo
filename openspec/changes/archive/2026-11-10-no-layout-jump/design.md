# Design

## D1: The selection bar floats over the bottom

The bar was sticky in the list's flow, above the rows: appearing, it pushed them down by its height. It is now a fixed dock over the bottom of the app frame, so it takes no room in the flow.

- Width and place: the dock follows the frame's left edge and width (measured, and followed with a `ResizeObserver` as the window or the sidebar resizes); the bar is centred in it, at most 40 rem wide.
- On a phone it stands 0.75 rem above the tab bar, where the add button stands: its bottom is the toast's lift (`--toast-lift`, which `usePhoneChrome` sets to the tab bar plus the add button's place) less 3.5 rem. While a bar shows, the add button is hidden and out of the tab order by one CSS rule (`[data-app-frame]:has([data-selection-dock]) ~ [data-add-button]`), which keeps the shell and the first load free of selection state. The toast's phone lift already clears that place.
- From 768 px it stands 1.25 rem above the frame's bottom; while it shows, it sets `--selection-lift` to 3.75 rem, which every toast region adds to its bottom, so a toast in the corner (an undo offer, a reminder) never covers Actions or Clear.
- The content keeps 5 rem of room under its last row while a bar shows (a CSS rule on `#content:has([data-selection-dock])`), and `revealRow` treats the bar's top as the bottom edge, so the keyboard cursor stays above it. The bar is fixed, so the focus clearance (`focusClearance.ts`) already scrolls a focused element out from under it.

Adding room at the end of the content never moves what is above it, so the rows stay where they were.

## D2: Notices that arrive late are toasts

`app-shell` "Notices are toasts" already says a removed start view and a refused change are toasts that never push content; the shell still drew them as banners above the content. They now go through the action toast (`showActionToast`), which the shell hosts once; each new refusal (the sync status merges them) shows the toast again with the count so far. The update prompt and the refused-update notice float in the bottom corner (`ToastRegion`, start side), styled as warning toasts; their text, controls and `data-update-banner` marks are unchanged.

## D3: The routines card under the Inbox's tasks

The card loads after the list (its code is a lazy chunk, and whether the account has routines and what ran are read after the first paint), so above the first task it always arrived late. Under the last task it moves nothing. The two-second "seen" rule still counts time on screen.

## D4: The rituals

`offersQuickAdd` is false for Focus and for Close the day (`/review/close`); the rest of the review keeps the button. On a phone, Close the day's Reopen moved from the header (whose in-page action row draws its own divider under the shell bar's) into the page.

## Audit

Checked for the same jump: the selection bar (fixed, D1); the shell's start-view and refused-change notices (toasts, D2); the update and refused-update prompts (toasts, D2); the routines card (D3); the sync status (in the sidebar, never above a list); Today's briefing ("2 tasks are late"; computed from the same local rows as the list, in the header, at first paint); the Today agenda (cached events, shown with the list); the demo banner (above the shell from the first paint, its text swapped in place); a project's note, links and sub-projects (local rows, the list waits for the project's membership before its first paint).

## Interface budget

No new chrome: the bar left the space above the list, so the rows above the first task are one fewer while tasks are ticked. No new property, destination, scroll region or shortcut.

## Data model and size

No new field, route or string. Container image unchanged; the web first load changes by a few hundred bytes.
