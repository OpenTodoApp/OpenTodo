# Design

## Context

`mobile/android` is a hand-written Kotlin shell, AndroidX only (`:app:checkDependencies`), about 1 MB. CI already:
- runs `make android` on changes under `mobile/android/**`;
- on `v*` tags, signs a release APK and AAB from four secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`);
- attaches both files to the release with provenance.

`mobile/android/store/` holds the six-language listing texts, `data-safety.md`, `permissions.txt` (checked against the manifest by `:app:checkStoreMetadata`) and an F-Droid metadata draft pinned to 0.10.0. The version code is `major·10000 + minor·100 + patch`. Release candidates (`-rc.N`) are never submitted to a store (RELEASING.md).

This change is mostly process. The decisions are about keys, tracks and making a build that someone else can repeat.

## Goals / Non-Goals

**Goals:**
- The app on Google Play production and in the main F-Droid repository.
- One signing certificate across Play, F-Droid and GitHub releases.
- A release APK that anyone can rebuild from the tag and compare, and CI that fails when it stops being reproducible.

**Non-Goals:**
- Automatic production rollouts, other stores, Play-only libraries.

## Decisions

**D1. One certificate across all three sources: our key in Play App Signing.**
Play App Signing stores the key that signs what users install. It can generate that key, or take the developer's own.
- **Chosen: upload the existing release key** (the one behind `ANDROID_KEYSTORE_BASE64`) as the app signing key, with the PEPK tool, once, by the owner.
- Register a **separate upload key** (`PLAY_UPLOAD_KEYSTORE_BASE64`). CI signs the AAB with it. If it ever leaks, Google can reset it without a new app identity.
- The APK attached to the release stays signed with the release key.
- With F-Droid publishing the developer-signed APK (D3), all three sources carry one certificate.

Why it matters: Android refuses an update signed with a different certificate. With a Google-generated key, someone who installed from F-Droid must uninstall to switch to Play. That deletes the app's local data, including the encrypted account key behind fingerprint unlock and any changes not yet synced.

The cost: Google holds a copy of the key, which it does anyway for every Play app. The alternative (a Google-generated key and separate certificates per source) is simpler on day one and closes the door to switching for good, so it is rejected.

The certificate's SHA-256 is published in `docs/android-app.md` and in the F-Droid metadata. That lets a user check what they installed: `apksigner verify --print-certs`.

**D2. CI uploads to the internal track, a human promotes to production.**
On final `v*` tags (no suffix), after the signed AAB is built, a step uploads it to Play's **internal** testing track. The script is about 60 lines (`scripts/release/play-upload.mjs`): it uses the Play Developer API (`edits.insert`, `edits.bundles.upload`, `edits.tracks.update`, `edits.commit`) with a service account from `PLAY_SERVICE_ACCOUNT_JSON`, and the release notes come from the CHANGELOG section for that version, cut to 500 characters per language.
- Without the secrets it warns and skips, as the signing step does today.
- Release candidates upload nothing.
- The owner promotes the build from internal to production in the Play Console, first as a staged rollout (20 %, then 100 %). That is one step in RELEASING.md.

Rejected:
- **A third-party upload action.** It adds a supply-chain dependency with access to the publishing credential.
- **Fastlane supply.** A Ruby toolchain for four API calls, against AGENTS rule 6.
- **Direct-to-production uploads.** A store rejection or a bad build should never block or break the release of the server.

**D3. F-Droid with reproducible builds, publishing our signature.**
F-Droid builds every app from source. With reproducible builds it compares its own unsigned build with the developer's signed APK and, when they match, publishes the developer-signed one. The metadata:
- `Binaries: https://github.com/OpenTodoApp/OpenTodo/releases/download/v%v/opentodo-android-%v.apk`
- `AllowedAPKSigningKeys:` the release certificate's SHA-256
- `subdir: mobile/android/app`
- `gradle: [yes]`
- `prebuild: export OPENTODO_VERSION=$$VERSION$$`
- the same JDK as CI
- `AutoUpdateMode: Version`, `UpdateCheckMode: Tags ^v[0-9.]+$`, so release candidates are skipped.

The repository's copy is the source of truth. The owner opens the first merge request in `fdroiddata`, and F-Droid's bot follows the tags after that.

Rejected: F-Droid signing with its own key. It is the default and needs no reproducibility, but then the F-Droid build carries a certificate different from Play's and GitHub's (see D1).

**D4. What makes the build reproducible.**
The release APK must not depend on the time, the machine, the path or the order of files. Concretely:
- **Pinned toolchain.** The Gradle wrapper with its `distributionSha256Sum`, the Android Gradle Plugin version, `build-tools` 36.0.0, and JDK 17 (Temurin) in CI and in the F-Droid recipe. The JDK is named in `mobile/README.md`.
- **No varying metadata in the APK.**
  - `dependenciesInfo { includeInApk = false; includeInBundle = false }` drops the encrypted dependency block, which F-Droid also refuses.
  - `vcsInfo.include = false` drops the commit file, which makes the output depend on how the source was checked out (the tag name is already the version).
- **Deterministic ART baseline profile.** Some AGP versions write `assets/dexopt/baseline.prof` in a different order on different machines. The check (D5) catches it. If it fails, `baseline.prof` generation is turned off (`androidResources`/`packaging` exclusion for `assets/dexopt/*`), which costs only the start-up profile of a 1 MB app.
- **R8.** Minify stays on. R8 is deterministic for the same inputs and version, which are pinned.
- **Version from the tag only.** `OPENTODO_VERSION` is already the only input. Local builds are `0.0.0-dev` and are not compared.

**D5. CI proves it on every tag, and on demand.**
On tags the Android job builds the release APK **twice**, the second time in a fresh checkout under another path, with `SOURCE_DATE_EPOCH` set differently and the Gradle cache cleared. It then compares the two unsigned APKs. `apksigcopier compare` is F-Droid's tool for exactly this. It is a small Python package pinned by hash and installed only in this step. A mismatch fails the job and therefore the release, as an Android build failure already does. A manual workflow input runs the same check on any commit. `scripts/android-repro.sh` holds the comparison, so a user can run it locally against a downloaded release APK.

Rejected: comparing only in F-Droid's pipeline. We would learn about a non-reproducible release days later, after it was published elsewhere.

**D6. Play listing details that need a decision.**
- **Reviewer access.** The "App access" section names `https://demo.open-todo.app` and "Try the demo", which needs no credentials.
- **Exact alarms.** The app uses `SCHEDULE_EXACT_ALARM`, which the user grants and which falls back to inexact alarms, and not `USE_EXACT_ALARM`, which Play restricts to alarm and calendar apps. The Console declaration says reminders are user-set and the app works without the grant. `focus-live-activity` adds no permission.
- **Data safety.** `data-safety.md` as it stands: no data collected or shared.
- **Account type and closed testing.** Play requires a closed test (at least 12 testers for 14 days) before production for personal developer accounts created after November 2023. Organisation accounts are exempt. **Owner question 1:** which account type the app is published under. If personal, the 14-day closed test is run with testers from the #9 call for testers before production, and this is task 3.2.
- **Developer verification for apps outside Play.** Google announced that certified Android devices will require apps, including those from F-Droid and GitHub, to come from developers who verified their identity with Google, starting in a few countries in 2026 and everywhere later. The owner registers the package name `app.opentodo` and the release certificate in that program through the same Play Console account, so the F-Droid and GitHub APKs keep installing. **Owner question 2:** confirm the project accepts this registration. Without it, the F-Droid build would stop installing on certified devices in the affected countries.

## Data model impact

None. No op, field, route or migration.

## Size

- APK: unchanged, about 1 MB. Dropping the dependency and commit metadata removes a few hundred bytes.
- CI: about 4 minutes more on tag builds for the second build and the comparison. `apksigcopier` is installed only in that step.
- Server image, binary and memory: unchanged.

## Progressive disclosure

No screen changes. Nothing new for any user in the app. The docs change where to install it from.

## Risks

- **AGP non-determinism after an upgrade.** Caught by D5 on the next tag. The fix is in the build settings, not in the app.
- **Play policy changes** (target API, exact alarms). The target API is already kept current (0.15.0). The exact-alarm fallback means a policy change never breaks reminders entirely.
- **Key handling.** The release key leaves CI once, to Play App Signing, by the owner. The upload key and the service account sit in a `release` environment that requires approval. The service account has the "Release to testing tracks" permission only, so it cannot promote to production.
