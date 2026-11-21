# Proposal

## Why

Both phone apps show an empty screen from the tap on the icon until the web app has painted (GitHub issue [#1343](https://github.com/OpenTodoApp/OpenTodo/issues/1343), `mobile/AUDIT.md` "Startup and offline"). An app that starts blank reads as a website in a box before the user has done anything.

- **Android** has no launch screen of its own: a plain window background, then an empty web view with no sign of progress. A slow server shows nothing.
- **iOS** has an empty launch screen, then a white web view, or one filled with the theme's bar colour, until the page paints.
- **The web app's loading skeleton** shows task rows only. On a phone the top bar and the tab bar appear with the app, so the screen jumps once more.

## What Changes

- **Android** opens on its icon over the app's canvas colour, light or dark with the phone, and keeps that until the page can be drawn or an error screen has something to say. Five seconds at most.
- **iOS** opens on the same colour, light or dark, and keeps the web view hidden over it until a page has loaded or a load failed. Five seconds at most.
- **The loading skeleton on a phone** holds the top bar and the tab bar where the app puts them, in the frame the real ones use, so the handover moves nothing.

Out of scope: an offline start for the iOS store build (it has no service worker; a change of its own), what the error and first-run screens say, an icon on the iOS launch screen (the project has no image asset for one, and Apple's guidance is a launch screen without a logo), a launch colour that follows a chosen theme instead of the phone's appearance, and the height of the tab bar on touch screens (see the design's open question).

Advances the ROADMAP item "Shells that feel native" (step 4 of `mobile/AUDIT.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: a launch screen that stays until the page has something to show becomes a requirement.
- `app-shell`: the cold-start skeleton holds the phone's chrome in place.

## Impact

- `mobile/android`: a launch theme for `MainActivity` (a window background with the icon; the platform's splash screen attributes from Android 12), two colours, `LaunchHold` and its use in `MainActivity`. No dependency, no permission.
- `mobile/ios`: a colour in the asset catalog, `UILaunchScreen` in `project.yml` and `Info.plist`, the hidden web view in `ShellView.swift`. No new file in the project.
- `web/src/app`: `phoneFrame.tsx` (the frame classes of the phone's bar and tab bar, and the skeleton around the loading rows), used by `Shell`, `TabBar` and `App`. No new string.
- No server change, no op field, no bridge change, no new environment variable. The web app's first load grows by about 0.2 KB gzip, which uses up the entry chunk's budget (see the design).
