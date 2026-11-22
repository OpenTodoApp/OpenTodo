# Design

## Context

- `ShellController` (iOS) starts its web view at alpha 0 over `LaunchBackground` and calls `reveal()` at `didFinish`, at a recorded failure, or after `revealCap` (5 s) (`shell-first-paint` D4).
- `didFinish` is WebKit's end of the main frame's load: the `load` event, after every resource the document asked for before it.
- The web app's `main.tsx` starts a dozen dynamic imports, the language load and the first render at once. Vite's preload helper inserts `<link>` elements for the lazy parts' dependencies, and a document's `<link>` loads hold back `load`. Rendering also asks for the Inter font.
- Measured on main in Chromium at 390 × 844 with touch, on a signed-in device with the service worker in control (median of five reloads):

| CPU | first child in `#root` | frame after it | `load` |
|---|---:|---:|---:|
| 1× | 236 ms | 258 ms | 232 ms |
| 4× | 590 ms | 640 ms | 575 ms |
| 6× | 727 ms | 763 ms | 705 ms |

  In Chromium `load` comes slightly *before* the first frame. So the seconds on the iPhone come from what WebKit holds `load` for, plus the cold start of the app and of WebKit's processes. We can't measure WebKit here: there's no WebKit build or iPhone in this environment.

## Goals / Non-Goals

**Goals:**
- The launch colour ends at the web app's first drawn frame, whatever `load` waits for.
- A web app of an older server still works, through the end of the load and the cap.
- No blank frame between the colour and the page.

**Non-Goals:**
- A launch colour that follows the theme (see the proposal).
- Android.
- The system's cold start.

## Decisions

### D1. The page says it has drawn, through the bridge

`announcePainted()` in `shell.ts` calls `opentodoShell.painted()` once per page load, and only when the shell lists `first-paint`. In `main.tsx`, a component rendered beside `App` calls it from an effect, two animation frames after React's first commit. The first frame's callback runs before that frame is drawn and the second's runs after it, so by then the skeleton or the first screen is on screen.

The component sits outside `ErrorBoundary`, so an app that fails on its first render still makes the call, and its error screen shows at once. Every page the app's root renders makes the call: setup, sign-in, a reset or invitation link, and the app. Measured in Chromium, setup called it at 332 ms, sign-in at 343 ms and an invalid reset link at 356 ms, once each. Pages that aren't the app keep the end of the load: a single sign-on page of another origin has no bridge, the shell's own error screen ends the hold through the failure path, and the public shared-task page (`t.html`) isn't the app.

The frames have to be counted from the commit, not from `render()`: React commits later. Counted from `render()`, the call came 1 ms after the content appeared, before it was drawn. Counted from the commit, in Chromium at 390 px, it comes after the frame with the content: 238 ms against 222 ms at 1×, and 816 against 768 ms at 6×, one call per load.

The web view is at alpha 0, not hidden, so WebKit runs its frames at full speed and the callbacks fire (`shell-first-paint` D4).

Considered and dropped:
- **`didCommit`**: the response has started, but nothing is drawn yet.
- **`didCommit` plus a fixed delay**: a guess.
- **A script message from a `MutationObserver` in the shell's own user script**: it would have to guess what counts as content. The web app knows.

### D2. The shell shows its web view on the call

`BridgeHost.bridgedPainted()` posts `FirstPaint.painted` when interactive, as `pullHandled` does. `ShellController` observes it and calls `reveal()`. The background run's host is not interactive, so its hidden web view never shows the visible one.

`didFinish` and the cap stay as fallbacks: an older web app never calls the method, and a page that fails before drawing still has the cap.

### D3. A shared bridge fixture

`mobile/android/app/src/test/resources/bridge/painted.json` holds the capability, the method and the captured call, written from the real call by `shellBridge.fixture.test.ts`. `ShellDataTests` reads it. Android doesn't list the capability, so nothing calls it there.

## Data model, size

No op field, table or route. The bridge gains one method; the version stays 1. The entry chunk grows by a few dozen bytes gzip, well within the 148 KB budget.

## Interface budget

No screen changes: no chrome, property, destination, scroll region or shortcut.

## Risks / Trade-offs

- **Not compiled here.** The Swift is first compiled by CI's iOS job (build and `ShellDataTests`).
- **On a device**, the gain depends on how long WebKit holds `load` after the first frame. That's the device check: the time from the tap to the app, with this change and without it (`f93a5279`).
- **A frame that is drawn while the web view is at alpha 0** is drawn but not shown. The 0.2 s fade starts from it, so there's no blank frame.
