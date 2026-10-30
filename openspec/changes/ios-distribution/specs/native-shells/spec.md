## ADDED Requirements

### Requirement: The iOS shell's own licence
The files under `mobile/ios` SHALL be published under the MIT licence named in `mobile/ios/LICENSE`, and the rest of the repository SHALL stay under AGPL-3.0-only. Every source, project and string file under `mobile/ios` whose format allows a comment SHALL carry `SPDX-License-Identifier: MIT`. The iOS app SHALL compile and bundle nothing from outside `mobile/ios`. Its test target MAY read the shared bridge fixtures from `web/` at test time, but SHALL NOT bundle them. The repository checks SHALL fail when a file under `mobile/ios` lacks the identifier, names another licence, or when the app's build inputs reach outside `mobile/ios`.

#### Scenario: A file without the identifier
- **WHEN** a pull request adds `mobile/ios/OpenTodo/Intents.swift` without an SPDX line
- **THEN** `make repo-check` fails and names the file

#### Scenario: Code copied in from the web app
- **WHEN** a pull request adds a build input to the iOS app target that points into `web/src`
- **THEN** `make repo-check` fails, saying that the iOS app may not compile or bundle files from outside `mobile/ios`

#### Scenario: Server licence unchanged
- **WHEN** a reader opens the README's licence section and `mobile/ios/LICENSE`
- **THEN** the README names AGPL-3.0-only for the project, with `mobile/ios` (MIT) and `templates/` (CC BY 4.0) as the only exceptions, the root `LICENSE` file still holds the unchanged AGPL text, and `mobile/ios/LICENSE` holds the MIT text

### Requirement: iOS store listing and review material
The repository SHALL hold, under `mobile/ios/store/`, the App Store listing texts in English, German, French, Spanish, Italian and Portuguese, the App Privacy answers ("Data Not Collected"), the export compliance answer with its reasoning, the App Review notes, and the script that produces the screenshots. The listing SHALL state that the app needs the user's own OpenTodo server, that it collects no data, and that it does not start offline (only the installed web app or a build for one known server does). The review notes SHALL name the public demo instance as the server to review against and SHALL list what the app does beyond a browser.

#### Scenario: Listing in every language
- **WHEN** `make repo-check` runs
- **THEN** it fails if any of the six listing files is missing, is empty, or lacks the sentence about the user's own server

#### Scenario: Reviewer without an account
- **WHEN** an App Review reviewer follows the review notes
- **THEN** they enter `demo.open-todo.app`, choose "Try the demo" and reach a populated Today list without creating an account

## MODIFIED Requirements

### Requirement: The iOS app is built and signed by whoever runs it
The iOS shell SHALL be source in `mobile/ios`, buildable with Xcode against iOS 16.4 or later and signed with the builder's own team, and the project SHALL also publish it through TestFlight and the App Store under the project's team. Both builds SHALL come from the same source with no store-only code path. Neither SHALL bundle a copy of the web app. Both SHALL link only system frameworks and list no third-party dependency. The app SHALL declare the App Group it shares with its extensions, the local-network usage text and the privacy manifest, and it SHALL collect no usage data, as the other shells do. The published build SHALL be the portable build: no app-bound domain, so no offline start (see "Offline start"). `make ios` SHALL run the unit tests and an unsigned simulator build and SHALL NOT be part of `make check`. CI SHALL build the app for changes under `mobile/ios/**` and on tags, and SHALL sign and upload it to TestFlight only on final release tags.

#### Scenario: Built by a self-hoster
- **WHEN** a self-hoster opens `mobile/ios/OpenTodo.xcodeproj`, selects their own team and runs the app on their phone
- **THEN** the app loads the web app from the address they enter, signs no store agreement and needs no account from the project

#### Scenario: Change outside mobile/ios
- **WHEN** a pull request changes only server code
- **THEN** the iOS job does not run and `make check` does not build the app

#### Scenario: Installed from the App Store
- **WHEN** a user installs OpenTodo from the App Store and enters `https://todo.example.com`
- **THEN** the app behaves as the source build without app-bound domains: share sheet, reminders, Today widget and Face ID unlock work, and with no network it shows the offline screen with a retry

#### Scenario: Release candidate
- **WHEN** the tag `v0.20.0-rc.1` is pushed
- **THEN** the iOS job builds unsigned and nothing is uploaded to TestFlight

### Requirement: Share sheet into the capture screen
Each shell SHALL register as a share target for text, links and files: the Android app through `SEND` and `SEND_MULTIPLE` for `text/*`, `image/*` and `application/*`, the iOS app through a share extension for text, URLs and file items. A shared text or link SHALL open the app's capture screen with the same `title`, `text` and `url` the web share target receives. Shared files SHALL be handed to the capture screen with the same hand-over the browser extension uses, so the existing limits (at most 10 files, the server's per-file limit, 100 MB in total, hygiene rules) apply unchanged. On iOS the share extension SHALL NOT open the app itself. It SHALL keep the share in the app's shared container, confirm with its own sheet that the share waits for the app, and the app SHALL open the capture screen with it the next time the app comes to the front with a server configured. A share not handed over within 24 hours SHALL be deleted, and a newer share SHALL replace one that was never handed over, with the sheet saying so. Nothing SHALL be saved without the user's confirmation. A share while offline SHALL work like the web app's offline share.

#### Scenario: Share a link from a browser
- **WHEN** the user shares a page from Chrome or Safari to OpenTodo
- **THEN** the capture screen opens in the app with the page's title and URL (on iOS once the user opens the app after the extension's confirmation), and saving creates the task with that URL as its origin

#### Scenario: Share two photos
- **WHEN** the user shares two photos from the gallery to OpenTodo
- **THEN** the capture screen lists both as files and the task carries them as attachments after Save

#### Scenario: Share before the server is set
- **WHEN** the app has no server configured and receives a share
- **THEN** the first-run screen opens, and the share continues on the capture screen once the server is saved

#### Scenario: iOS share waits for the app
- **WHEN** the user shares a link from Safari to OpenTodo on iOS
- **THEN** the extension's sheet says the share waits in OpenTodo and closes on Done without opening another app, and the next time OpenTodo comes to the front the capture screen shows the link

#### Scenario: Stale iOS share
- **WHEN** a share was confirmed in the extension and the app was not opened for 25 hours
- **THEN** the share has been deleted, and opening the app shows the usual screen without a capture screen

### Requirement: Shell release and store readiness
CI SHALL build the Android shell on every change under `mobile/android/` and on every tag, SHALL attach a signed release APK and AAB to tagged releases with the same build provenance as other release assets, and SHALL fail the release when the Android build fails. CI SHALL build the iOS shell unsigned for changes under `mobile/ios/` and on every tag, and SHALL fail the release when that build fails. On a final release tag, with the signing secrets present, CI SHALL also archive, sign and upload the iOS app to TestFlight. It SHALL never submit a build for App Store review on its own, and SHALL attach no iOS file to the release. Without the secrets it SHALL warn and skip the upload. The repository SHALL hold the store listing texts, the privacy declaration ("no data collected") and the F-Droid metadata for Android, and the listing material for iOS (see "iOS store listing and review material"), so the listings can be published from the repository. Each shell's version SHALL be the app's release version.

#### Scenario: Release assets
- **WHEN** the tag `v0.10.0` is pushed and every gate passes
- **THEN** the release carries `opentodo-android-0.10.0.apk` and `.aab` with provenance attestations next to the extension zip, and the iOS build passed without producing an asset

#### Scenario: Change outside mobile
- **WHEN** a pull request changes only server code
- **THEN** neither the Android nor the iOS job runs

#### Scenario: Final tag uploads to TestFlight
- **WHEN** the tag `v0.20.0` is pushed with the iOS signing secrets configured and every gate passes
- **THEN** a build with version `0.20.0` and build number `2000` appears in TestFlight, and no review submission is made

#### Scenario: Signing secrets missing
- **WHEN** a final tag is pushed in a fork without the iOS signing secrets
- **THEN** the iOS job builds unsigned, logs a warning that no TestFlight upload was made, and the release is not failed for it
