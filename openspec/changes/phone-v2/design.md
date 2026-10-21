# Design

## Context

See proposal.md for the motivation. Relevant current state, from the code and the specs:

- Below 768 px `Shell.tsx` renders `PhoneBar` (menu, optional back, title and subtitle, the tracking pill, the page actions) and `TabBar.tsx` (Today, Inbox, Upcoming, Search, More; the `AddButton` fixed at the bottom right, 56 px, 0.75 rem above the bar). Both hide while a sheet or the panel is open (app-shell "Phone navigation").
- `ListPageActions` in `task-list/ListChrome.tsx` renders Process the Inbox, a Select button on coarse pointers, the duration filter and Display mode; on a phone they wrap into a row under the bar. The desktop rule "Nothing between the header and the list" (`lean-chrome`'s text, archived within the hour) allows only the header and the quick add above the first item, and `budget.test.tsx` measures it on the desktop only.
- Selection on touch is the Select button in the list header (bulk-actions "Select with a pointer or on touch"); the row's long press is already used by `lib/dnd.ts` to start a drag after a hold without movement.
- The task panel below 768 px is a full-screen sheet with a sticky header, a Back action and a swipe down on the header (`taskDetailSheet.test.tsx`, app-shell "Panel width and expansion", web-app "Task detail panel"). `Dialog` has a `placement="sheet"` variant capped at 66 dvh (lean-chrome D3) and the sheet keyframes in `index.css` already fall back to a fade under reduced motion.
- The drawer is the desktop `Sidebar` in a fixed 16 rem column with a scrim (`sidebar-drawer-scroll`); its structure after `quiet-sidebar` and `sidebar-favourites` archive is primary destinations, More, Favourites, Projects, Labels, Filters, one footer row.
- The layout check (`scripts/e2e-layout.mjs`) runs every screen at 360, 390 and 768 px in Chromium and WebKit, light and dark, and accepts a language through `LANG`-style env (the synced preference is written before capturing). It runs in English today.
- Row anatomy, tones and the completion sequence are being rewritten by `rows-v2` and `motion-v2`; the sidebar tones by `sidebar-v2`. This change references them and does not restate them.

## Goals / Non-Goals

**Goals:**
- The same interface budget on a phone as on a desktop: two rows of chrome above the first task, no control covering content.
- The common phone actions (complete, schedule, open, select, add) each one gesture or one tap away, with a non-gesture path for every one of them.
- The phone drawer and the task sheet feel designed for a phone, not shrunk.
- Everything works offline exactly as before: every action is the same local op.

**Non-Goals:**
- Pull to refresh (see proposal; the sync dot and "Syncing…" already report the device's state).
- A tablet-specific layout, swipe on cards, blocks or sidebar rows, native haptics beyond `navigator.vibrate`, gesture customisation.
- Changing what quick add does, what the row shows, or how completion animates.

## Decisions

**D1. Phone list actions live in the bar and its overflow.** The phone bar already shows the title and the first two actions and has an overflow menu; a list's actions map onto it as: Process the Inbox keeps a visible slot in the Inbox; the duration filter takes a visible slot where a view has a filter key; Display mode becomes an overflow item; the Select button goes, replaced by "Select tasks" in the overflow and by the long press (D3); the Inbox's "N planned tasks without a project" line becomes the bar's subtitle (the bar supports one), opening the Filter view as before. The `TodayAskAction` stays where it is (a visible slot in Today when the assistant is available; the filter then goes to the overflow, since the budget is two). `budget.test.tsx` gains a phone case: at 390 px, Today, the Inbox and a project show nothing between the bar and the quick add. Alternative: keep the row but collapse it into a single "Tools" toggle. Rejected: still a row, and one that says nothing until tapped.

**D2. The add button stays; the list makes room for it.** Compared a docked quick-add bar above the tab bar (a field that reads "Add a task…" and expands into the sheet) with the floating button. The bar costs a permanent 48 px of every list at the height where the thumb rests, duplicates what the tab bar's row of controls already is, and a visible text field that is not focused invites a tap that then jumps the keyboard. The floating button is the convention of Todoist, TickTick and Material, sits in the thumb zone, and the sheet it opens already exists. Its one real fault, covering the last rows, is fixed by reserving the button's footprint under every list (bottom padding of the button's height plus its offset on the list scroller, only below 768 px) and by hiding it with the tab bar while scrolling down (D6). Rejected: a centred "magic plus" that moves with the finger (Things): delightful on a native app, a dragged fixed element on a mobile browser fights scrolling.

**D3. Swipe actions: direction lock, two thresholds, a cancel zone, a menu twin.** On a touch screen a row listens to pointer moves. The gesture takes the row only once the finger has moved 12 px horizontally with less than 8 px vertically (direction lock, so a vertical scroll never catches a row); until then the list scrolls. From there the row translates with the finger up to 120 px; the action's edge shows under it as a soft tint (success for complete, accent for schedule) with its icon and word, both from the catalogue. Reveal at 64 px names the action; commit at 96 px, or a release faster than 0.5 px per ms past 64 px, fires it; releasing under 32 px, or moving back under 32 px, cancels with a 120 ms return. A long press without movement still starts the drag of `lib/dnd.ts`; a swipe that began is never a drag. The same two actions are the first items of the row's menu ("Complete", "Schedule…"), so WCAG 2.2 2.5.7 holds without exception. No swipe: while any row is ticked (the row is a selection target), on a row the user cannot edit (viewer role, read-only project), in the Trash, on board cards and calendar blocks, while the inline editor is open, and with a fine pointer. Right swipe in Completed reopens. Alternative: a full swipe for complete and two buttons behind the left swipe (Schedule, More). Rejected: buttons behind a swipe need a second precise tap at 48 px targets and add state the row must leave; one action per direction with a sheet keeps the row stateless.

| Gesture value | Number | Reason |
| --- | --- | --- |
| Direction lock | 12 px horizontal, < 8 px vertical | one list scroll pixel never moves a row |
| Reveal | 64 px | the icon and word fit before the finger covers them |
| Commit | 96 px, or > 0.5 px/ms past 64 px | a deliberate pull, a flick allowed |
| Cancel | released or returned under 32 px | a hesitation costs nothing |
| Maximum translation | 120 px | the row never leaves the screen |
| Return | 120 ms, `ease-calm` | the ui duration token |

**D4. A one-time cue, not a persistent hint.** The first time a touch device shows a task list with at least one swipeable row, the first row peeks 40 px to the right for 400 ms and back, showing the complete edge, then a toast says "Swipe right to complete, left to schedule. Also in a task's menu." The cue runs once per device (a flag in local storage) and never under reduced motion, where only the toast shows. Alternative: a hint line under the first row. Rejected by the budget and by rule 5 of the interface guide (hints are not printed).

**D5. The task sheet.** Below 768 px the task opens as a bottom sheet: a 36 by 4 px drag handle on its own 20 px strip above the existing sticky header, the sheet at 90 dvh, the list dimmed behind it with the scrim token. A drag down on the handle or the header of more than 80 px, or a flick, closes it; so does a tap on the scrim, the Close control (the Back arrow becomes a Close with the same accessible name rule) and Escape. A drag down on the body closes it only when the body is scrolled to its top, so reading comments never dismisses by accident. The sheet keeps the address (`?task=<id>`), the header, the facets, the Add menu and the tabs, and `Expand` still opens `/task/<id>` as a page. With the keyboard up the focused field stays visible (web-app "Phone layout rules"). Entry and exit use the existing sheet keyframes and fall back to a fade under reduced motion. Alternative: keep the full-screen sheet. Rejected: it hides the list the user came from, so "which one did I open" is lost on every open, and Todoist's and Things' phone apps both keep the list in sight.

**D6. The tab bar minimises; the button follows.** While the content scroller moves down by more than 24 px the tab bar drops its labels and shrinks to 40 px of icons and the add button slides out below the bar; on scroll up, at the end of the scroller, or 600 ms after the scroll stops, both return. Under reduced motion neither moves (the bar stays full). Targets stay 48 px tall in the full bar (up from 44), with the safe-area inset below. The behaviour is a hook on the content scroller (`useScrollDirection`), not a scroll listener per view. Alternative: Apple's floating capsule bar inset from the edges. Rejected: on the web it costs 16 px of list width at 360 px and reads as an imitation.

**D7. The drawer.** The drawer stops being the desktop sidebar. It shows: the primary destinations the tab bar does not have (Calendar in Lists and Companion; Loop home, Next, Waiting and Review in Open Loops first, where the tab bar still holds Today, Inbox, Upcoming), the More group, Favourites, Projects, Labels and Filters as 48 px rows with the same counts rule as the sidebar, in one scroller; then a pinned footer with the account row (opening Settings, Help, Keyboard shortcuts, Sign out), the assistant launcher when available, the bell and the sync dot. The find field stays at the top of the scroller. The drawer is 85 vw at most and 20 rem at most, in the sidebar-v2 tones. Why: the five tab-bar destinations at the top of the drawer were the first thing a phone user saw after tapping More, and they are a tap away already. Alternative: a bottom sheet drawer. Rejected: a side drawer keeps the long project list scrolling in a tall column and matches the tab's name "More" with a motion from the edge.

**D8. Long press selects.** On a touch screen a long press on a row ticks it, shows the checkboxes on every row and the selection bar, and vibrates once where supported; "Select tasks" in the bar's overflow does the same without a tick. A long press on a row that is already ticked starts the drag of the selection (as `lib/dnd.ts` does today). Done stays in the selection bar. The list drag's long press and the selection's long press are the same hold: the hold ticks the row and, if the finger then moves, the drag starts carrying the selection; if it lifts, the selection stays. Alternative: keep the Select button in the overflow only. Rejected: a two-tap path to the first tick is why touch users never discover bulk actions.

**D9. 360 px in German and French.** The layout check gains two runs of the phone screens (`WIDTHS=360`, Chromium) with the synced language set to `de` and `fr`, the longest catalogs, failing on any sideways scroll or clipped control. English stays the run for every width and engine. Cost: about 2 minutes of CI.

**D10. Interface budget.** Chrome above the first item on a phone: the bar and the quick add, two rows (down from three). The tab bar and the add button are below the content and do not count, and the button never overlaps a row. Visible task properties: unchanged. Primary sidebar destinations: unchanged (the drawer shows fewer, never more). Scroll regions: the sheet is the panel's scroller, so a phone with the sheet open has the content and the sheet, two. Shortcuts: none added. Every new control is at least 48 px on touch.

**D11. Data and size.** No data model impact: every action is the existing op (complete, reopen, set `due`, `start`). No dependency. About 1.5 KB gzipped: the swipe handler (direction lock, thresholds, the tinted edge), the sheet handle, the scroll-direction hook. The sheet and the drawer reuse `Dialog` and the sidebar primitives.

**D12. Spec placement.** `lean-chrome` modifies "Nothing between the header and the list" and `calm-rows` modifies "One row anatomy" (both archive within the hour), so this change ADDS "Phone header actions" and "Swipe actions on rows" to `task-list-presentation` rather than editing those requirements; `quiet-sidebar` and `sidebar-favourites` modify "Sidebar structure", so the drawer is an ADDED "Phone drawer" requirement in `app-shell` and "Sidebar structure" is untouched (its "More open on a phone" scenario still holds: the drawer's scroller holds More and the groups). "Phone navigation", "Panel width and expansion" (app-shell), "Task detail panel", "Phone layout rules", "Overlays fit every screen" (web-app) and "Select with a pointer or on touch" (bulk-actions) are modified by no open change and are MODIFIED here with their full text. `ux-audit-three-widths` adds an audit tour; its measurements (M-rules for overflow and targets) are the ones this change makes pass on a phone.

## Risks / Trade-offs

- [Swipes are undiscoverable] → the one-time cue (D4), the menu twins (D3), the docs; the gesture never is the only path.
- [A swipe fires while scrolling] → the direction lock and the cancel zone; `rowSwipe.test.tsx` covers a diagonal move and a vertical move.
- [iOS Safari gestures] → the row uses pointer events with `touch-action: pan-y`, so the browser keeps vertical scrolling and the row gets horizontal moves; the left edge keeps 20 px free so the system back-swipe wins there; verified on a device in the smoke list.
- [The sheet's drag conflicts with its scroller] → a drag on the body closes only at scroll top (D5); the handle and header always close.
- [Hidden tab bar surprises] → it returns on any upward scroll, at the end, and after 600 ms; it never hides while a sheet is open; reduced motion keeps it put.
- [The drawer loses destinations in Open Loops first] → D7 lists the primary destinations the tab bar lacks first, so every primary destination is one tap from More.
- [Long press means two things] → one hold, two outcomes by whether the finger moves (D8), covered by a test with and without movement.

## Migration Plan

Presentation only; nothing to migrate. A device on an older app sees the previous phone layout. Rollback is a revert.

## Open Questions

- Whether the Schedule sheet offers "This evening" as a sixth choice; the row count of the sheet is kept at five until a user asks.
- The exact minimised height of the tab bar (40 px proposed) after a device check with large text settings.
