## ADDED Requirements

### Requirement: Android app on Google Play and F-Droid with one certificate
The Android app SHALL be published on Google Play production and in the F-Droid main repository. The APKs from Google Play, F-Droid and the GitHub release SHALL carry the same signing certificate, so a user can switch between the three sources without uninstalling. The certificate's SHA-256 SHALL be published in the Android app's documentation.

On a final release tag (no suffix), with the publishing secrets present, CI SHALL upload the signed AAB to Google Play's internal testing track, with release notes taken from that version's CHANGELOG section. CI SHALL never promote a build to production by itself. Without the secrets it SHALL warn and skip the upload, without failing the release. A release candidate SHALL upload nothing.

The F-Droid metadata in the repository SHALL point F-Droid at the GitHub release APK and the allowed certificate, so F-Droid publishes the project-signed APK only when its own build of the tag matches it. The Play listing material in the repository SHALL include the reviewer access note (the public demo instance) and the exact-alarm declaration.

#### Scenario: Final tag reaches the internal track
- **WHEN** the tag `v0.20.0` is pushed with the Play secrets configured and every gate passes
- **THEN** version code `2000` is on Play's internal testing track with the 0.20.0 release notes, production is unchanged, and the release also carries `opentodo-android-0.20.0.apk`

#### Scenario: Release candidate
- **WHEN** the tag `v0.20.0-rc.1` is pushed
- **THEN** nothing is uploaded to Google Play and the F-Droid update check ignores the tag

#### Scenario: Switching from F-Droid to Google Play
- **WHEN** a user who installed 0.20.0 from F-Droid installs the 0.20.1 update from Google Play
- **THEN** Android accepts it as an update, and the app keeps its server, local data and fingerprint unlock

#### Scenario: Play secrets missing
- **WHEN** a final tag is pushed in a fork without the Play secrets
- **THEN** the Android job logs a warning that no Play upload was made, and the release succeeds with the signed APK and AAB attached

#### Scenario: Verifying the certificate
- **WHEN** a user runs `apksigner verify --print-certs` on the APK installed from any of the three sources
- **THEN** the SHA-256 printed equals the one in `docs/android-app.md`

### Requirement: Reproducible Android builds
Building the Android release APK from the same tag SHALL produce identical files apart from the signature, regardless of the machine, the checkout path, the build time or the Gradle cache. The toolchain (Gradle wrapper with checksum, Android Gradle Plugin, build tools, JDK) SHALL be pinned and named in `mobile/README.md`, and the APK SHALL carry no build-time, machine or checkout metadata. On every release tag CI SHALL build the release APK twice in separate checkouts and fail the release when the two differ apart from the signature. The repository SHALL provide a script that compares a downloaded release APK with a local build of its tag.

#### Scenario: Two builds match
- **WHEN** CI builds the release APK of `v0.20.0` in two checkouts under different paths with different `SOURCE_DATE_EPOCH` values
- **THEN** the comparison reports the APKs identical apart from the signature, and the job passes

#### Scenario: A non-deterministic file sneaks in
- **WHEN** a dependency upgrade makes the baseline profile differ between the two builds
- **THEN** the comparison names the differing file and the release fails before anything is published

#### Scenario: A user verifies a release
- **WHEN** a user runs `scripts/android-repro.sh v0.20.0 opentodo-android-0.20.0.apk` with the pinned JDK installed
- **THEN** the script builds the tag, compares it with the downloaded APK and reports a match

#### Scenario: F-Droid build differs
- **WHEN** F-Droid's build of a tag does not match the release APK
- **THEN** F-Droid does not publish that version, and the previous version stays available there
