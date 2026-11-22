# Proposal

## Why

The iPhone app opens on its launch colour, as `shell-first-paint` intended, but the colour stays for a few seconds on nearly every launch (GitHub issue [#1755](https://github.com/OpenTodoApp/OpenTodo/issues/1755)). The server and the page are fast: the page answers in about 0.15 s, and in Chromium on a phone-sized window the web app draws its loading skeleton 0.26 s after the start (0.76 s at 6× CPU throttling).

The shell waits for something else: it keeps the web view hidden until WebKit reports the end of the page's load (`didFinish`), five seconds at most. `load` waits for every resource the page asked for before it, not for the first frame. The web app asks for many of those on its own before the first render (the language, a dozen lazily loaded parts, a font), and WebKit may count more of them than Chromium does. Whatever WebKit counts, the person sees nothing until the last one arrives, or until the five-second cap.

## What Changes

- **The web app says when it has drawn.** After its first frame with its own content (the loading skeleton or a screen), it calls a new bridge method, `painted`, in a shell that lists the capability `first-paint`.
- **The iOS shell shows its web view on that call**, and lists `first-paint` in the visible app only. The end of the load and the five-second cap stay as fallbacks, for a web app of an older server and for a page that never draws.

Out of scope:
- **A launch colour that follows the last theme**, the issue's second suggestion. iOS draws the launch screen from a static resource before any of the app's code runs, so it can't read a preference. `shell-first-paint` D1 chose the phone's appearance on purpose, and the remembered bars come with the page.
- **Android.** It shows its web view through the platform's visual-state callback after the page's load (`shell-first-paint` D3), and it doesn't list `first-paint`. Moving it to the same call is a follow-up once the iPhone is measured on a device.
- **The cold start of the app and of WebKit's processes.** These are the system's.

Advances the ROADMAP item "Shells that feel native" (follow-up to `shell-first-paint`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the web app says when its first frame is drawn (`first-paint`, `painted`), and the iOS launch screen ends there.

## Impact

- `web/src/lib/shell.ts` gets the capability, the method and `announcePainted()`. `web/src/main.tsx` calls it after the first render's frame. A shared bridge fixture is added.
- `mobile/ios`: `Bridge.swift` (capability, method, page script), `BridgeHost.swift`, and `ShellView.swift`, which shows the web view on the call.
- No server change, no op field, no new string, no new environment variable, no dependency. The entry chunk grows by a few dozen bytes gzip.
