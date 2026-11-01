## Why

People who add OpenTodo to the iPhone home screen want to see how much is left today without opening the app, as native task apps show it (#725). Browsers have a Badging API for installed apps (`navigator.setAppBadge`, iOS and iPadOS 16.4+ home-screen apps once notifications are allowed, Chromium installed apps on desktop and Android), and OpenTodo does not use it.

## What Changes

- The installed app's icon shows the number of today's open tasks: the sidebar's Today count (every task Today lists, not the slots of the Today limit). It is set on every local change and every sync while the app runs, and cleared at zero.
- While the app is closed, a push that arrives (a reminder) sets the badge to the current day's count from counts the app stored for the next seven days. The push payload is unchanged: no count, no new field, nothing for end-to-end encryption to cover.
- A per-device switch, **Show today's count** in Settings → Notifications → App icon badge, on by default and shown only where the Badging API exists; a note says iPhone and iPad need notifications allowed. Turning it off or signing out clears the badge and the stored counts.

Out of scope: a count computed by the server or carried in a push (the server would need a port of Today's selection and the device's zone and day start, and would push at times reminders do not), periodic background sync (not available to iOS web apps), a badge in the native shells (`mobile/`), and a choice of what to count. Advances no ROADMAP.md item; a feature request (#725). No breaking change, no environment variable.

## Capabilities

### New Capabilities
- `app-icon-badge`: today's open-task count on the installed app's icon, its updates while open and on push, and the per-device switch.

### Modified Capabilities

## Impact

`web/src/lib/appBadge.ts` (new), `web/src/app/AppBadge.tsx` (new: the sync component and the settings card), `web/src/app/Sidebar.tsx` (shares the count), `web/src/app/App.tsx` (renders it; sign-out clears), `web/public/push-sw.js` (sets the badge on push), settings copy and search index, the six catalogs, `docs/push-notifications.md`, `docs/install-phone.md`. No server, data model, op, API, dependency or size impact beyond about 1 KB of client code.
