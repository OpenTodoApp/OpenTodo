# Design

## Context

`phone-lists` made the two parts every list is built from drawable by the phone UI: `PageHeader` reads `PageHeaderDrawContext`, and the list's row renderer takes the row component. Only the phone list provides them. The other screens of the shell render `PageHeader` (it hands its title and actions to the shell's phone bar below 768 px) and, where they list tasks, `TaskRow` directly: `FilterView`, `SavedViewView`, `DashboardView`, `MethodListView` (Next, Waiting), `method/loop/rows`, the reviews, the plan.

A prototype put the shell's screens inside a provider of `PageHeaderDrawContext` and walked twenty of them at 390 px with the switch on: all twenty drew the phone header, none threw, none scrolled sideways. What it showed still to do: the title's place differs with the page's own padding, a nested page needs Back, and the rows of Next were still the desktop row.

## Goals / Non-Goals

**Goals**

- One bar, one title, one row and one canvas on every screen of the shell with the switch on.
- No screen loses an action: the header's actions, menu and Help are the page's own objects.
- The checks with the switch on cover the whole screen inventory.

**Non-Goals**

- Redrawing a screen's own content (calendar grids, boards, the notes editor, settings forms, charts). Each is a later change; until then it is the present content under the phone header.
- The sign-in, invitation and public pages: they are outside the shell and have no switch to read before sign-in.

## Decisions

### D1. `PhoneChrome` around the shell's screens

`web/src/phone/PhoneChrome.tsx` provides `PageHeaderDrawContext` (drawing `PhonePageHeader`), `GroupBarContext` (false) and the task row's draw (D3). `Shell.tsx` wraps its route switch in it while the phone UI is on. `PhoneList` and `PhoneTaskPage` no longer provide their own.

`PhonePageHeader` says the screen draws its own bar (`useOwnBar`), so the shell leaves its phone bar out on every screen with a page header and keeps it on one without. A header with `level` 2 stays the page's own (`PageHeader` checks it), since a section's header is not the page's.

`PhoneChrome` is loaded by `Shell.tsx`, one of the two files allowed to import `src/phone`, as a lazy chunk inside `Suspense`: the screens are its children, so they mount once, when the chunk is here. Imported statically it put the phone row, the date sheet and the swipe in the first load (17 KB gzip, measured); lazily the first load is as before. Measured in 4.1.

Alternative: a phone version of each screen's header call. Rejected: about forty call sites, each a place to forget an action.

### D2. The header's frame

A page places its header inside its own padded frame (`PageBody`, `PAGE_FRAME`: 16 px a side below 768 px); the phone list placed it outside. `PhonePageHeader` assumes the page's frame: the bar bleeds to the screen's edges with a negative margin equal to the gutter and the title starts 4 px inside the frame, so the title is at the same place on every screen. `PhoneList` moves its header inside its body to match.

`back` (a nested page's way back, already a `PageHeader` prop) becomes the bar's first control in place of the menu button. `children` (a second row: the calendar's range, tabs) stay under the title.

Interface budget (`docs/interface-guide.md`): one bar, then the title, which scrolls away; a page's second row counts as before. No new shortcut, no new scroll region.

### D3. The task row can be drawn by a screen

`TaskRow` gets the same seam as `PageHeader`: `TaskRowDrawContext`, read at the top of `TaskRow`. `PhoneTaskRow` (`web/src/phone/screens/`) takes `TaskRowProps` and draws the phone row; `PhoneListRow` becomes a thin caller of it, so the list and every other screen share one phone row. A card on a board (`shape="card"`) and the compact shape are not rows and stay as they are.

The props carry everything the row does on each screen (`onToggle`, `onOpen`, `onTick`, `onPointerDown`, `onRowMenu`, `swipe`, `readOnly`, `inline`), so the phone row honours what the screen gives and nothing more: a screen whose rows have no swipe today has none in the phone row.

A tap opens the task page through `onOpen`. On a phone every screen already opens the task page from a row; the transition (`openTaskFromList`) is used where the row is the list's.

### D4. Canvas and gutter

The shell's content area takes the canvas background while the phone UI is on (a class on the scroller), so a screen that draws on the surface colour is not a white page between grey ones. Screens keep their own 16 px gutter; no screen is restyled further here.

### D5. Checks

- `scripts/e2e-layout.mjs` with `PHONE_UI=1` runs every screen of the inventory below 768 px. Its guard changes from "the screen is a phone screen" to "no screen shows the shell's own bar when it has a page header", read from the page. Overlays opened from the desktop row stay out, as in `phone-lists`.
- A unit test walks the shell's routes with the switch on and asserts the phone header is drawn and the shell's bar is not; another renders a saved view, Next and a filter and asserts the phone row.
- The header's menu comparison of `phone-lists` (item by item against the present phone menu) is extended to five screens that are not lists.
- `scripts/e2e-phone.mjs` gains a saved view and Next: a tap opens the task page, the check completes.

## Risks / Trade-offs

- **A screen relies on the shell's bar for something `PageHeader` does not carry** → the unit test walks every route; a screen without a page header keeps the shell's bar.
- **A screen's content looks out of place under the phone header** (a dense table, a wide control) → expected and named as out of scope; the layout check still guards sideways scroll and targets, and each such screen is a later change.
- **The task row's seam costs the desktop a context read per row** → one `use()` per row render; measured against the list budgets in 4.2.

## Migration Plan

No data. The switch decides per device. Builds on `phone-lists`, which must merge first.
