# Proposal

## Why

`native-shells` built the Android app and left iOS as its own change (`specs/native-shells/spec.md` "Follow-up shells share the contract"). On iPhone and iPad, OpenTodo today is the installed web app: offline and push work there since iOS 16.4, but the phone cannot put a capture into OpenTodo from another app's share sheet, cannot unlock an encrypted account with Face ID, and has no home-screen widget. Those are the three things a browser cannot do, and the bridge for them already exists, versioned, in `web/src/lib/shell.ts`.

The question the roadmap left open was `ROADMAP.md:188`: App Store review of a server-URL app, a Mac runner in CI, and whether reminders can be refreshed in the background often enough without push. This change answers the first (no store: the shell ships as source and the person building it signs it, like `make android`), and records measurements for the other two instead of guessing — see design D2 and D3.

## What Changes

- New `mobile/ios/`: a SwiftUI shell around a `WKWebView`, no third-party dependencies, that loads the web app from the address the user enters and offers the same bridge version 1 as the Android app with `platform: "ios"`.
- What it adds over the installed web app: the share sheet (text, links, files) into the capture screen, reminders without a push service scheduled on the device, a Today widget, and Face ID unlock of an encrypted account. Everything else is the web app, unchanged.
- The web app is not modified: `platform: "ios"` is already in the contract (`web/src/lib/shell.ts:39`) and no capability is added to bridge version 1.
- `make ios` builds and tests it on a Mac; a CI job builds it for pull requests that touch `mobile/ios/**`.
- Documentation: `docs/ios-app.md` (user guide, linked from `docs/install-phone.md`), a section in `mobile/README.md`, and the limitation the measurements force: **offline start needs the server's host in the app at build time** (design D2). Without it the shell shows an offline screen and needs the network.

No op schema, data model, server route or environment variable change. Not **BREAKING**.

**Out of scope**: App Store or TestFlight publication (design D7: AGPL-3.0 plus Apple's terms, and no developer account in this repository); push notifications through APNs (they would need a server-side sender, a new credential and a store review — a later change, if at all); the quick-add widget (WidgetKit has no text field; Android keeps it); iPad multitasking specifics; a Mac runner that signs release builds. ROADMAP.md item advanced: "Next: Native shells", row 2 (`ios-shell`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the shell requirements become platform-neutral where both shells behave the same (share sheet, reminders, widgets, release), and the offline requirement states the measured iOS constraint instead of assuming a service worker.
