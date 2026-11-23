## Why

Since page-transitions (#1741), every route change after a tap or click runs inside a view transition: the browser captures the old page before it renders the new one. Switching between list views is the commonest navigation, and there the capture shows the list later without telling the person anything: the phone `saved-view` budget reads 403 ms on main against 300, and the desktop Notes budgets fail (open the Notes page 459 ms against 400, Linked references 298 against 200).

## What Changes

- The slide stays for push navigations only: opening a task's page, opening Settings and its sections and pages, and going back from any of them.
- A switch between list views (Inbox, Today, Upcoming, projects, labels, places, saved views, the Notes pages, Rules) changes the page at once, with no transition, from a tap, a click or the history. The cross-fade between destinations goes.
- Budgets stay as they are.

Out of scope: the edge swipe (it still follows the finger; released between two list views the page changes at once), the list reflow animation, any budget. No ROADMAP item; this is a performance fix on the consolidation track. No new environment variable, no op change.

## Capabilities

### Modified Capabilities

- `web-app`: "Page changes move with a direction" keeps the slide for push navigations and drops the transition between list views.

## Impact

`web/src/app/pageTransition.ts` (the push-page table and the gate), its test, a comment in `web/src/index.css`. No dependency, no bundle change worth naming.
