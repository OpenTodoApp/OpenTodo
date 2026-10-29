# Design

## Context

`ios-shell` built a SwiftUI shell around `WKWebView` in `mobile/ios`, with the same bridge version 1 as Android, a share extension, a Today widget, reminders scheduled on the device and Face ID unlock. Its D7 kept it out of every store for two reasons: the AGPL and the App Store's terms do not fit, and the repository had no Apple Developer account. Its tasks file has nine open items. All but the CI one need a real iPhone.

This change is the step from source to store. The code changes are small: one share hand-over and the signing pipeline. Most of the work is the device runs, the licence and the listing.

## Goals / Non-Goals

**Goals:**
- An OpenTodo app any iPhone or iPad user can install from the App Store and point at their own server.
- A TestFlight group that testers can join from a link.
- A release pipeline that needs no Mac on the owner's desk: signed in CI on final tags, submitted for review by hand.
- Building from source keeps working, with or without a paid team.

**Non-Goals:**
- New native features (`apple-shortcuts`, `focus-live-activity`), APNs, a Mac app, offline start in the store build.

## Decisions

**D1. The licence of `mobile/ios`: MIT, with the server and the web app staying AGPL (owner decision).**
The store's terms add restrictions that AGPL §10 forbids, and the copyleft cannot be waived for one channel without the copyright holders' consent. The shell needs none of the AGPL code. It bundles no copy of the web app (native-shells "A shell loads the user's server and nothing else"), links only system frameworks (ios-shell D1), and talks to the web app through a documented bridge. That makes it a separate program: the web app runs inside it the way it runs inside Safari.

Alternatives, each with the consent it needs, are in the proposal: an AGPL §7 App Store exception (more custom text, same consent), or staying out of the store. Three facts make MIT workable:
- **Authors.** `git log -- mobile/ios` shows two authors: the owner and `sleuthy-sloth` (`3eb088da8` "a Swift shell with the same bridge", `75c5946c3` "the review's fixes"). Both give written consent on the licence pull request before anything is relicensed. Without the second consent, those commits' content is rewritten by the owner before the relicence.
- **Ported logic.** Large parts of the Swift code mirror the Android Kotlin (address rules, health check, schedule cap). The owner wrote that Kotlin (`git log -- mobile/android`: the owner and dependabot), so the port is the owner's to license.
- **Strings.** The String Catalog `mobile/ios/Shared/Localizable.xcstrings` must not copy sentences from `web/src/locales`, whose translations have other contributors. Task 2.4 checks each entry against the locale files and rewrites any copied entry.

A repository check keeps it that way. Every file under `mobile/ios` carries `SPDX-License-Identifier: MIT` where the format has comments. The iOS test target may read the shared bridge fixtures from `web/` at test time, but they are not bundled. Nothing outside `mobile/ios` is compiled into the app.

**D2. The Apple Developer account belongs to the project's organisation.**
Enrol "OpenTodoApp" as an organisation, so the store shows the project as the seller and the account can pass to another maintainer later. An individual account would show a personal name forever and cannot be transferred. An organisation needs a D-U-N-S number (free, a few days) and USD 99 a year. The project pays this; users never pay anything ("Free forever" in the anti-roadmap). If the owner prefers not to hold an organisation account, an individual account works with the same pipeline, and only the seller name changes. **Owner question 2.**

Bundle identifiers stay `app.opentodo`, `app.opentodo.widget` and `app.opentodo.share`, with the App Group `group.app.opentodo`, all registered to that team. A self-builder keeps changing the prefix in `project.yml` as `docs/ios-app.md` already explains.

**D3. The store build is the portable build.**
iOS gives a `WKWebView` a service worker only for hosts listed in `WKAppBoundDomains` at build time (ios-shell D2, measured). A store app cannot know your server, so it ships without app-bound domains. It loads any https server and shows the offline screen when the server cannot be reached. This is the most visible difference from the installed web app, so the listing and `docs/ios-app.md` say it plainly: for offline start, use the installed web app or build the one-server variant.

Rejected: a store build with a fixed list of hosts (useful to nobody but those hosts), and shipping a bundled copy of the web app as a fallback (it breaks native-shells "SHALL NOT bundle a copy of the web app" and the matching of web app and server versions).

**D4. The share extension stops opening the app.**
ios-shell D5 opens the containing app from the share extension through the responder chain's `openURL:`. App Review rejects that, and Apple offers no public API for it. The new flow:
1. The extension copies the share into the App Group inbox exactly as today (same limits, same `ShareInbox` hygiene, D13 there), then shows its own small sheet: "Saved for OpenTodo. Open OpenTodo to finish." with **Done**. The sheet uses the String Catalog and works with VoiceOver and Dynamic Type.
2. Whenever the app becomes active (launch or return to the foreground), and a server is configured, it reads the inbox. When the inbox holds an entry, it opens `/share?…&files=1` as it does today and hands the files over.
3. An entry not handed over within 24 hours is deleted. One new share replaces an older entry that was never handed over (ios-shell D13). The sheet says so when it replaces one.

Nothing is saved as a task before the capture screen's Save, as before. The cost is one extra tap: the user opens the app. Alternatives considered:
- An App Intent that opens the app. A share extension cannot run one either.
- A share extension that creates the task itself through the REST API. Rejected: a second API client with its own credential, and no encryption on encrypted accounts (ios-shell D3 rejected native REST for the same reasons).

**D5. Signing and upload in CI, review submission by hand.**
The existing `ios` job builds unsigned on pull requests that touch `mobile/ios/**` and on tags. New, on final tags only (no `-rc` suffix, same rule as RELEASING.md's store updates):
- The job imports the distribution certificate into a temporary keychain and installs the three provisioning profiles. All of it comes from repository secrets: `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD`, `IOS_PROFILES_TAR_BASE64`, plus the App Store Connect API key, `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8_BASE64`. It archives with `xcodebuild archive`, exports with an `ExportOptions.plist` for `app-store-connect`, uploads with `xcrun altool --upload-package` and the API key, then deletes the keychain and the files.
- Without the secrets, the job logs a warning and stops after the unsigned build, as the Android job does today.
- Nothing is submitted for review automatically. The owner assigns the build to the external TestFlight group and submits it for App Store review in App Store Connect. That is one new step in RELEASING.md. Review is a human gate and outcomes vary, so a release must never wait on it.

The `.ipa` is not attached to the GitHub release. Apple re-signs store builds, and a store-signed `.ipa` installs on no other device. The release notes link the store listing instead.

Rejected: fastlane. It is a Ruby toolchain and a dependency tree for three commands, against AGENTS rule 6.

**D6. App Review: the demo instance, the minimum-functionality case, account deletion.**
- **A server to review against.** The review notes give `https://demo.open-todo.app` and say "Try the demo" needs no account (`demo-mode`: a private sandbox per visitor). A server-URL app without a reviewable server is the commonest rejection reason for self-hosted clients.
- **Guideline 4.2 (minimum functionality).** The notes list what the app adds over Safari: the share sheet, the Today widget, reminders scheduled on the device, and Face ID unlock of an encrypted account. Once `apple-shortcuts` and `focus-live-activity` ship, the notes also list Siri, Shortcuts, lock-screen widgets and the Live Activity. Submitting after those two is stronger but not required.
- **Guideline 5.1.1(v) (account deletion).** The app does not create accounts. Accounts are created on the user's own server by its owner or through that server's web sign-up, and the demo uses throwaway sandboxes. The review notes say so. If a reviewer still asks, the follow-up is a self-service deletion change (proposal, out of scope). It is not hidden behind a store-only switch.
- **Guideline 4.8 (Sign in with Apple).** Sign-in happens on the user's own server with that server's own accounts or the identity provider its owner configured, which 4.8 exempts. The notes say so.

**D7. Privacy and export compliance.**
App Privacy: "Data Not Collected". The shell sends nothing anywhere but the configured server (native-shells). `PrivacyInfo.xcprivacy` already declares `UserDefaults` and no tracking. Export compliance: the app uses only the encryption the system provides (HTTPS, the Keychain, and WebKit's Web Crypto used by the web app's end-to-end encryption), which falls under the standard-encryption exemption. `ITSAppUsesNonExemptEncryption` is set to `NO`, and the answer and its reasoning are written in `mobile/ios/store/export-compliance.md` so the owner can confirm it before the first submission. **Owner question 3** (confirming this answer).

**D8. Store texts, screenshots and languages.**
`mobile/ios/store/listing/<lang>.txt` in the six languages the Android listing has (en, de, fr, es, it, pt), with the same facts: your own server, no data collected, what the app adds, and the offline limitation (D3). Screenshots come from a UI test that runs against a local server seeded with the demo data at the iPhone 6.9" and iPad 13" sizes, so they can be regenerated each release without a designer. The shell's new strings (the share sheet in D4) are added to the String Catalog in the six languages. That widens the catalog from five to six languages (Portuguese is missing), checked by `scripts/i18n/shell.test.mjs`.

## Data model impact

None. No op, field, route, migration or environment variable.

## Size

No dependency is added. The store app is the existing app, about 1.2 MB, minus the responder-chain code. Server image, binary and memory: unchanged.

## Progressive disclosure

Nothing changes in the web app. Simple-list users see nothing new. The only new screen is the share extension's confirmation sheet, which appears only after the user shares into OpenTodo.

## Risks

- **Rejection under 4.2.** Mitigation: the review notes (D6), and if needed resubmitting after `apple-shortcuts`.
- **No offline start in the store app** (D3). This is documented and cannot be fixed on iOS.
- **Secrets in CI.** A leaked distribution certificate lets someone sign as the project. Mitigations: the job runs only on tag pushes, which only organisation admins can create (RELEASING.md); the secrets are scoped to a `release` environment that requires approval; the keychain is temporary.
- **Consent not given** for D1. Then the owner rewrites the affected code before relicensing, or the owner chooses option C.

## Owner questions

1. The licence of `mobile/ios` (proposal table). Recommendation: MIT.
2. An organisation or an individual Apple Developer account, and who pays the yearly fee (D2). Recommendation: organisation, paid by the project.
3. Confirm the export compliance answer (D7) before the first submission.
