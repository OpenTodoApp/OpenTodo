# Tasks

Shell work is verified with `make ios` on a Mac (unit and UI tests, the unsigned build, the dependency check) and the repository checks with `make repo-check` on Linux. The web app and the server do not change, so `go test ./...` and `npm test` have nothing new to cover. `make check` runs before the last task.

## 1. Finish `ios-shell` (prerequisite, not repeated here)

- [ ] 1.1 Complete the open tasks of `openspec/changes/ios-shell/tasks.md` (4.3, 5.2, 7.2 and the device runs 9.1 to 9.6), recording each run in that file and in the `mobile/README.md` table (phone, iOS version, server version). Verified by every box there being ticked and the table having no "not run yet".
- [ ] 1.2 Before archiving, bring `ios-shell`'s MODIFIED blocks up to date with the live `native-shells` spec. "A shell loads the user's server and nothing else" and "First-run server screen" in that delta predate `android-sign-in-flows`. Archiving them as written would drop the live text about sign-in flows: connections to the sign-in pages a flow redirects to, the health check "with the web view's cookies", "behind a login page" and "Sign in here" for a web page. Merge the iOS wording into the live text. Verified by a diff of the archived requirement against the current live one, losing no sentence. Then archive `ios-shell` (`/opsx:archive ios-shell`), so the deltas of this change apply to the archived `native-shells` text. Verified by `npx -y @fission-ai/openspec@1.13.2 validate ios-distribution --strict` no longer printing "Archive would refuse this delta".

## 2. Licence (only after the owner chose option A)

- [ ] 2.1 Record the owner's answer to the licence question in this design (D1) and collect written consent from every `mobile/ios` author (`git log --format='%an' -- mobile/ios | sort -u`) on the licence pull request. Verified by the pull request's comments linked from D1.
- [ ] 2.2 Add `mobile/ios/LICENSE` (MIT, "OpenTodo contributors") and an SPDX line to every Swift, plist-adjacent text, YAML and shell file under `mobile/ios`. Add the licence exception to the README's licence section and one sentence to `CONTRIBUTING.md` ("contributions under `mobile/ios` are licensed under MIT"). Verified by `rg -L 'SPDX-License-Identifier: MIT' mobile/ios -g '*.swift'` printing nothing.
- [ ] 2.3 Repository check, as new cases in `scripts/repo-checks.test.mjs`: every file under `mobile/ios` with a comment syntax carries the MIT identifier and no other licence. `project.yml` sources and resources stay inside `mobile/ios`, apart from the test target's fixture path (cases: missing line, foreign licence, a source path into `web/src`). Verified by `make repo-check`.
- [ ] 2.4 Compare every entry of `mobile/ios/Shared/Localizable.xcstrings` with `web/src/locales/*`. Rewrite any entry that copies a web sentence written by another contributor, and note the comparison in the pull request. Verified by a script output attached to the pull request.

## 3. Store-safe share hand-over

- [ ] 3.1 Remove the responder-chain `openURL:` from `OpenTodoShare/ShareViewController.swift`. After copying into the inbox, show the confirmation sheet ("Saved for OpenTodo. Open OpenTodo to finish.", **Done**, and the replacement notice when an older share was waiting). Verified by `ShareInboxTests` (a new entry replaces an unhanded one and reports it) and by `rg 'openURL' mobile/ios` finding nothing in the extension.
- [ ] 3.2 `AppModel` reads the inbox whenever the scene becomes active with a server configured, opens `/share?…&files=1` and hands the files over as before. It deletes entries older than 24 hours. Verified by `AppModelTests` (an entry on activation opens the capture route, a 25-hour-old entry is deleted and opens nothing, no server means the entry waits).
- [ ] 3.3 The sheet's three strings in the String Catalog in en, de, fr, es, it and pt. Portuguese is added to the catalog's languages, and `scripts/i18n/shell.mjs` expects six. Verified by `make i18n-check`.
- [ ] 3.4 Device run: share a link from Safari and two photos from Photos, then open OpenTodo and save. Recorded in the `mobile/README.md` table.

## 4. Signing and TestFlight upload

- [ ] 4.1 `mobile/ios/ExportOptions.plist` (`method: app-store-connect`, the team id from the `IOS_TEAM_ID` build setting) and a `make ios-archive` target that archives and exports with the signing identity given in the environment. It is not part of `make check`. Verified by a dry run on a Mac with a development team, producing an `.ipa`.
- [ ] 4.2 CI on final `v*` tags (no suffix): a step in the `ios` job, in a `release` environment that requires approval. It creates a temporary keychain from `IOS_DIST_CERT_P12_BASE64`/`IOS_DIST_CERT_PASSWORD`, installs `IOS_PROFILES_TAR_BASE64`, runs `make ios-archive`, uploads with `xcrun altool --upload-package` and the `ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_KEY_P8_BASE64` key, and deletes keychain and files in an `always()` step. Without the secrets it logs `::warning::` and skips. Verified by `scripts/repo-checks.test.mjs` (the upload step runs only on tags without a suffix) and by the first final tag after this change showing the build in TestFlight.
- [ ] 4.3 `RELEASING.md`: the manual step (assign the build to the external TestFlight group, submit for review with the notes from `mobile/ios/store/review-notes.md`), and that a release never waits on review. Verified by `npm run docs:check`.

## 5. Listing and review material

- [ ] 5.1 `mobile/ios/store/listing/{en,de,fr,es,it,pt}.txt` (name, subtitle, description with the offline limitation, keywords, support URL), `privacy.md` (App Privacy: Data Not Collected, with the reasoning), `export-compliance.md` (D7), and `review-notes.md` (the demo instance, what the app adds, accounts and sign-in, D6). Verified by a case in `scripts/repo-checks.test.mjs`: six non-empty listings, each naming the user's own server.
- [ ] 5.2 Screenshot script: a UI test `OpenTodoUITests/StoreScreenshots.swift` against a local server seeded with the demo data, at iPhone 6.9" and iPad 13". It captures Today, a task, the share sheet confirmation and the widget, and is run by `make ios-screenshots`. Verified by the PNGs it writes to `mobile/ios/store/screenshots/` (ignored by git and uploaded by hand).
- [ ] 5.3 App Store Connect: create the app record, the external TestFlight group with a public link, and the listing from the files above (owner, once). Verified by the public TestFlight link answering.

## 6. Documentation and release notes

- [ ] 6.1 `docs/ios-app.md`: "Install from the App Store" first (and "Join the beta on TestFlight"), the offline limitation of the store build and how to get offline start (installed web app or the one-server build), then the existing "Building it" section. The sentences that say there is no store listing are removed. Verified by `npm run docs:check`.
- [ ] 6.2 `docs/install-phone.md` (iPhone: App Store or installed web app, and how they differ), `mobile/README.md` (licence, signing in CI, the secrets, the share hand-over), and a comment on #9 with the TestFlight link. Verified by `npm run docs:check`.
- [ ] 6.3 CHANGELOG entry under Unreleased: the iOS app in TestFlight and the App Store, the MIT licence of `mobile/ios`, and the share flow on iOS. Verified by `make check`.
- [ ] 6.4 `make openspec-validate`, `make repo-check` and `make check` pass. Verified by their exit codes.
