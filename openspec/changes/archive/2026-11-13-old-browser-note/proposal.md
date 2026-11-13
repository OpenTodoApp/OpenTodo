# Proposal

## Why

The web app's interface needs the CSS of Chrome and Android System WebView 111, Safari 16.4 and Firefox 128 (oklch and color-mix colours, container queries). On an older engine it loads into a blank or broken page with no explanation. The Android app shows the server through the system WebView, which some phones (without Google Play services) cannot update, so the app looked like it could not connect (issue #1259). Polyfills cannot bring this CSS to an old engine.

## What Changes

- **A plain note for an old engine.** A small classic script, run before the app, checks for that CSS and, when it is missing, shows a note in the browser's language (the eight shipped languages, else English): the minimum versions, the engine it found, and, for Android, to use a browser with its own engine.
- **The Android guide states the WebView it needs** (111 or later).
- No change for current browsers; no new route (a file of the web app).

## Capabilities

### New Capabilities

### Modified Capabilities

- `web-app`: a requirement for the old-engine note.

## Impact

`web/public/browser-check.js`, `web/index.html`, a test, `docs/android-app.md`.
