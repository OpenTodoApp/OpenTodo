# Design

## Context

GitHub issue 1370, from the interface tour at 360 px. Measured in Chromium at 360 x 740 and 390 x 740 with touch emulation on the layout check's seeded account (y from the top of the screen; the page's scroller starts at 49, under the 48 px bar and its hairline). The numbers are the same at both widths.

| Control | Before | After |
|---|---|---|
| Back (bar) | 4 to 48 | 4 to 48 |
| Completion circle, glyph | 54 to 72 | 54 to 72 |
| Completion circle, target | 41 to 85 | 49 to 93 |
| Title | 49 to 93 | 49 to 93 |
| Tabs, page at its top | 653 to 697 (659 to 703 on a repeating task) | the same |
| Comment field, page at its top | 684 to 728 | the same |
| Tabs, page at its end | 528 to 572 | the same |
| Comment field, page at its end | 660 to 704 | the same |

- **Back and the circle.** The circle stands in a box of the title's first line (28 px, `sidebar-brand-and-row-grid` D5) and its button took 44 px centred on that box: 8 px above it. The title row is the first thing on the page, so those 8 px were above the scroller, which clips them: a tap there went to Back, and the circle answered in 36 px.
- **The tabs and the comment field.** The field's host is `sticky bottom-0` at the end of the content column; the tab row is in the flow just before the conversation. On a short task the tab row's place is within 44 px of the bottom of the screen, so the stuck field lies under it (13 to 19 px; the tab row is painted on top). The page scrolls 125 to 131 px further, and at its end the field is at its own place, 88 px under the tabs. A page that does not scroll has the field at its place already. So a person can always scroll the two apart, and never has to: every tab takes its tap at its centre, and the field takes its tap on the part that shows.

## Goals / Non-Goals

**Goals:** the circle keeps 44 px of its own that Back does not share; the audit stops reporting the stuck comment field; nothing visible moves.

**Non-Goals:** room between the bar and the title, a designed pressed circle for this control (it dims, the fallback of `touch-pressed-states`), repainting where the tab row and the field meet.

## Decisions

### D1. The circle's target hangs from the top of the first line

On a coarse pointer the box and the button align their content to the start (`pointer-coarse:items-start`) instead of the centre, and the glyph sits in a span of the line's height inside the button (`pointer-coarse:h-7` on the page, `h-6` in the panel), centred there. The button's 44 px then run from the top of the line box down beside the title, whose field is 44 px tall on touch: the target and the title row end together. This is the approach of `phone-row-controls` D2: the hit area moves, the glyph does not.

- The pressed state is unchanged: the control has no `press-*` colour, so the whole button dims while a finger is on it, and the dim does not depend on where the glyph is in the button.
- The focus ring follows the button, so with a keyboard on a touch device it is a 44 px circle from the line's top. With a mouse the button is the 24 px one it was.
- The docked panel takes the same classes; it opens only with a fine pointer from 1280 px, where they do nothing.

Rejected:
- Padding above the title row on touch (8 px, so the centred target fits): it moves the title and everything under it down on every task, for a target nobody sees.
- A shorter target (36 px): below the app's 44 px rule (M7).
- Raising the circle's target over the bar (`z-index`): the scroller clips it, and Back would lose its bottom edge instead.

### D2. The audit's rule: a stuck sticky element is chrome

`overlaps()` leaves out a pair when exactly one of the two controls is pinned. Pinned was "inside a `position: fixed` ancestor"; it is now also "inside a `position: sticky` ancestor that is stuck". Stuck means the element is not where the flow puts it: the function sets it to `position: static` for the length of one measurement, compares the two boxes (more than 1 px apart) and restores the inline style, all in one task, so nothing is painted. A sticky element at its own place is content like the rest and is compared as before; two pinned controls on each other (a stuck bar on the tab bar, a top bar on a bottom bar in a short window) still fail. Fixture tests cover the three cases.

Rejected:
- An exemption for the comment field by name: the next sticky bar would need another.
- Scrolling each page to its end before measuring: every other measure of the tour is taken at the top, where a person arrives.
- Changing the layout so the field never meets the tabs (not sticking the field until the tabs have passed, or reserving its height under the tabs): "Task panel comment composer" asks for the field at the bottom of the page before any scrolling, and the reserve would be 60 px of empty page on every task.

## Data model, size

No op field, no table, no route, no string, no dependency. Image size and memory are unchanged. After the change the entry chunk is 146.0 KB gzip (budget 147) and the entry with its static imports 706.4 KB (budget 708).

## Interface budget

Nothing is added or removed: no chrome, no task property, no sidebar destination, no scroll region, no shortcut. The page looks the same.

## Measured

The audit's own tour, `ONLY=task,task-panel,panel-comments THEMES=light LANGS=en`:

| Screen | 360 px before | 360 px after | 390 px after |
|---|---|---|---|
| `task` | 5 | 0 | 0 |
| `task-panel` | 5 | 0 | 0 |
| `panel-comments` | 0 | 0 | 0 |

At 390 px before, the rule's function run on the task's page found the same five pairs (the tour itself was not run there before the change).

Taps (Chromium touch, 360 and 390 px): Back answers at its centre and 1 px inside each edge, and a tap on its bottom edge leaves the task and completes nothing; the circle answers at its centre and 1 px inside each edge, and a tap on its top edge completes the task and stays on the page; each of the four tabs is selected by a tap at its centre; a tap on the comment field opens the composer. At 1280 px with a mouse the control is 24 px at 82 to 106, centred on the title's line (80 to 108), and the rule finds nothing.
