# Proposal

## Why

GitHub issue [#1370](https://github.com/OpenTodoApp/OpenTodo/issues/1370): the interface tour at 360 px (2026-11-14) reported five overlapping touch targets (rule M11) on a task's page, on both of its inventory entries (`task`, `task-panel`):

- **Back and the completion circle.** The circle's 44 px target was centred on its 18 px glyph, which stands in the title's first line (28 px) at the very top of the page. So the target began 8 px above the page, under the phone bar: there a tap went to Back, and the circle was left with 36 px.
- **The four tabs and the comment field.** On a task with little in it the Comments, Activity, History and Time tabs sit near the bottom of the screen, where the comment field is pinned. The field's top 13 to 19 px lay under the tabs.

The second is not a place where a finger meets two controls for good: the field is `position: sticky`, held at the bottom only while its own place is further down, and scrolling on (131 px at most on the seeded tasks) brings it to its place under the conversation, clear of the tabs. That is what the audit already says about the tab bar and the add button over a list's last rows.

## What Changes

- On touch the completion circle's target starts at the top of the title's first line, where the page begins under the bar, and reaches 44 px down beside the title. The circle and the title do not move. With a mouse nothing changes.
- The audit's M11 treats a control of a sticky element that is currently stuck like one of fixed chrome: it is not compared with content that scrolls under it. Two pinned controls on each other still fail.

Out of scope: the order in which the tab row and the pinned comment field are painted where they meet (the tabs are drawn over the field's top edge until the page is scrolled), the space between the bar and the title, the bar itself, the facts card, and controls that scroll under the bar (the page's scroller clips them; the audit measures at the top of a page).

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone browser gets the same page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: new requirement "Task page controls on touch do not overlap".

## Impact

- `web/src/app/task-detail/TaskHead.tsx` (where the circle's target hangs on a coarse pointer).
- `scripts/ux-audit/audit-measures.mjs` (M11) and `scripts/ux-audit/measure.test.mjs`.
- A test in `web/src/app/task-detail/panelProportions.test.tsx`; `docs/interface-guide.md`, `docs/design-system.md`.
- No op field, no route, no string, no dependency, no server change. The first load stays inside its budget.
- No pixel of the page changes: the circle, the title and everything under them stay where they were, so no visual baseline changes.
