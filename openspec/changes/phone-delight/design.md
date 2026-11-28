# Design

## Context

The phone UI (`web/src/phone/`) draws every screen below 768 px; `phone-modern-look` gave it the floating tab bar, the Today tiles, the week strip and the light at the top. Each item here reuses a mechanism that exists: completion motion and haptics (`motion.ts`, `lib/haptics.ts`), the phone push transition (`phone/transition.ts`), the actions sheet (`BulkActionsMenu`), the drag's `data-task-drop` targets (`lib/dnd.ts`, `dropUndoable` "day:"), quick add's sheet bar and line date (`SheetBar.tsx`, `useLineDate`), the drawer's counts (`lib/sidebarCounts.ts`) and the empty-state pattern.

## Goals / Non-Goals

Goals: the ten ideas the owner approved, each small, each presentation over existing data and actions, none on the desktop. Non-goals: a new gesture library, new ops, new preferences.

## Decisions

### D1. The day closes on Today's own numbers

The ring's arc gets a CSS transition on `stroke-dasharray` (none under reduced motion). The words stay the briefing's ("All done for today."); the empty state is not changed. The success haptic for the last completion plays from Today's phone screen when the open count goes from at least one to zero while the screen is mounted (a ref of the previous count), so a fresh open of an empty Today plays nothing. Each completion's own feedback is unchanged.

### D2. One shared name for the title

`openTaskFromList(id)` puts `view-transition-name: phone-task-title` on the tapped row's `[data-row-title]` before the transition captures the old screen; the task page's `[data-task-title]` carries the name through a CSS rule while `html[data-phone-nav]` is set. On a pop the rule names the page's title in the old capture, and `leaveScreen` names the row of the task that was open once the list is back, before the new capture. The names are removed when the transition finishes. Only one element carries the name in each capture. Without view transitions, or with reduced motion, nothing changes (the existing gate).

### D3. Pull to sync stays as it is

Pull to sync exists (`pull-to-sync`, `app/PullToSync.tsx`, mounted by the Shell on a coarse pointer, and the iOS shell's own pull handed over with `takeOverPull`). A second one on the phone list drew two indicators; this change does not add one.

### D4. The actions sheet heads with the task

`BulkActionsMenu` takes an optional `head` node; the phone list passes, for one task, a read-only `PhoneRow` preview (no buttons, `inert`) built with `rowOf`. The sheet keeps its title for assistive technology ("1 task" becomes the task's title as the dialog's name).

### D5. The week strip's days are drop targets

Each day pill carries `data-task-drop="day:<date>"`; `dropUndoable` already moves tasks to a day for Upcoming's groups (upcoming-drag). Pills without tasks stay disabled for taps but take drops; `data-drop-active` rings the pill. No change to the drag.

### D6. Date chips are the line's quick choices

While the line has no `due` chip, the sheet bar shows Today, Tomorrow and Next week from `quickChoices('due', …)` (so their dates follow the week's start like the picker's) as dashed chips before the project and label ones; a tap calls `lineDate.pick({ date })`, which writes the date's words into the line as the picker does. Like the other dashed chips they are hidden from assistive technology: the When tool is their named equivalent.

### D7. Tab counts use the drawer's functions

A `useTabCounts()` hook computes `sidebarCounts` over the live tasks once writes settle (`useSettledValue`), as `AppBadgeSync` does, and the tab bar shows Inbox and Today counts as a small badge on the icon (hidden when zero, "99+" above 99). The count joins the tab's accessible name ("Today, 4 tasks"). A hold of 450 ms on Today opens the first open task due today at a time still ahead (else Today), with a tick; on Inbox it opens the Inbox and its quick add sheet. The click that follows a hold is swallowed, and the system's long-press menu is prevented on the tabs. A tap is unchanged.

### D8. Empty lists centre on a phone

The phone list wraps the empty state in a flex box that fills the free height between the header and the tab bar, and scales the illustration to 160 px. Words and actions are unchanged.

### D9. The light follows the screen

`.phone-glow` reads `--glow-a` and `--glow-b` (accent and info by default); a project screen sets `--glow-a` to the project's colour. On Today the phone header's title gains a 20 px ring and "3/10" when the bar takes the title (the header already knows when the large title is gone); the screen hands the progress to its header through a context (`BarProgressContext`), so the header stays generic.

### D10. Today's cards as a bento

Three equal tiles at 390 px give each about 110 px: Up next's title wraps into a third of the width and the labels sit beside figures. The cards follow what makes the summary cards of Apple Fitness and Health, iOS widgets and shadcn/ui's stat cards read at a glance: one card leads, a figure is the largest thing on its card, its name is a small-capitals line above it, and colour carries meaning (accent for what is next, danger for late). So: a two-column grid; Up next spans both columns with its time in the display size, "in 1h 2m" under it (`formatMinutes`, one new string "in {time}") and its title on up to two lines beside it; Done today and Late share the next row, each with its name above, its figure in the display size, the ring (now with an accent-to-info gradient) or the danger icon beside it; either spans the row when the other is absent, and Done today then says how many are left. A card is tinted with a soft gradient of its colour. The ring and the icon step down from 56 to 48 px under 380 px so 360 px keeps every figure whole.

## Risks / Trade-offs

- Shared-element names must be unique per capture; a stale name would make a transition skip. Names are set and cleared in one place (D2) and the transition tests cover both directions.
- Counting on every settled write costs as the drawer's count does; measured by the existing perf budgets (phone list switch, completion).
