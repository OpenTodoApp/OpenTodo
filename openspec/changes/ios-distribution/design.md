# Design

## Context

`ios-shell` built a SwiftUI shell around `WKWebView` in `mobile/ios`, with the same bridge version 1 as Android, a share extension, a Today widget, reminders scheduled on the device and Face ID unlock. Its D7 kept it out of every store for two reasons: the AGPL and the App Store's terms do not fit, and the repository had no Apple Developer account. Its tasks file has nine open items. All but the CI one need a real iPhone.

This change is the step from source to store. The code changes are small: one share hand-over and the signing pipeline. Most of the work is the device runs and the listing. The owner settled distribution on 2026-11-08 (D1) and has a paid team.

## Goals / Non-Goals

**Goals:**
- An OpenTodo app any iPhone or iPad user can install from the App Store and point at their own server.
- A TestFlight group that testers can join from a link.
- A release pipeline that needs no Mac at all: signed and uploaded in CI after final tags and on demand, submitted for review by hand.
- Building from source keeps working, with or without a paid team.

**Non-Goals:**
- New native features (`apple-shortcuts`, `focus-live-activity`), APNs, a Mac app, offline start in the store build.

## Decisions

**D1. Distribution through Apple's store with the author's permission (owner decision, 2026-11-08).**
The iPhone app is distributed through TestFlight and the App Store. As the copyright holder, the author allows distributing OpenTodo's iOS app through Apple's App Store and TestFlight. The code under `mobile/ios` stays AGPL-3.0, like the rest of the repository, and the docs keep building from source as a supported path. The docs state the permission in one sentence and make no other legal claim.

This replaces the earlier proposal to relicense `mobile/ios` under MIT, an AGPL §7 exception, or staying out of the store. Those options, the SPDX headers and the licence repository check are dropped. One thing from that analysis stays open: `git log -- mobile/ios` shows a second author, `sleuthy-sloth` (`3eb088da8`, `75c5946c3`). Task 2.2 asks them for the same permission for their two commits, and their content is rewritten by the owner if they decline.

**D2. The Apple Developer account belongs to the project's organisation.**
Enrol "OpenTodoApp" as an organisation, so the store shows the project as the seller and the account can pass to another maintainer later. An individual account would show a personal name forever and cannot be transferred. An organisation needs a D-U-N-S number (free, a few days) and USD 99 a year. The project pays this; users never pay anything ("Free forever" in the anti-roadmap). If the owner prefers not to hold an organisation account, an individual account works with the same pipeline, and only the seller name changes.

Bundle identifiers are `app.open-todo.ios`, `app.open-todo.ios.widget` and `app.open-todo.ios.share`, with the App Group `group.app.open-todo`, all registered to that team by CI (D9). They differ from Android's `app.opentodo` because Apple refused that identifier: another developer team holds it, so the iOS prefix comes from the project's domain open-todo.app. A self-builder keeps changing the prefix in `project.yml` as `docs/ios-app.md` already explains.

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

**D5. Signed and uploaded in CI, submitted for review by hand.**
The `ios` job keeps building unsigned on pull requests that touch `mobile/ios/**` and on tags. After the GitHub release of a final `v*` tag (no `-rc` suffix, the same rule as the Play upload), the `ios-testflight` job uploads the app to TestFlight; D9 is how. The owner can run the same workflow by hand for any ref. Without the secrets, the job warns and succeeds.

Nothing is submitted for review automatically. The owner adds the build to the external TestFlight group and submits it for App Store review in App Store Connect. That is one step in RELEASING.md. Review is a human gate and outcomes vary, so a release never waits on it.

The `.ipa` is not attached to the GitHub release. Apple re-signs store builds, and a store-signed `.ipa` installs on no other device. The release notes link the store listing instead.

**D6. App Review: the demo instance, the minimum-functionality case, account deletion.**
- **A server to review against.** The review notes give `https://demo.open-todo.app` and say "Try the demo" needs no account (`demo-mode`: a private sandbox per visitor). A server-URL app without a reviewable server is the commonest rejection reason for self-hosted clients.
- **Guideline 4.2 (minimum functionality).** The notes list what the app adds over Safari: the share sheet, the Today widget, reminders scheduled on the device, and Face ID unlock of an encrypted account. Once `apple-shortcuts` and `focus-live-activity` ship, the notes also list Siri, Shortcuts, lock-screen widgets and the Live Activity. Submitting after those two is stronger but not required.
- **Guideline 5.1.1(v) (account deletion).** The app does not create accounts. Accounts are created on the user's own server by its owner or through that server's web sign-up, and the demo uses throwaway sandboxes. The review notes say so. If a reviewer still asks, the follow-up is a self-service deletion change (proposal, out of scope). It is not hidden behind a store-only switch.
- **Guideline 4.8 (Sign in with Apple).** Sign-in happens on the user's own server with that server's own accounts or the identity provider its owner configured, which 4.8 exempts. The notes say so.

**D7. Privacy and export compliance.**
App Privacy: "Data Not Collected". The shell sends nothing anywhere but the configured server (native-shells). The privacy manifests declare what the code touches: the app `UserDefaults` (CA92.1) and file metadata (C617.1, the size of shared files in the App Group), the share extension file metadata (C617.1) in a manifest of its own, the widget nothing. A unit test checks that both manifests are in the built app.

Export compliance: `ITSAppUsesNonExemptEncryption` is `NO`. The app contains no encryption code of its own. HTTPS and the Keychain are the system's, and the web app's end-to-end encryption (AES-GCM, AES-KW, PBKDF2, HKDF) runs in WebKit's Web Crypto, loaded from the user's server, protecting the user's own data with standard algorithms. Apple treats encryption limited to the operating system's own, and standard encryption for authentication or the user's own data, as exempt. `mobile/ios/store/export-compliance.md` keeps that reasoning and says when to check it again (a bundled crypto library, an algorithm implemented in the app). A unit test checks the key is in the bundle.

**D8. Store texts, screenshots and languages.**
`mobile/ios/store/listing/<lang>.txt` in the six languages the Android listing has (en, de, fr, es, it, pt), with the same facts: your own server, no data collected, what the app adds, and the offline limitation (D3). Screenshots come from a UI test that runs against a local server seeded with the demo data at the iPhone 6.9" and iPad 13" sizes, so they can be regenerated each release without a designer. The shell's new strings (the share sheet in D4) are added to the String Catalog in the six languages. That widens the catalog from five to six languages (Portuguese is missing), checked by `scripts/i18n/shell.test.mjs`.

**D9. The TestFlight job: no Mac, no stored certificate.**
The owner has no Mac and no Keychain to export a certificate from, so everything Xcode would do interactively happens in CI with the team's App Store Connect API key. The secrets are in the `release` environment: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8` (the `.p8` content). Nothing else is stored: no certificate, no profile, no password, in the repository or in secrets.

*Signing approach.* The first plan was `xcodebuild -allowProvisioningUpdates` with `-authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID`, letting Xcode create and fetch a cloud-managed distribution certificate and the profiles. It is not used, for three reasons found before the first run:
- Archiving with automatic signing signs for development first. That needs an Apple Development certificate (a new one on every fresh runner) and a development profile, which needs at least one registered device.
- Cloud-managed distribution certificates are reported refused to API keys below the Admin role (a 403 on `certificates?filter[certificateType]=DISTRIBUTION_MANAGED`, Apple Developer Forums thread 690676). The owner's key is App Manager.
- Apple's own engineer: "Running xcodebuild with the authentication API keys only supports exporting archives. This workflow doesn't support building and archiving." (forums thread 763225). Projects that tried the export step on hosted runners still report Xcode's sign-in refusing the key.

So the job uses the documented REST API instead, and plain Xcode:
1. `scripts/release/appstore.mjs register` registers the three bundle IDs when missing and turns on `APP_GROUPS`, the one capability the entitlements need. It is safe to repeat. A 409 when registering means another team holds the identifier, and the script says to pick a new prefix and where to change it. It also warns when the bundle IDs' team prefix differs from `APPLE_TEAM_ID`.
2. The archive is built with `CODE_SIGNING_ALLOWED=NO` and signed ad hoc with each target's entitlements, plus the application identifier and team that Xcode would add (`scripts/release/ios-testflight.sh archive`). No development certificate, profile or device is involved. The `ios` job runs this same step on every iOS change with a placeholder team, so a broken archive shows up on the pull request, not on release day.
3. A 2048-bit RSA key and its CSR are generated on the runner. `appstore.mjs sign` creates an Apple Distribution certificate from the CSR and one `IOS_APP_STORE` profile per bundle ID, checks that each profile carries `group.app.open-todo`, and writes a manual-signing `ExportOptions.plist` (`app-store-connect`, `manageAppVersionAndBuildNumber` false). The key and certificate go into a keychain made for the run.
4. `xcodebuild -exportArchive` signs for the App Store. `xcrun altool --upload-package` uploads with the API key (`--upload-app` is deprecated). altool's own success line decides, not its exit code, which is unreliable across Xcode versions.
5. `appstore.mjs notes` waits for the build to appear (up to 20 minutes) and sets the English "What to test" from the version's CHANGELOG section (4,000 characters at most), or a plain line for a build between releases.
6. An `always()` step revokes the certificate, deletes the profiles, the keychain and the key file. The certificate and profile ids are written to a state file as they are made, so a failure halfway still cleans up. Builds already uploaded stay valid because Apple re-signs what it distributes.

The App Group itself is the one thing the API cannot do: Apple offers no endpoint to create an App Group or assign one to a bundle ID. The owner registers `group.app.open-todo` once on developer.apple.com and ticks it on the three identifiers. The registration report and the signing step both say so, and signing stops with those steps when a profile lacks the group.

Creating a certificate per run has two costs: Apple emails the account holder when a certificate is created and revoked, and a team may hold only a few Apple Distribution certificates. The workflow runs one upload at a time (`concurrency: ios-testflight`), and the cleanup step keeps the count at zero between runs. If the App Manager role turns out to be refused for creating certificates (a 403 on `/v1/certificates`), the error says to make an Admin key; that is a change of secret, not of code.

The job selects the newest stable Xcode on the runner, because App Store Connect accepts only builds made with a current SDK, while the runner's default Xcode can be older.

Rejected: fastlane (`match`, `cert`, `sigh`). It is a Ruby toolchain and a dependency tree for a handful of REST calls, against AGENTS rule 6, and `match` needs a repository or bucket of encrypted certificates, which the owner does not want. The App Store Connect calls use Node's standard library, as `play-upload.mjs` already does (an ES256 JWT with `node:crypto`), and are tested on Linux against a fake API.

*Versions and build numbers.* `CFBundleShortVersionString` is the release version from the tag (`v1.2.0` → `1.2.0`); a manual run of a branch or commit uses the last tag's version, a release candidate its final version. `CFBundleVersion` is `major·10000 + minor·100 + patch` (`10200`), as on Android. TestFlight refuses a second build with the same number for a version, so a later upload of the same version adds `.1`, `.2`, … (`10200.1`): the job lists the version's builds and takes the next free one. A manual run can name a build number instead. Both forms sort above every build of the previous version and below the next one. A version Apple has already released on the App Store is closed for new builds; the upload then fails with Apple's message, and the next tag fixes it.

*Triggers and failures.*
- A final tag: after the GitHub release succeeds. Release candidates upload nothing.
- **Actions → iOS TestFlight → Run workflow** with a ref: the same job, for the first upload or a re-upload.
- **Actions → iOS register IDs → Run workflow**: registration and the report only.
- Missing secrets: a warning, and the job succeeds.
- Anything else (a taken bundle ID, no app record, a profile without the App Group, a refused key, a failed export or upload): the job fails with Apple's message and what to do. The release is already published by then and is not affected; the Play upload and the other publishing jobs do not depend on it.
- "What to test" that cannot be set in time: a warning, the upload still counts.

## Data model impact

None. No op, field, route, migration or environment variable.

## Size

No dependency is added. The store app is the existing app, about 1.2 MB, minus the responder-chain code. Server image, binary and memory: unchanged.

## Progressive disclosure

Nothing changes in the web app. Simple-list users see nothing new. The only new screen is the share extension's confirmation sheet, which appears only after the user shares into OpenTodo.

## Risks

- **Rejection under 4.2.** Mitigation: the review notes (D6), and if needed resubmitting after `apple-shortcuts`.
- **No offline start in the store app** (D3). This is documented and cannot be fixed on iOS.
- **The App Store Connect key in CI.** It can create certificates and upload builds for the team. Mitigations: it lives only in the `release` environment, read by two jobs that a repository check names; the TestFlight job runs after a tag, which only organisation admins can create (RELEASING.md), or by hand; every certificate it makes is revoked at the end of the run.
- **The signing path can only be proven with the real key.** The unsigned archive and its ad hoc signature run on every iOS pull request; the REST calls are tested against a fake API; the first manual run is the proof for the rest.
- **The second author's permission** (D1). If it is not given, the owner rewrites those two commits' content.

## Owner questions

1. ~~The licence of `mobile/ios`.~~ Settled 2026-11-08 (D1).
2. An organisation or an individual Apple Developer account (D2). The team exists (`APPLE_TEAM_ID`).
3. Confirm the export compliance answer (D7, `mobile/ios/store/export-compliance.md`) before the first submission.
