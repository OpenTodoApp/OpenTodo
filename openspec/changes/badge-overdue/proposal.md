# Proposal

## Why

The app icon badge counts every open task Today lists. Some people want it to count only what is late (GitHub issue [#1548](https://github.com/OpenTodoApp/OpenTodo/issues/1548), following #725): a badge that is never zero on a normal day stops meaning anything. On 19 Nov the owner decided that "overdue" means overdue tasks, not reminders that fired.

## What Changes

- **The badge's switch becomes a choice of what it counts:** Settings → Notifications → App icon badge → **Count**: **Today** (the default, as now), **Earlier** (only Today's Earlier group, the interface's word for overdue tasks), **Off**.
- Earlier is the same rule as Today's Earlier group: due before today, or a deadline before today on a task not planned for today, with Hide tasks assigned to others applied as for Today.
- The counts the service worker reads while the app is closed follow the choice, so a push the next morning shows yesterday's tasks as overdue.
- The stored choice keeps the old switch's values: a device that had the badge off reads Off, every other device Today.

Out of scope: counting fired reminders (the owner chose tasks), a count shared across devices.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-icon-badge`: "Per-device switch" offers three choices; "The badge while the app is closed" stores the chosen count.

## Impact

- `web/src/lib/appBadge.ts` (the mode, the count), `web/src/app/AppBadge.tsx` (the segmented choice), `web/src/lib/settingsCopy.ts`; two strings leave every catalogue, no new string (Count, Today, Earlier, Off and "This device only." already exist).
- `docs/app-icon-badge.md`.
- No server, sync or data change; the service worker is unchanged.
