# Proposal

## Why

People asked for an iPhone app they can install, not one they have to build (#105: "I mostly use task management on my phone … widgets and reminders … would be very useful"). The research reaches the same conclusion: an iOS web app cannot have widgets, Siri, Shortcuts or Live Activities, and self-hosted competitors lose iOS users because their only apps are broken third-party clients (research §3.1, "OS-Edge Capture Surfaces"). OpenTodo already has the app. `ios-shell` built it in `mobile/ios`, but it is source only. It has never run on a device (9 open tasks), and its design D7 kept it out of the App Store because of the AGPL.

This change finishes that work and ships the app. It also asks the owner the one question that blocks it: **under which licence the iOS shell's own code is published.**

## Owner decision needed: the licence of `mobile/ios`

The App Store's terms add usage rules (a device limit, no redistribution of the binary) that the AGPL-3.0 forbids adding to a licensed work (AGPL §10, "no further restrictions"). Projects under the GPL family have had their apps pulled for this. The shell bundles no AGPL code. It loads the web app at runtime from the user's own server, as Safari would, and links only Apple's frameworks. So only the shell's own Swift code needs a store-compatible licence.

| Option | What it means | Who must agree | Trade-off |
|---|---|---|---|
| **A. MIT for `mobile/ios/**` only (recommended)** | The shell's code, String Catalog, assets and project files are MIT. The server, web app, CLI and Android app stay AGPL-3.0-only. | Every copyright holder of `mobile/ios`: the owner and `sleuthy-sloth` (author of the first two shell commits, `3eb088da8` and `75c5946c3`), in writing on the pull request. | Someone could ship a closed fork of the shell, but it would only be a web view around someone's OpenTodo server. All the value stays AGPL on the server side. |
| B. AGPL with an App Store exception (an AGPL §7 additional permission) | The shell stays AGPL and gains a permission to be distributed under the store's terms. | The same people. | It needs custom licence text that nobody has tested in court, and every later contributor has to accept it. More legal surface for the same result as A. |
| C. No store (status quo) | iOS users keep building the app themselves. | Nobody. | #105 stays open. Most iPhone users never get widgets, Siri or Live Activities. |

**Recommendation: A.** It is the smallest licence surface that unblocks the store. It matches what the code is (a thin client with no server logic), and "MIT shell, AGPL server" is easy to explain in one sentence. If the owner chooses C, this change shrinks to section 1 of its tasks (finishing `ios-shell`) and stops there.

## What Changes

- **Finish `ios-shell` first.** Its open tasks (4.3, 5.2, 7.2 and the device runs 9.1 to 9.6) are completed and recorded in that change, and then it is archived. This change does not repeat them.
- **Licence (pending the owner's answer):** `mobile/ios/LICENSE` (MIT), SPDX headers on every file under `mobile/ios`, a line in `CONTRIBUTING.md` saying contributions to `mobile/ios` are MIT, and a repository check that keeps AGPL code out of `mobile/ios`.
- **Store-safe share hand-over.** The share extension stops opening the app through the responder chain's `openURL:`, which App Review rejects (ios-shell D5). It saves the share to the App Group and confirms in its own sheet. The app opens the capture screen with the share the next time it comes to the front.
- **A signed release in CI.** On final `v*` tags, CI archives and signs the app with secrets held by the project and uploads it to TestFlight. Release candidates upload nothing. Without the secrets, the job skips signing with a warning, as the Android job does.
- **Listing material in the repository:** `mobile/ios/store/` holds the store texts in six languages, the App Privacy answers ("Data Not Collected"), the export compliance answer, the App Review notes (pointing at the public demo instance, so a reviewer needs no account) and a screenshot script.
- **A public TestFlight group** for testers. It is linked from `docs/ios-app.md` and from the call for testers (#9).
- **Docs.** `docs/ios-app.md` starts with "Install from the App Store" and keeps "Build it yourself" as the second path. `docs/install-phone.md`, `mobile/README.md` and `RELEASING.md` (the manual review submission step) follow.

No op, field, route, migration or environment variable. Not **BREAKING**.

## Out of scope

- The App Intents, the extra widgets and the Live Activity: `apple-shortcuts` and `focus-live-activity`. They make the app stronger in review (guideline 4.2, minimum functionality) but are not required to submit it.
- APNs push. ios-shell D3 still holds: it would need a server sender and a credential per instance.
- Offline start in the store build. The store build is the portable build. iOS gives a service worker only to hosts fixed at build time, so the store app cannot know your server (ios-shell D2). The one-server build stays available from source.
- A Mac app, a watch app, iPad-specific layouts.
- Self-service account deletion. App Review guideline 5.1.1(v) can ask for it in apps that create accounts. If review demands it, it becomes its own change (`self-account-deletion`). Design D6 explains why we expect not to need it.

ROADMAP item advanced: "Next: Native shells", row 2 (`ios-shell` → distribution), and milestone 0.20 "Everywhere" of the 1.0 plan.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the iOS app is published through TestFlight and the App Store as well as built from source. The release requirement covers a signed iOS build. The iOS share hand-over no longer opens the app from the extension. These deltas are written against `native-shells` as it reads **after `ios-shell` is archived**. That archive is the first task here.

## Impact

- **Data model, sync, op schema:** none.
- **E2EE:** none. The shell stores the same things as before (ios-shell "Data model impact").
- **API, CLI, MCP, CalDAV, vault:** none.
- **Server binary and image:** unchanged. **App:** no new dependency. The share change removes code. The signed archive is about the size of today's 1.2 MB app.
- **Repository:** `mobile/ios/LICENSE`, `mobile/ios/store/`, a CI job step with six new repository secrets in a `release` environment (the App Store Connect API key as id, issuer and key file; the distribution certificate and its password; the provisioning profiles), and the repository checks.
- **Cost:** an Apple Developer Program membership (USD 99 a year) held by the project. See design D2.

Fixes #105
Relates to #9
