# Proposal

## Why

GitHub issue #1342 ("Pull down to sync on a phone"). Pulling a list down is what a person on a phone does when the list looks stale. Today it does nothing in the Android app and in the installed web app. In the iOS app it reloads the whole web app, which throws away the open page, its scroll position and anything half typed, to do what a sync would have done.

## What Changes

- **Pull to sync.** On a touch device, pulling a page down from its top asks for a sync now. A small mark follows the pull, turns while the sync runs and goes when it settles. Nothing reloads.
- **Honest when it cannot sync.** Offline, signed out or locked, the pull says so with the sync status's own words, as a toast, and changes nothing.
- **It stays out of the way.** It starts only on a page at its top with a clearly vertical move, and never from a mouse or trackpad. Row swipes, the edge swipe, a lifted drag, scrollers inside the page (the calendar grid, a board column), a focused text field, a text selection and open dialogs keep their gestures.
- **The iOS app stops reloading.** The web app tells the shell, through one new optional bridge method, that it handles the pull. The shell then turns its own pull to refresh off for that page. With an older web app the shell keeps today's reload, so nobody is left without a way to refresh.

Out of scope: the page's overscroll, bounce and the browser's own pull to reload (`shell-touch`); dragging sheets (`sheet-drag-dismiss`); a pull to refresh inside the calendar grid or any other inner scroller; any change to what a sync does or how often it runs; Android shell code (it has no pull to refresh to turn off).

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: a new requirement, pull down to sync on a touch device.
- `native-shells`: a new requirement, the iOS shell's pull to refresh yields to a web app that handles the pull.

## Impact

- `web/src/app`: the gesture (`pullToSync.ts`), its mark (`PullToSync.tsx`), one line in `Shell.tsx`. Loaded as its own chunk on touch devices only.
- `web/src/lib/shell.ts`: capability `pull-refresh`, method `pullHandled`; a new shared bridge fixture `pull.json`.
- `mobile/ios`: the refresh control follows the page (`Bridge.swift`, `BridgeHost.swift`, `ShellView.swift`), unit tests.
- No server change, no op field, no new string, no new dependency, no new environment variable. Bridge version stays 1.
- Compatibility: an older shell does not list the capability and is not called (its reload stays until the app is updated); a newer shell with an older web app is never called and keeps its reload.
