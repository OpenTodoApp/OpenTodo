# Design

## D1. One stored value with three states

The `opentodo.appBadge` localStorage value was absent (on) or `off`. It now holds the mode: absent is Today, `off` Off, `overdue` Earlier. So every device keeps what it had, and an older app reading `overdue` sees "not off" and counts Today.

## D2. Earlier is Today's Earlier group

`todayCount` and `badgeCounts` take the mode. Earlier counts a task when Today lists it and `overdueInToday` holds: the predicate that already builds Today's Earlier group. The label is Earlier, not Overdue: the interface never says overdue (page-rhythm D8, checked by `i18n.test.ts`). The counts of the next seven days use the same rule per day, so a task due today counts as overdue tomorrow, and the service worker needs no change: it still reads `{ dayStart, counts }`.

## D3. The control

The row's switch becomes a `SegmentedControl` labelled **Count** with Today, Earlier and Off, reusing existing strings. The permission notice shows while the choice is not Off.

## Interface budget

The Settings card keeps one row; no list chrome, task property, sidebar destination, scroll region or shortcut changes.

## Data model

None: a per-device localStorage value, never synced.
