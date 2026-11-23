## Context

`showRouteChange` wraps every route change after a pointer input in `document.startViewTransition`. `navDirection` gives forward or back by the depth of each route, and `none` (a cross-fade) between routes of the same depth. The capture of the old page costs a frame or more before the new route renders, which is most visible on a throttled phone and with a large list.

## Decisions

**D1. Only routes that are pushed onto a list animate.** A pushed page is a task's page, the theme editor, or Settings at any level. A change animates when at least one of its two routes is a pushed page; any other change (list view to list view, by tap, click or history) applies at once, without `startViewTransition`, so it costs nothing beyond the render.

**D2. The direction comes from the push depth.** List views are depth 0, Settings 1, a Settings section and a task's page 2, a Settings page and the theme editor 3. Deeper is forward, shallower back, a step back through history back. Two pushed pages of the same depth (one task's page to another by a link) change at once: with no cross-fade left, `none` means no transition, and its CSS rule goes.

**D3. The gates stay.** Reduced motion, the no-motion display, a focused text field, a hidden tab and a keyboard change still skip the transition (page-transitions D3).

Alternative rejected: raising the budgets, or keeping the transition and pre-rendering the new page. The first hides a real delay; the second is more code for an animation on the commonest navigation that the person does not need.

## Interface budget

No chrome, property, destination, scroll region or shortcut changes.

## Risks

A back swipe between two list views (a project to the Inbox) now ends with the page changing at once where it used to slide out; the page under the finger already left with it, so there is no jump to undo.
