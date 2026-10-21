# Proposal

## Why

On a phone OpenTodo is the desktop app shrunk: Today shows three rows of chrome before the first task (the bar, a "Select, filter, display" row the desktop budget forbids, the quick add), the floating add button covers the metadata of the last visible rows, the drawer is the desktop sidebar verbatim with the five tab-bar destinations repeated at its top, rows answer only to taps, and the task opens as a full-screen sheet that hides the list. The October 2026 interface review found these the biggest gaps between OpenTodo and the apps people switch from (Todoist, Things, TickTick), and every one of them is presentation: no data, no op, no route.

## What Changes

- **Two rows of chrome on a phone, like the desktop.** The Select button, the duration filter and the Display mode action leave the row under the phone bar: the filter takes one of the bar's two action slots when the view has one, Display mode and "Select tasks" go to the bar's overflow menu, Process the Inbox keeps its slot, and the Inbox's "planned tasks without a project" line becomes the bar's subtitle. Selection on touch starts with a long press on a row (ticks it and shows the checkboxes) or with "Select tasks" in the overflow; Done stays in the selection bar.
- **The add button never covers content.** The floating add button stays, bottom right above the tab bar, and every list reserves room under its last row for it; while the list scrolls down it hides with the tab bar and returns on scroll up or when scrolling stops.
- **Swipe actions on rows.** On a touch screen a row swiped right past its threshold completes the task (reopens it in Completed) with the completion sequence of `motion-v2`; swiped left it opens a Schedule sheet (Today, Tomorrow, Next week, Pick a day, Someday). The action shows as a tinted edge with an icon and a word while the finger moves, a short pull cancels, and every swipe action is also in the row's menu, so nothing needs a gesture. A one-time cue on the first touch-screen list says what swiping does. No swipe while a selection is active, on read-only rows, in the Trash or on board cards.
- **The task opens as a bottom sheet** with a drag handle, at most 90 percent of the viewport, the list dimmed behind it; a drag down on the handle or header, a tap on the scrim, Close and Escape all close it. The address, the sticky header, the facets and the tabs stay as they are.
- **A phone-first drawer.** The drawer no longer repeats the tab bar: it shows the primary destinations the tab bar lacks (Calendar; in Open Loops first mode Loop home, Next, Waiting and Review), the More group, then Favourites, Projects, Labels and Filters as 48 px rows, and a footer with the account (Settings, Help, Sign out), the assistant, notifications and the sync status, in the sidebar tones of `sidebar-v2`.
- **The tab bar** keeps Today, Inbox, Upcoming, Search and More, 48 px targets above the safe area, and minimises to its icons while the list scrolls down, returning on scroll up, only when reduced motion is off.
- **360 px in every language.** No screen scrolls sideways at 360 px in German and French, the two longest catalogs, checked by the layout check.
- Haptic feedback on completion and on a committed swipe comes from `motion-v2` and is only referenced here.

Out of scope: pull to refresh (the local copy is the source of truth and sync is live over the realtime channel, so a pull would refresh nothing; a sync indicator already says when the device is behind); a tablet layout between 768 and 1023 px; swipe gestures on board cards, calendar blocks and sidebar rows; a bottom quick-add bar (considered in design D2); native shells and widgets (`native-shells`); the row anatomy and tones (`rows-v2`), the completion and reflow animations (`motion-v2`), the sidebar tones (`sidebar-v2`).

ROADMAP: advances the design refresh ("Next: Design refresh") on the phone, where the October 2026 review found it furthest behind. No new environment variable, no op-log change, no new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Phone navigation" (tab bar minimises on scroll, the add button never covers content, the drawer's contents), "Panel width and expansion" (bottom sheet instead of a full-screen sheet below 768 px); ADDED "Phone drawer".
- `web-app`: "Phone layout rules" (48 px targets, no sideways scroll at 360 px in every language, a focused field stays visible with the keyboard up), "Overlays fit every screen" (sheets have a drag handle and a height cap), "Task detail panel" (the bottom sheet on a phone).
- `task-list-presentation`: ADDED "Swipe actions on rows", ADDED "Phone header actions" (what the phone bar shows for a list and what goes to its overflow; the desktop rule "Nothing between the header and the list" now holds at every width).
- `bulk-actions`: "Select with a pointer or on touch" (long press and the overflow item replace the Select button).

## Impact

- Web only: `web/src/app/Shell.tsx` (phone bar, drawer, scrim), `TabBar.tsx` (minimise on scroll, add button offset), `task-list/ListChrome.tsx` (phone actions into the bar and its overflow), `TaskRow.tsx` plus a new `rowSwipe.ts` beside `lib/dnd.ts` (direction lock, thresholds, cancel), `task-detail/TaskDetail.tsx` (sheet with handle), `Sidebar.tsx` (phone drawer layout), `selection.ts` and `bulk/` (long-press entry), `QuickAddSheet.tsx` (unchanged behaviour, new anchor).
- Tests: `budget.test.tsx` (phone chrome), `taskDetailSheet.test.tsx` (sheet), new `rowSwipe.test.tsx`, `sidebar.test.tsx` (drawer), `layout-check` runs in German and French at 360 px.
- Stories: a `Screens/Phone` group (Today with the add button, a row mid-swipe, the task sheet, the drawer) at 375 px in both themes, baselines from CI's ui-check artifact.
- Docs: `docs/install-phone.md` (using the app on a phone), `docs/work-from-the-list.md` (swipe actions), `docs/bulk-actions.md` (long press), `docs/interface-guide.md` (a phone section), `docs/getting-started.md` (the add button and the drawer).
- Bundle: about 1.5 KB gzipped for the swipe handler and the sheet handle; no dependency.
