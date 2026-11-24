# Proposal

## Why

`shell-reveal-on-paint` (#1757, GitHub issue [#1755](https://github.com/OpenTodoApp/OpenTodo/issues/1755)) ended the iPhone app's launch colour at the web app's first drawn frame. The Android app still waits for the end of the page's load (`onPageFinished`, then the web view's visual-state callback, `shell-first-paint` D3). That load waits for every resource the page asked for before it, so Android can keep its launch screen longer than it needs, up to the five-second cap. The web app already calls `painted()` in any shell that lists `first-paint`.

## What Changes

- **The Android app lists `first-paint`** in the visible app, and on `painted()` shows its web view. The end of the load, the visual-state callback, its 500 ms fallback and the five-second cap stay, for a web app of an older server.
- **While the launch screen holds, the web view is transparent instead of `INVISIBLE`.** Android WebView treats an invisible web view as a hidden page, which runs no animation frames, so the web app could never say it has drawn.
- **The shared fixture lists `first-paint` among the visible app's capabilities**, and `painted` among the methods every page script has.

Out of scope: the cold start of the app and of WebView, which are the system's. Also the iOS app, already done in `shell-reveal-on-paint`.

Advances the ROADMAP item "Shells that feel native" (follow-up to `shell-first-paint` and `shell-reveal-on-paint`).

Depends on `shell-reveal-on-paint` (#1757): its web side and fixture. This branch carries that change's archive.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the Android shell lists `first-paint` too, and its launch screen ends at the first drawn frame.

## Impact

- `mobile/android`: `Bridge.kt` (capability, method, page script), `MainActivity.kt` (a transparent hold, `painted()`), the unit test of the fixture, and an instrumented test with a page whose load is held back.
- `web/src/lib/shellBridge.fixture.test.ts` and `bridge/capabilities.json`.
- No web app change, no server change, no new string, no dependency, no permission.
