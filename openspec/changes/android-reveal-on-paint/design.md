# Design

## Context

- `MainActivity.holdLaunchScreen` sets the root's background to none and the web view to `INVISIBLE`, so the window's background (the launch screen) shows. On Android 12 and later, at a cold start, a pre-draw listener also holds the first frame back, which keeps the system's splash screen up.
- `reveal()` ends the hold at the first of four things (`shell-first-paint` D3): the visual-state callback after `onPageFinished`, 500 ms after it, an error screen, or the five-second cap.
- The web app calls `opentodoShell.painted()` two animation frames after React's first commit, in a shell that lists `first-paint` (`shell-reveal-on-paint` D1).

## Goals / Non-Goals

**Goals:** the launch screen ends at the web app's first drawn frame on Android as on iOS; an older web app keeps today's signals; no blank frame.

**Non-Goals:** the system's cold start; iOS.

## Decisions

### D1. Transparent, not invisible, while the hold lasts

Android WebView treats a view that isn't `VISIBLE` as a hidden page. Chromium hides the web contents, and a hidden page runs no animation frames, so `painted()` would only come after the reveal.

So the hold now sets the web view's alpha to 0 and leaves it `VISIBLE`, as the iPhone app does. `reveal()` sets alpha to 1. A transparent view draws nothing, so the window's background is what shows, as before.

The visual-state callback is documented for a `VISIBLE` web view that is attached to the window, and this one is, so the existing fallback still applies. The instrumented test `theWebViewShowsOnceThePageHasLoaded` now checks alpha instead of visibility.

### D2. `painted()` reveals at once

`Bridge.handle` passes `painted` to the host, on the main thread, only when there is a host. The hidden run has none, so it lists no `first-paint` and shows nothing.

`MainActivity.painted()` calls `reveal()` unless the main frame failed; after a failure the error screen or its retry follows. On Android 12 and later the pre-draw listener then lets the next frame through. That frame holds the web view's latest content, which the page has just said is drawn.

### D3. Tested on the emulator

`thePagesFirstFrameShowsTheWebViewBeforeItsLoadEnds` serves a page with an image that takes 30 s, longer than the cap, and a script that calls `painted()` two animation frames in. The test fails unless the web view shows within three seconds while `document.readyState` is still `interactive`, which is what proves the call came from an animation frame.

It runs in CI's instrumented-test job: API 34, a cold start with the pre-draw hold. If WebView ran no frames while held, it would fail there.

## Data model, size

No op field, no route. One bridge method on Android, the bridge version stays 1. About 20 lines of Kotlin and two tests. No dependency, no permission.

## Interface budget

No screen changes.

## Risks / Trade-offs

- **Not compiled here.** There is no Android SDK in this environment; CI's Android job builds the app and runs the unit and instrumented tests.
- **A transparent web view takes touches.** While the launch screen holds, a tap reaches the page under it. The page is the app being shown, and the hold lasts until its first frame at most, as on iOS.
- **Device check:** a cold start on a phone, light and dark, with the app swiped away first. The time from the tap to the app is compared with a build of main, after the owner's iPhone check for #1757.
