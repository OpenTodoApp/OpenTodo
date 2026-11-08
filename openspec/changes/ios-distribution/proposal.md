# Proposal

## Why

People asked for an iPhone app they can install, not one they have to build (#105: "I mostly use task management on my phone … widgets and reminders … would be very useful"). The research reaches the same conclusion: an iOS web app cannot have widgets, Siri, Shortcuts or Live Activities, and self-hosted competitors lose iOS users because their only apps are broken third-party clients (research §3.1, "OS-Edge Capture Surfaces"). OpenTodo already has the app. `ios-shell` built it in `mobile/ios`, but it is source only. It has never run on a device (9 open tasks), and its design D7 kept it out of the App Store because of the AGPL.

This change finishes that work and ships the app through TestFlight and the App Store.

## Owner decision (2026-11-08): distribution through Apple's store

The iPhone app is distributed through TestFlight and the App Store. As the copyright holder, the author allows distributing OpenTodo's iOS app through Apple's App Store and TestFlight. The code stays under AGPL-3.0, and anyone can still build the app from source.

This replaces the licence question the first version of this proposal asked (an MIT licence for `mobile/ios`, an AGPL §7 exception, or no store). Design D1 records it.

## What Changes

- **Finish `ios-shell` first.** Its open tasks (4.3, 5.2, 7.2 and the device runs 9.1 to 9.6) are completed and recorded in that change, and then it is archived. This change does not repeat them.
- **The permission, written down.** `docs/ios-app.md`, `docs/install-phone.md` and `mobile/README.md` say that the official build comes from TestFlight or the App Store, that building it yourself stays possible, and state the author's permission in one sentence.
- **Store-safe share hand-over.** The share extension stops opening the app through the responder chain's `openURL:`, which App Review rejects (ios-shell D5). It saves the share to the App Group and confirms in its own sheet. The app opens the capture screen with the share the next time it comes to the front.
- **A signed upload in CI, without a Mac and without stored certificates.** After the GitHub release of a final `v*` tag, a job archives the app, signs it with a distribution certificate and profiles it makes for that run through the App Store Connect API, uploads it to TestFlight, sets "What to test" from the CHANGELOG, and revokes the certificate again. The owner can run the same job by hand for any ref. Release candidates upload nothing. Without the secrets, the job warns and succeeds, as the Google Play upload does.
- **Bundle IDs registered by CI.** A script registers `app.opentodo`, `app.opentodo.widget` and `app.opentodo.share` with App Groups when they are missing, before every archive, and a manual job does only that and reports, so the owner sees whether `app.opentodo` is free before creating the app record.
- **Listing material in the repository:** `mobile/ios/store/` holds the store texts, the App Privacy answers ("Data Not Collected"), the export compliance answer, the App Review notes (pointing at the public demo instance, so a reviewer needs no account) and a screenshot script.
- **A public TestFlight group** for testers. It is linked from `docs/ios-app.md` and from the call for testers (#9).
- **Docs.** `docs/ios-app.md` starts with installing from TestFlight or the App Store and keeps "Build it yourself" as the second path. `docs/install-phone.md`, `docs/troubleshooting.md`, `mobile/README.md` and `RELEASING.md` (the TestFlight step and the manual review submission) follow.

No op, field, route, migration or environment variable. Not **BREAKING**.

## Out of scope

- The App Intents, the extra widgets and the Live Activity: `apple-shortcuts` and `focus-live-activity`. They make the app stronger in review (guideline 4.2, minimum functionality) but are not required to submit it.
- APNs push. ios-shell D3 still holds: it would need a server sender and a credential per instance.
- Offline start in the store build. The store build is the portable build. iOS gives a service worker only to hosts fixed at build time, so the store app cannot know your server (ios-shell D2). The one-server build stays available from source.
- Submitting for review from CI. A person submits each build in App Store Connect.
- A Mac app, a watch app, iPad-specific layouts.
- Self-service account deletion. App Review guideline 5.1.1(v) can ask for it in apps that create accounts. If review demands it, it becomes its own change (`self-account-deletion`). Design D6 explains why we expect not to need it.

ROADMAP item advanced: "Next: Native shells", row 2 (`ios-shell` → distribution), and milestone 0.20 "Everywhere" of the 1.0 plan.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the iOS app is published through TestFlight and the App Store as well as built from source. The release requirement covers a signed iOS upload. The iOS share hand-over no longer opens the app from the extension. These deltas are written against `native-shells` as it reads **after `ios-shell` is archived**. That archive is the first task here.

## Impact

- **Data model, sync, op schema:** none.
- **E2EE:** none. The shell stores the same things as before (ios-shell "Data model impact").
- **API, CLI, MCP, CalDAV, vault:** none.
- **Server binary and image:** unchanged. **App:** no new dependency. The share change removes code. The signed archive is about the size of today's 1.2 MB app.
- **Repository:** `mobile/ios/store/`, `scripts/release/appstore.mjs` (App Store Connect, Node's standard library, like `play-upload.mjs`), `scripts/release/ios-testflight.sh` (the Xcode steps), the workflows `ios-testflight.yml` and `ios-register-ids.yml`, and four secrets in the `release` environment: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8`. No certificate or profile is stored anywhere.
- **Cost:** an Apple Developer Program membership (USD 99 a year). See design D2.

Fixes #105
Relates to #9
