# Design

## Context

Below 768 px the shell draws the tab bar and, above it at the right, the add button (`AddButton` in `web/src/app/TabBar.tsx`: fixed, 56 px, 12 px over the tab bar and the bottom safe area). Three things already keep it off a screen:

- `offersQuickAdd(route)` in `router.ts`: the button is not rendered. `VIEW_QUICK_ADD` lists every view; Settings, Import, Help, Statistics, Routines, Focus and others say no, and Close the day is refused by its step.
- `hasPhoneChrome(route)` in `phoneFrame.tsx`: the task page and the routine editor have no tab bar and so no button; they bring their own bottom bar.
- The selection bar marks the root (`data-selection-docked`) and a rule in `index.css` moves the button out while the bar stands in its place.

Under every page the content column keeps the button's footprint free (`--add-room`), and the button slides out while the page scrolls down. So at the end of a scroll nothing is under the button.

The Weekly review at 360 × 740 is 71 px taller than the screen. As it opens, Back and Next (in the flow, under the step's card) are exactly where the button stands. Scrolling would uncover Next, but nobody scrolls to reach a button they can see.

Every screen with a bottom action or a bar of its own. Those that can show the add button were measured in Chromium at 360 and 390 px with touch on the seeded account, as they open and at the end of their scroll; the task page and the selection bar are as their specs and tests have them:

| Screen | Its bottom action | Add button |
| --- | --- | --- |
| Weekly review, each step | Back and Next under the step | on Next (56 × 39 px at 360 px) → **removed** |
| Close the day | Back and Next in the card | none already |
| Focus | timer controls | none already |
| Routine editor, a routine | its own bar, no tab bar | none already |
| Routines, Import, Settings, Assistant, Statistics, Trash, Updates, Help, Habits | forms and their footers | none already |
| Task page | its own footer, no tab bar | none already |
| Selection bar (any list) | the bar, above the tab bar | steps aside already |
| Daily check, Monthly look | "Done for today" in the header | stays, clear |
| Process the Inbox | actions under the card, mid page | stays, clear |
| Loop home and its moves, Plan, Template library (a dialog) | none at the bottom, or in a layer over the page | stays, clear |

## Goals / Non-Goals

**Goals:** the add button never stands on a page's own action; one rule; the existing mechanism.

**Non-Goals:** a button that moves with the page's content; changing where the review keeps Back and Next.

## Decisions

### D1. Not shown, rather than raised above the action

The rule: a screen that ends in its own action has no add button. The review's steps join Close the day in `offersQuickAdd`: for the `review` view only the Daily check and the Monthly look offer quick add.

Raising the button above the action was the alternative. Back and Next are in the flow, so the button would have to follow a moving element, or Back and Next would have to become a fixed bar above the tab bar: a second bottom bar, 56 px less of the step, and a new mechanism beside the three above. The loss from hiding is small: Mind sweep is the review's capture step and has its own add field that keeps focus, the Projects step adds a next action in place, and the Inbox tab is one tap away.

Because the button is not rendered, the safe-area inset and the on-screen keyboard need nothing: there is no new position to keep clear of either.

### D2. One exception in M11

The tour measures a screen as it opens. M11 still leaves out fixed chrome against scrolling content, except the pair add button (`[data-add-button]`) and primary button (`.ui-btn--primary`). A sticky-or-fixed test would not have caught the review, whose action is in the flow. Rows and secondary controls under the button stay out: scrolling uncovers them and the end of the page is reserved.

### Data model, size, interface budget

No data, op or setting. No dependency; the first load changes by a few bytes of one condition. The change removes a control from one screen: chrome rows, row metadata, destinations and scroll regions are unchanged, and there is no new shortcut.

## Risks / Trade-offs

- A thought during a review step other than Mind sweep can no longer be caught with the add button on a phone. → Mind sweep is one tap in the stepper; the owner may prefer the button back with Next moved instead.
- The content column still reserves the button's footprint under the review (as under Close the day): 76 px of empty room at the end of a step, and no layout difference between the review and other pages.
