# Design

## Context

GitHub issue 1359, from the interface tour at 360 px. What the code did, measured in Chromium at 360 x 740 with touch emulation on the layout check's seeded account (x from the screen's left edge; the row starts at 16):

| Control | Glyph | Target before | Shared with |
|---|---|---|---|
| Fold arrow (a task with subtasks) | 26 to 38 | 10 to 54 | the checkbox, 18 px |
| Checkbox | 48 to 68 | 36 to 80 | the title, 4 px (inside the rule's tolerance) |
| Show details | row end | 44 px around its 20 px slot | the grip, 16 px |
| Grip | row end | 44 px, from 10 px above the row | Show details; the section's Add a task or menu button above the first row, 8 px |

- **Why they overlapped.** Each glyph sits in a 16 or 20 px slot with 8 px between slots, and its button took 44 px with negative margins (`-m-3`, `-mx-3.5`): glyph centres are 26 to 28 px apart, so two centred 44 px targets cannot both fit. `touch-pressed-states` D3 says so ("overlaps its neighbours by design"). In the shared part the checkbox won (`z-1`), so a tap on the right edge of the fold arrow's glyph completed the task.
- **The grip was not on the title's line.** The phone row (`index.css`, "The phone row") puts the leading slot, the checkbox, the time and Show details 12 px down, on the title's first line. The grip, added later, was not in that list: it sat 10 px higher than everything else and its target began above the row.
- **The row clips taps.** A list row is `content-visibility: auto` (`.row-offscreen`). Chromium then takes no tap for the row outside its border box, whatever `overflow-clip-margin` says (measured: the first hit is at the row's edge with a margin of 4 px or 16 px, and at the screen's edge with `content-visibility: visible`). WebKit draws every row normally and does not clip.
- **What depended on Show details below 768 px.** The row's disclosure (`[data-row-expand]`, shown on touch and on narrow windows) and nothing else: → (`list.expand`) and "Click a task to: Expand the row" (`rowClick`) call the same `expand` handler without the button; the revealed actions are not displayed below 768 px or on touch; the audit's inventory has no entry for it; the docs screenshot of an expanded row is taken at desktop width through the revealed action; the `Screens/Expanded row` story clicks the button from script.
- **The add field** (`QuickAdd`) is a one-row `textarea`; a placeholder longer than the line wraps and is cut. `placeholderFor` builds the hint from the list.

## Goals / Non-Goals

**Goals:** a row's controls on touch each have their own 44 px; nothing a phone needs is lost with the arrow; the add field's hint fits; the row's anatomy, the checkbox column and the title's width stay.

**Non-Goals:** rows that reach the screen's edges, a new preference, moving the fold arrow elsewhere, changing what an expanded row shows.

## Decisions

### D1. No disclosure below 768 px, except on an expanded row

The slot is `max-md:hidden` unless the row's details are shown, in addition to `md:pointer-fine:hidden`. 768 px is the phone row's own condition (`@media screen and (width < 48rem)`) and the revealed actions' (`md:`), so there is one line between "a tap opens the task" and "the row has a control to expand it".

- **The key and the click setting stay at every width.** → on a narrow window with a keyboard, and a tap under "Expand the row", still expand: both are the person's choice, and the details read well at 360 px.
- **An expanded row keeps the button, as Hide details.** Otherwise details opened by →, by a click, or at 900 px before the window narrowed could only be closed with the keyboard or by leaving the list. Measured: expanded at 900 px with →, narrowed to 600 px, the row ends with Hide details and a click closes it.
- **Not displayed means not focusable and not heard.** The row's open control still carries `aria-expanded`.

Rejected: closing an expanded row when the window narrows (state in three list views for a rare case, and it would close what the person just opened with →). Removing expansion below 768 px altogether (the "Expand the row" setting would silently stop working on a phone).

### D2. One target each

After D1 a phone row has four controls: the fold arrow, the checkbox, the open control and the grip.

**Fold arrow and checkbox.** The row has 60 px from its edge to the title, and the page 16 px of gutter before it: there is no room for two centred targets, and the checkbox's is specified ("Checkbox touch target": 44 px around its circle). So the fold arrow's target is not centred on its glyph: it ends where the checkbox's begins (36) and reaches back 44 px, over the row's padding, the indent of a subtask row and the page gutter. The glyph moves 2 px toward the row's start so that it lies inside its own target (24 to 36). Nothing else moves.

- The pressed circle (`touch-pressed-states` D3) is `press-inset` on the other controls: padding and `background-clip` centre it in the target. Here the glyph is not the target's centre, so the 28 px circle is a `span` around the glyph that takes `--color-selected` while the button is `:active` on a coarse pointer, and the button sets `opacity: 1` so the fallback dim does not stack. The span takes no pointer events, so the part of it that lies over the checkbox's target stays the checkbox's.
- A row with a fold arrow draws normally on touch (`.row-offscreen:has(> [data-leading-slot] > button) { content-visibility: visible }`), so in Chromium the target over the gutter takes taps. Such rows are the minority of a list. In a list of 50 rows or more the rows are in blocks (`.row-block`) and the block clips instead: there the arrow takes taps from the row's edge to the checkbox's target (20 px at the top level, the full 44 px on a subtask row, whose indent is inside the row). That is what it took everywhere before this change.

**Grip.** `[data-row-grip]` joins the phone row's first-line rule, so it is level with the title and its target is the row's own 44 px, clear of the header above. It also takes 4 px of margin at the row's end, at every touch width: its target ended 4 px outside the row, where Chromium takes no tap. The title loses those 4 px.

**Disclosure and grip, from 768 px on touch.** The disclosure's slot takes 12 px of margin toward the grip when the row has one. The two targets then share 4 px, the rule's tolerance. A tablet row has the room.

Rejected:
- A wider leading slot on touch (20 px more before every checkbox, in every list, to keep the checkboxes aligned across views as "One row anatomy" requires): it costs every title 20 px for an arrow most rows do not have.
- The fold arrow at the row's end on touch: a second anatomy for touch, and the same crowding beside the grip.
- Rows that bleed to the screen's edges, so the gutter belongs to the row: every selected, hovered and pressed surface, the swipe edges and the drop line would change, in lists that also live inside cards. A change of its own if the last 16 px matter.
- Narrower targets (30 px each): below the app's 44 px rule (M7).

### D3. The hint

`placeholderFor(..., short)` returns the existing "Add a task…" when `short`; `TaskListView` passes the `phone` it already has from `usePhoneListActions` (`DESKTOP_HEADER_QUERY`, 768 px). A section's add line does the same with `useMediaQuery`. The field's accessible name is unchanged (the list's field was already "Add a task"; a section's still names the section). No new string: the short one is in every catalogue, and the longest (German, "Aufgabe hinzufügen…") fits 360 px.

Rejected: an ellipsis on the placeholder (a `textarea` placeholder cannot be cut with one). Keeping the short view hints ("Add a task for today…") and shortening only the project's: two rules for one line; the header already names the list.

### D4. The audit's rule

After D1 and D2 the remaining M11 findings on these screens were all a row or section control under the page's fixed chrome: the add button and the tab bar over the rows at the bottom of the viewport. Scrolling uncovers them, as closing a menu uncovers what is under it, which the rule already leaves out. `overlaps()` now skips a pair when exactly one of the two is inside a `position: fixed` ancestor; two fixed controls on each other still fail (fixture test).

## Data model, size

No op field, no table, no route, no string, no dependency. Image size and memory are unchanged. After the change the entry chunk is 145.3 KB gzip (budget 146) and the entry with its static imports 704.6 KB (budget 706).

## Interface budget

A phone row loses a control and gains none: 28 px more for the title on every row, less the grip's 4. No chrome above a list, no task property, no sidebar destination, no scroll region and no shortcut is added; → keeps its registration.

## Measured

Chromium, touch emulation, the layout check's seeded account, the audit's own `overlaps()` without its cap of 8 per screen:

| Screen | 360 px before | 360 px after | 390 px before | 390 px after |
|---|---|---|---|---|
| Inbox | 6 | 0 | 6 | 0 |
| Today | 5 | 0 | 8 (cap) | 0 |
| Upcoming | 1 | 0 | 1 | 0 |
| Project | 8 (cap) | 0 | 8 (cap) | 0 |

"Before" is the tour's report (capped); "after" is the tour with D4. Without D4 the after counts are 0, 10, 0, 2 and 0, 3, 0, 9, every one a control of the list under the add button or the tab bar, none between two controls of the list. At 768 px (touch) the four screens have 0 as well.

A parent row of the project at 360 px, the owner of each x on the title's line: fold arrow 0 to 36, checkbox 36 to 80, the title 80 to 300, grip 300 to 344 (the row's edge). Taps (Playwright `touchscreen.tap`) at 360 and 390 px: the fold arrow folds at x 1, 14 (its target's centre), 28 (the glyph) and 34; the checkbox completes at 6, 22 and 40 px into its target; the grip selects at its centre and 3 px inside each of its four edges; a tap on the title opens the task's page; a swipe right completes; a hold opens the row's menu. Forced `:active` (CDP): the fold arrow's circle, the checkbox's and the grip's are the same colour, 28 px, at opacity 1, and the row is not tinted. At 1280 px with a mouse a hovered row shows Show details, Schedule, Priority and More, and no disclosure.

## Risks / Trade-offs

- **Not verified with a finger**, nor in WebKit: the taps are emulated, and WKWebView's `:active` is the owner's device check, as in `touch-pressed-states`.
- **Long lists in Chromium** keep a 20 px fold arrow target at the top level (D2). The glyph is inside it.
- **The fold arrow's target is mostly beside its glyph.** A tap left of the arrow folds; a tap right of it, from 36, completes the task as the checkbox's 44 px always did. The 12 px between the arrow's glyph and the circle are split by that line.
- **Rows with a fold arrow are always drawn on touch.** In a list under 50 rows that is a few rows more to lay out.
- **Baselines** change on every phone-width screen with rows.
