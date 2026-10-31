# Tasks

Android tasks are verified with `make android` (JDK 17 and the Android SDK) and the CI Android job. Repository checks run with `make repo-check`. The server and web app do not change, so `go test ./...` and `npm test` have nothing new to cover. `make check` runs before the last task.

## 1. Reproducible build

- [x] 1.1 Pin the toolchain: `distributionSha256Sum` in `gradle-wrapper.properties`, the Android Gradle Plugin version, `build-tools` 36.0.0 and Temurin JDK 17 in CI (`actions/setup-java` with a pinned version). Name them in `mobile/README.md`. Verified by a case in `scripts/repo-checks.test.mjs` failing when the wrapper has no checksum.
  - Done: Gradle 9.8.2 with its checksum (already there), AGP 9.4.1, `buildToolsVersion = "36.0.0"`, Temurin `17.0.21+9` in every `setup-java`; table in `mobile/README.md`. `scripts/repo-checks.test.mjs` "a Gradle wrapper without its checksum is refused" (and an unpinned `java-version: 17`).
- [x] 1.2 `build.gradle.kts`: `dependenciesInfo { includeInApk = false; includeInBundle = false }` and `vcsInfo { include = false }` on release. Verified by `unzip -l` of the release APK showing no `META-INF/version-control-info.textproto` and no dependency block (`apksigner`/`zipinfo` output attached to the pull request).
  - Done: `unzip -l` of the release APK (355 entries) has no `META-INF/version-control-info.textproto`; the dependency block lives in the signing block and is gone with `includeInApk = false` (listing attached to the pull request).
- [x] 1.3 `scripts/android-repro.sh <tag> [apk]`: check out the tag in a temporary directory, build `assembleRelease` unsigned with `OPENTODO_VERSION` from the tag, and compare with `apksigcopier compare` (pinned by hash in `scripts/release/requirements-repro.txt`) against the given APK or a second build. Verified by running it twice on the current commit locally (match) and once after touching a resource only in the second checkout (mismatch named).
  - Done: two builds of the branch in `ghcr.io/cirruslabs/android-sdk:35` with Temurin 17.0.21+9 matched byte for byte (1,023,252 bytes); with `REPRO_TOUCH=mobile/android/app/src/main/res/values/strings.xml` the second differed and the script named `resources.arsc`.
- [x] 1.4 CI on tags: a second release build in a fresh checkout under another path, with another `SOURCE_DATE_EPOCH` and no Gradle cache, then `scripts/android-repro.sh`. A mismatch fails the job. Add a `workflow_dispatch` input to run it on any commit. Verified by the first tag after this change, and by a case in `scripts/repo-checks.test.mjs` that the step runs on tags.
  - Done: `Reproducible build (tags)` in the `android` job (a fresh clone under `$TMPDIR`, `SOURCE_DATE_EPOCH` 1000000000, `REPRO_CLEAN_CACHE=1`), compared with the signed APK by `apksigcopier`; on demand `.github/workflows/android-repro.yml` (a separate workflow, because dispatching `ci.yml` would publish an image). Repo-check cases: the step runs on tags, after the signed build, apksigcopier pinned by hash. First real run: the next tag.
- [x] 1.5 If 1.4 shows `assets/dexopt/baseline.prof` differing, exclude it from packaging and record that in design D4. Verified by 1.4 passing.
  - Not needed so far: `assets/dexopt/baseline.prof` and `baseline.profm` were identical in the local builds (recorded in design D4). The next tag's CI run confirms it on GitHub's runners.

## 2. Signing and Google Play upload

- [ ] 2.1 Owner, once: enrol the app in Play App Signing with the existing release key (PEPK export), and register a separate upload key. Store `PLAY_UPLOAD_KEYSTORE_BASE64` (plus its password and alias) and `PLAY_SERVICE_ACCOUNT_JSON` (permission "Release apps to testing tracks" only) in a `release` environment that requires approval. Verified by the Play Console showing "Signing by Google Play: your key" with the release certificate's SHA-256.
- [x] 2.2 CI signs the AAB with the upload key and the APK with the release key, and publishes the release certificate's SHA-256 in the job summary. Verified by `apksigner verify --print-certs` in the job matching the documented fingerprint.
  - Done: the signing step prints the certificate's SHA-256 (`apksigner verify --print-certs`) to the job summary and fails in `OpenTodoApp/OpenTodo` when it differs from `AllowedAPKSigningKeys` in the F-Droid metadata (a fork gets a warning). The `play` job (environment `release`) strips the release signature from the AAB and signs it with the upload key (`jarsigner`). The v0.19.0 release APK shows `ff2eacdf…72befa`, now in `docs/android-app.md`.
- [x] 2.3 `scripts/release/play-upload.mjs` (Node, no dependency, the service account's JWT signed with `node:crypto`): open an edit, upload the AAB, set the internal track with the CHANGELOG notes for the version cut to 500 characters, and commit. Final tags only. Missing secrets give `::warning::` and skip. Verified by `scripts/release/play-upload.test.mjs` against a fake Play API (`node --test`: the order of calls, the notes cut, the skip without secrets, no call for an `-rc` tag), added to `make repo-check`.
  - Done: 7 cases in `scripts/release/play-upload.test.mjs` (call order, with the JWT verified by the fake token endpoint; notes cut to 500; skip without the service account or the bundle; no call for `-rc`; a wrong version code refused before the track), in `make repo-check`.
- [x] 2.4 `mobile/android/store/`: `play-review.md` (App access with the demo instance, the exact-alarm declaration text, the content rating answers) next to `data-safety.md`. Verified by `:app:checkStoreMetadata` extended to require the file.
  - Done: `mobile/android/store/play-review.md`; `checkStoreMetadata` requires it and `data-safety.md`, and checks that it names the demo instance and `SCHEDULE_EXACT_ALARM`.

## 3. Google Play production

- [ ] 3.1 Owner: answer owner questions 1 and 2 in design D6 (account type, developer verification), and record the answers there. Verified by the design file.
- [ ] 3.2 If the account is a personal one created after November 2023: run the closed test with at least 12 testers for 14 days, recruited through #9, before applying for production. Verified by the Play Console's production access status.
- [ ] 3.3 Owner: create the production listing from `listing/<lang>.txt`, the data-safety answers and the screenshots, promote the first internal build to production with a staged rollout, and register `app.opentodo` and the certificate for developer verification. Verified by the public Play listing URL answering.

## 4. F-Droid

- [x] 4.1 Update `mobile/android/store/fdroid/app.opentodo.yml`: current version and code, `Binaries:` with the release asset pattern, `AllowedAPKSigningKeys:` with the certificate's SHA-256, the pinned JDK in `sudo`, `AutoUpdateMode: Version`, and `UpdateCheckMode: Tags ^v[0-9.]+$`. Verified by `fdroid lint` and `fdroid build --test app.opentodo` run locally in an `fdroidserver` container, with the output attached to the pull request.
  - Done: version 0.20.0 / 2000 (the first tag with the reproducible settings), `Binaries:`, `AllowedAPKSigningKeys:`, OpenJDK 17 from bookworm in `sudo`, a `prebuild` that writes the version into `build.gradle.kts` (fdroid's `prebuild` runs in its own shell, so an `export` would not reach Gradle), category `Task` and a `/HEAD/` changelog link (lint refused `Time` and `/main/`). `fdroid lint` (fdroidserver 2.4.5 with fdroiddata's `categories.yml`) passes; `fdroid build --test` needs the `v0.20.0` tag, so it was not run.
- [ ] 4.2 Owner: open the merge request in `fdroiddata` from the repository's metadata. Verified by the app's page on f-droid.org.

## 5. Documentation and release flow

- [x] 5.1 `docs/android-app.md`: install from Google Play, F-Droid or the GitHub release; that all three share one certificate (with its SHA-256) and how to switch; how to verify an APK with `scripts/android-repro.sh`. `docs/install-phone.md` links the real listings. Verified by `npm run docs:check`.
  - Done: "Install the app", "Switching between Google Play, F-Droid and GitHub" and "Check what you installed" in `docs/android-app.md` (certificate, `apksigner`, `scripts/android-repro.sh`); `docs/install-phone.md` links the three sources. Both say the store links open once listed. `make docs-check` passes.
- [x] 5.2 `RELEASING.md`: the Play promotion step (internal → staged production) and the F-Droid check (the new version appears after its build matched). `deploy/README.md`: the store table gains Google Play and F-Droid. Verified by `npm run docs:check`.
  - Done: RELEASING.md section 3 (APK, reproducibility, internal track) and section 4 steps 3 (staged production rollout) and 4 (F-Droid check); the "After a release" table of `deploy/README.md` gains Google Play and F-Droid. `make docs-check` passes.
- [x] 5.3 `ROADMAP.md` "Native shells" row 1 marked shipped, and a CHANGELOG entry under Unreleased: the Android app on Google Play and F-Droid, reproducible builds, one certificate. Verified by `make check`.
  - Adapted while owner tasks stay open: the ROADMAP rows say **In progress** (not shipped), and the CHANGELOG entry covers only what ships now (reproducible builds, the certificate, the F-Droid metadata, the internal-track upload), "refs #603".
- [x] 5.4 `make android`, `make openspec-validate`, `make repo-check` and `make check` pass. Verified by their exit codes.
  - Done: `make android` passed (Temurin 17.0.21+9 in the SDK image, 86 tasks); `make openspec-validate`, `make repo-check` (97 tests), `make docs-check` and `make deploy-check` pass locally; the full `make check` runs in CI on the pull request. Also measured: Ubuntu's OpenJDK 17.0.20.1 builds the same APK as Temurin (apksigcopier match), which is what F-Droid's Debian JDK needs.
