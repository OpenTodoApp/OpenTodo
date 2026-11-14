# Design

## Context

From 768 px (`DESKTOP_HEADER_QUERY`) `PageHeader` draws its own row: the title, the lead line (`flex-1 basis-0 truncate`), then `PageActions` (the page's actions, its menu, Help). The row wraps. Below 768 px the shell's `PhoneBar` draws the same parts with the phone rules: Help in the menu (`helpInMenu`, `MenuTailContext`), a list's actions reduced to slots with the rest as menu items (`usePhoneListActions`), Statistics' period as a menu button, a task's path reduced to its nearest step. Every one of those rules asks the window (`useMediaQuery(DESKTOP_HEADER_QUERY)`).

Measured on the built app with the tour's seed, Chromium with touch, the header's width and its rows:

| Window | Header | Inbox | Task page | Statistics | Board |
| --- | --- | --- | --- | --- | --- |
| 768 px, sidebar open | 502 px | 1 row, lead "3 to …" | 2 rows, "Inbo ›" | 2 rows, 217 px | 3 rows, 149 px |
| 820 px, sidebar open | 554 px | 1 row | 2 rows | 2 rows, 169 px | 2 rows |
| 768 px, sidebar collapsed | 702 px | 1 row | 2 rows | 2 rows, 117 px | 2 rows |
| 1024 px, task in the panel | 342 px | 3 rows | (the panel) | | |
| 1280 px, mouse, task in the panel | 476 px | 1 row | (the panel) | | |

The last two rows decide the design: the narrowest header of the app is not on the narrowest window, and a 476 px header with a mouse holds everything because its controls are 32 px, not 44.

## Goals / Non-Goals

**Goals:** one row in the header a tablet leaves beside the sidebar; nothing cut short of meaning; every moved action in the menu, by tap and by keyboard; one mechanism, the phone's rules, not a second set; nothing different at 1280 px with a mouse.

**Non-Goals:** a header that collapses action by action to whatever fits (a priority list per page); the phone bar; the calendar's and the Routines overview's actions; headers of 40 rem or more.

## Decisions

### D1. The header's measured width, not a window breakpoint and not a container query

`useNarrow` (`web/src/ui/useHeaderRoom.ts`) observes one element with a `ResizeObserver` and answers whether it is narrower than the limit: 40 rem on a coarse pointer, 28 rem on a fine one (`useFinePointer`), in rem so a larger text size counts. `PageHeader` observes its own `<header>`. A page that chooses what it hands to the header (a list, the task page, Statistics) observes its root, which has the header's width (the header spans the page's padding). The value flips only when the limit is crossed, in a layout effect, so the first paint is already right.

Alternatives:

- **A window breakpoint at 1024 px.** Rejected: it is wrong in both directions. A 768 px window with the sidebar collapsed has a 702 px header that holds its actions; a 1024 px window with a task in the panel has a 342 px one.
- **A CSS container query.** It can hide and show, but what moves here is content between two React trees (an action becomes a menu item; the period radio group becomes a menu), so the decision has to be in script. `container-type` on the scrolling content column would also make it the containing block of fixed descendants.
- **Measure whether the actions overflow, and move them one by one.** The honest "what does not fit" rule, but each page would need an order of sacrifice and a measuring pass that hides, re-measures and can oscillate. The phone's rule set is known to fit 360 px, is already tested and documented, and gives a tablet user the same places as their phone.
- **A store fed by the shell with the content column's width.** One observer instead of several, but wrong for a header inside the panel or a story, and pages outside the shell would need a default.

The pointer in the limit is the only part that is not width: 44 px against 32 px controls is a ratio of 11 to 8, and 40 rem × 8 / 11 is 29 rem. 28 rem keeps the 1280 px list beside the panel (476 px) as it is.

### D2. In a narrow header the title gives way before the actions wrap

The row keeps `flex-wrap`. In a narrow compact header the title gets `flex: 999 1 6rem; max-width: max-content`: for line breaking it counts as 6 rem at most (or its text, if shorter), so the actions stay on the row while 6 rem of title fit; then it grows to its whole text before the lead line gets anything. Actions that do not fit even then (the calendar's range and view switch) wrap under the title as they do today, so no page can end up with a crushed title. A plain title is `TruncatedText` and a project's name is a button named by its content, so a cut title stays reachable.

### D3. The lead line is whole or hidden, by measure

`useCut` compares the lead's `scrollWidth` with its `clientWidth` after every render and on resize. A cut lead gets `invisible`: it keeps its box (flex basis 0, the row's leftover), so the measure does not change when it hides and cannot oscillate; it leaves the accessibility tree and the Tab order. This holds at every width: a lead that fitted is untouched. A lead with a button keeps `min-w-fit` as before (the calendar's Re-plan exists nowhere else). The project header passes its plain `phoneMeta` text as the lead in a narrow header, so it can hide: its buttons (members, Public) open Share, which is in the menu.

### D4. Lists reuse `usePhoneListActions`

The hook takes the list's root and returns `room`, the ref to put on it; `phone` is now "below 768 px, or a narrow column". Everything downstream already switches on `phone`: `ListHeader` and `ProjectHeader` pass the slots as `actions` and the items to the Inbox, label, project or overflow menu; the empty project note's line is a menu item; the quick add's hint is the short one. `barActions` is ignored by a header with its own row, so the slots land in the row.

### D5. The task page: the nearest step as a back step

`TaskPath` already has `nearestOnly` for the phone bar, which has its own Back button. In a narrow header's own row there is no Back button, so `back` draws the step as one button: an arrow, then the name in a span measured by `useCut`. While the name is cut the span is `invisible` and the button gets the name as `aria-label`; otherwise it is named by its content. The task's title crumb is dropped, as on the phone: it is the `h1` under the header.

### D6. Statistics: the chooser and the export move into the row

With its own row and a narrow column, `StatsView` passes the `PeriodChooser` (as the menu button, `narrow`) as `actions` and Export time entries as `overflow`, and renders no second row. The period button stays the first focusable control after the title. Below 768 px and from 40 rem nothing changes.

### D7. A routine's name

D2 lets "Routines › name" shrink, and the name was a bare truncated span, so the tour would report it. It is now `TruncatedText`, as a view's name is since `phone-stats-period`; "Routines" does not shrink.

### Data model, size

No data model impact: no field, op, route or setting. No dependency. The first load grows by one small module (two hooks): entry chunk 146.9 KB gzip of 147 KB, entry with static imports 707.9 KB of 708 KB, both inside the budget but at its edge.

### Interface budget

Rows of chrome above a list's first item, counted as the tour does, at 768 px with the sidebar open: the board 4 → 3 (the project's allowance), the columns project 5 → 4 (the empty note's line joined the menu; Sub-projects and the Columns button remain, as at 1280 px). No new destination, scroll region, task property or shortcut.

## Risks / Trade-offs

- On a tablet beside the sidebar Help, Select, Filter, Layout and Share are one tap further. They are where the phone has them.
- A project's progress, members and Public badge are not shown when the name needs the room. Share in the menu shows them.
- A limit, however placed, has an edge: a 640 px header changes its actions when the sidebar is dragged one step wider. The row itself does not jump, both sides being one row.
- With a mouse between 28 and 40 rem (a 768 px window with a mouse, sidebar open) the header is as before, wrapped rows included. The issue is the tablet; lowering the mouse limit's distance is a one-line change.

## Open Questions

- The task page at 702 px (768 px, sidebar collapsed) and 758 px (1024 px) still takes two or three rows when the path is deep, and cuts its crumbs. The back step would fix it at any width, but that changes 1024 px, which this change leaves alone.
- A list beside the docked panel at 1024 px with touch (342 px) is two rows, down from three: the sidebar toggle, the title and three 44 px controls need 299 px of 278.
- The calendar (two rows, was three) and the Routines overview (three rows) need their own reduction.
