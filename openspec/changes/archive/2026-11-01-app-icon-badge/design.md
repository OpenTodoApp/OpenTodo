## Context

The Badging API sets a number on an installed web app's icon from a page or a service worker. iOS and iPadOS 16.4+ honour it only for home-screen apps whose notification permission is granted; Chromium honours it for installed apps. An iOS web app cannot run in the background on a schedule; its service worker wakes only for a push.

## Decisions

### D1. What the badge counts
The badge is the sidebar's Today count: open tasks Today lists (due or deadline today or earlier, or started), every one of them, not the slots of the Today limit. One function, `todayCount` in `web/src/lib/appBadge.ts`, now gives the sidebar and the badge their number, so they never disagree. Rejected: counting only the limit's slots (the number on the icon would differ from the one in the app, and a task waiting for a slot is still left for today) and only tasks due exactly today (overdue work would vanish from the icon).

### D2. Live updates
A component rendered beside the signed-in Shell reads the live task snapshot (`useOpenTasks`, which follows every local write and every applied sync batch), the logical today (`useToday`, re-read every minute and with the day start), and the viewer's zone, and calls `setAppBadge(n)` or `clearAppBadge()` at zero. Errors (no permission on iOS, not installed) are ignored.

### D3. While the app is closed
The hook also stores `{ dayStart, counts }` in the local `meta` row `badge:today`: the Today count for each of the next seven days as the local data stands (an open task due today counts as overdue tomorrow), written only when it changes. On any push that arrives with no visible window, `push-sw.js` reads the row, finds the logical day the same way `logicalDay` does, and sets or clears the badge; no row or no count for that day leaves the badge alone. So a morning reminder brings the badge to the new day's count. Changes made on other devices while the app was closed show when it next opens. Rejected: a count in the push payload (the server would need a Go port of Today's selection, the device's zone and day start, and would still push only when a reminder fires; it would also add a field to an encrypted payload for no gain over D3).

### D4. The switch
A device flag in localStorage (`opentodo.appBadge`, absent = on, `off` = off), never synced: support and permission are per device. The card **App icon badge** in Settings → Notifications → Push notifications renders only where `setAppBadge` and `clearAppBadge` exist, and shows a note while notification permission is not granted. Off clears the badge and deletes the `meta` row, so the worker stops setting it. Sign-out clears both too.

## Data model

None: no op, field, table or migration. The `meta` row is device-local and holds dates and numbers only, never task content; `clearLocalData` already removes it on sign-out.

## Interface budget

One settings card with one row; no chrome, task property, sidebar destination, scroll region or shortcut changes.

## Size

About 1 KB gzipped in the main bundle (the sync component runs beside the Shell); no dependency, no server change, no effect on image size or memory.

## Risks

Real iOS behaviour (permission, badge after closing, push wake) is confirmed on a device; tests cover the count, the calls, the stored row and the worker's day lookup.
