# Proposal

## Why

GitHub issue [#1368](https://github.com/OpenTodoApp/OpenTodo/issues/1368): at 360 px the phone's floating add button stands on the right end of the Weekly review's "Next: Mind sweep" button, the one primary action of the step. The two share 56 × 39 px, and a tap there adds a task instead of going on. The interface tour did not report it: since `phone-row-controls` its overlap rule (M11) leaves out fixed chrome over content that scrolls.

## What Changes

- **A screen that ends in its own action has no add button.** Below 768 px the Weekly review's steps show no floating add button, as Close the day, Focus and the routine editor already do. The tab bar stays. Mind sweep keeps its own add field and the Projects step its "add a next action"; the Daily check and the Monthly look, whose action is in the header, keep the button.
- **The audit catches the case.** M11 compares the add button with a page's primary button although one is fixed and the other scrolls, so a later screen that opens with its action under the button is reported.

Out of scope: the add button over rows and calendar blocks in the middle of a scroll (the content reserves the button's footprint at its end and the button leaves while the list scrolls down; `phone-v2`), moving the button or the review's Back and Next, the reminder toast, and every width from 768 px.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone browser gets the same.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "No floating add button in the rituals" also covers the Weekly review's steps, and states the rule.

## Impact

- `web/src/app/router.ts` (`offersQuickAdd`), its test `web/src/app/quickAddRoutes.test.ts`.
- `scripts/ux-audit/audit-measures.mjs` (M11), `scripts/ux-audit/measure.test.mjs`, `docs/design-system.md`, `docs/interface-guide.md`.
- No data, op, route, setting or string changes. No dependency.
- The phone-width UI screenshots of the Weekly review lose the add button.
