# Proposal

## Why

The Android app has been finished since 0.10. It has a first-run screen, reminders without a push service, sharing, widgets, fingerprint unlock and sign-in behind a login wall. It is still "Not in the stores yet" (CHANGELOG 0.10). `ROADMAP.md` row 1 of "Native shells" says it waits for the owner: the Play and F-Droid listings and the signing key. Meanwhile `docs/install-phone.md` already tells people to "install the OpenTodo app from Google Play or F-Droid", and neither is possible.

#105 asks for native apps. The research's mobile section (§3.1) is about meeting people where they install apps. For a self-hosted, privacy-minded audience that means F-Droid as much as Google Play. And F-Droid users ask one question before installing: is the build reproducible, so the APK provably comes from this source?

## What Changes

- **Google Play production.** The app goes from the AAB that CI already signs on tags to a production listing:
  - CI uploads the AAB to the internal testing track on final tags, through the Play Developer API with a service account.
  - The owner promotes it to production by hand.
  - The listing uses the texts, data-safety answers and permission table already in `mobile/android/store/`, plus the reviewer access note (the public demo instance) and the exact-alarm declaration.
- **One signing key everywhere.** The project's existing release key becomes the Play app signing key ("use my own key" in Play App Signing), with a separate upload key. Then the APKs from Google Play, F-Droid and GitHub releases carry the same certificate, and a user can move between the three without uninstalling and losing local data.
- **Reproducible builds.** Building the same tag twice, on different machines, gives the same APK apart from the signature. It is checked in CI by building twice and comparing with Android's own tools, and documented so anyone can verify a release APK.
- **F-Droid.** `mobile/android/store/fdroid/app.opentodo.yml` is brought up to date and submitted to `fdroiddata`. It uses reproducible builds, so F-Droid ships the project-signed APK: `Binaries:` points at the GitHub release asset and `AllowedAPKSigningKeys:` names the release certificate. F-Droid's own build must match it, or it is not published.
- **Release flow.** `RELEASING.md` gains the Play promotion step and the F-Droid update check. The `deploy/README.md` store table gains both rows.
- **Docs.** `docs/android-app.md` and `docs/install-phone.md` link the real listings, say the three sources share one signature, and explain how to verify an APK.

Not **BREAKING**. No op, field, route or environment variable. The installed app does not change behaviour.

## Out of scope

- iOS (`ios-distribution`).
- Other stores (Amazon, Huawei, Samsung Galaxy Store) and IzzyOnDroid. Once builds are reproducible, IzzyOnDroid can pick the GitHub APK up by itself; this change only documents it.
- Automatic promotion to production. A human promotes each release after looking at the internal track (design D2).
- Play-only features (in-app updates, in-app review, Play Integrity). Each one would add a Google library, which the AndroidX-only dependency check refuses.
- A new minimum Android version or target API beyond what the code has today (API 26 / target 36).

ROADMAP item advanced: "Next: Native shells", row 1 (Android in the stores), and milestone 0.20 "Everywhere" of the 1.0 plan.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: ADDED requirements for publishing the Android app on Google Play and F-Droid with one signing certificate, and for reproducible Android builds. "Shell release and store readiness" is left as it is, so this change does not collide with `ios-distribution`, which modifies that requirement.

## Impact

- **Data model, sync, op schema, E2EE, API, CLI, MCP, CalDAV, vault:** none.
- **Android app:** build settings only: deterministic packaging (design D4), a pinned JDK and build tools, and no change to code or dependencies. The APK stays about 1 MB.
- **CI:**
  - a second release build and an `apkdiff`-style comparison on tags (about 4 extra minutes on the Android job);
  - a Play upload step that uses two new repository secrets (`PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_UPLOAD_KEYSTORE_BASE64`, in a `release` environment);
  - no new third-party action: the upload is a short script against the Play Developer API.
- **Server binary and image:** unchanged.
- **Owner actions:** the Play developer account type, the key upload to Play App Signing, the closed test if Play requires one, and the `fdroiddata` merge request.

Relates to #105
