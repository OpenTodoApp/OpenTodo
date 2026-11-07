# Releasing OpenTodo

A release is one pull request, one tag and one follow-up pull request. The release workflow builds, checks and publishes everything else. Versions follow [Semantic Versioning](https://semver.org): a patch for fixes only, a minor for anything new. `CHANGELOG.md` decides what the latest release is; every check that compares versions reads it.

## 1. Prepare the release (pull request)

On a branch from an up-to-date `main`:

```bash
make release-prepare VERSION=0.15.0          # or: node scripts/release/prepare.mjs 0.15.0 [--date 2026-11-02]
```

It makes every edit a release needs, in one go:

- `CHANGELOG.md`: a `## [0.15.0] - <today>` section right under `## [Unreleased]` with the changelog fragments as its entries (`changelog.d/<Section>/<name>.md`, assembled as Security, Added, Changed, Removed, Fixed and by file name within a section; [changelog.d/README.md](changelog.d/README.md)), which it then deletes, and the compare links (`[Unreleased]` from `v0.15.0`, a new `[0.15.0]` link). `## [Unreleased]` keeps only its pointer to `changelog.d/`; an entry written there by hand, or a fragment in the wrong place, makes it stop before it edits anything.
- The release in every pinned template in `deploy/` (CapRover, CasaOS, Dokploy, Easypanel, Helm, Runtipi, TrueNAS, Umbrel, the Home Assistant add-on, the Claude plugin) and in their READMEs, in `docs/self-hosting/`, in the bug report form (`.github/ISSUE_TEMPLATE/bug_report.yml`), in `web/package.json` and the two root entries of `web/package-lock.json`. (The in-app help reads the release from `CHANGELOG.md` when it is built.)
- Runtipi's `tipi_version` + 1 (Runtipi offers an update only when it changes).
- The store fields the version alone does not move: CasaOS's `update_at` (the release date), a `changeLog` entry in Easypanel's `meta.yaml` (`Update to 0.15.0`) and a patch bump of TrueNAS's own app `version` in `app.yaml` (as truenas/apps' Renovate does).
- On a new minor, the release line in the docs (`ghcr.io/opentodoapp/opentodo:0.15`, `:0.15`).
- A `## 0.15.0` entry in the Home Assistant add-on's `CHANGELOG.md`.
- The `upstream/` copies, regenerated from their templates (`node scripts/deploy/mirror.mjs`; `--check` only lists stale copies, and `make deploy-check` runs it).

A reference-device record is not required for any release yet: no real device was measured for 1.0, whose performance budgets are checked in CI only (owner decision 2026-11-07; real devices come after 1.0, [#990](https://github.com/OpenTodoApp/OpenTodo/issues/990)). When a minor release from 1.0.0 on has one, `docs/performance/results-x.y.0.md` measured as [scripts/perf/device.md](scripts/perf/device.md) describes, `make release-prepare` checks it and refuses the release when a value is over its budget of `scripts/perf/budgets.json` without a link to the issue that tracks it (`scripts/release/deviceRecord.mjs`, see [Performance budgets](docs/performance.md)).

Every minor release (x.y.0) also needs its upgrade fixture: `scripts/release/upgrade-fixture.sh x.y.0 HEAD` builds the server from the commit being released, drives the fixed scenario through its API and stores the data directory and a manifest under `internal/store/testdata/upgrade/x.y/`; commit them with the release. `make release-prepare` refuses a minor without it (`scripts/release/upgradeFixture.mjs`), and `go test ./internal/tenant -run TestUpgradeFromEveryRelease` upgrades every fixture to the current server from then on ([Stability and compatibility](docs/stability.md#upgrades)). After tagging, the fixture can be rebuilt from the tag (`scripts/release/upgrade-fixture.sh x.y.0`).

It changes the release only where the text names the project's version (an image tag, a `version`/`tag`/`placeholder` key, `ARG OPENTODO_VERSION`, a version in backticks), never a bare number: the lockfile has dependencies whose version can equal a release. `scripts/release/prepare.test.mjs` runs it on a copy of the tree for the next patch and the next minor, and checks the result against the files a hand-made release changed and against `make deploy-check`.

Then, by hand:

1. Write the release's summary paragraph under its heading in `CHANGELOG.md` (what a person upgrading should know first; for a security release, say so and ask people to upgrade), check the entries are in the right sections and in a sensible order (the most important first), and add **Upgrade notes** when there is a migration, a new setting or anything an operator must do. Add a word to the add-on's entry if the release needs one (for example "a security release").
2. `make deploy-check docs-check` (the full `make check` runs in CI).
3. Run the AI security review on the release's changes: in Claude Code, `/security-review` over `git diff v<previous>..HEAD` (the previous release tag, a release candidate included), leaving out translations, test data and generated files. Fix a real finding in its own pull request with a regression test and start again from step 1; otherwise note "Security review: no findings" with the range in the pull request ([How we verify security](docs/security/how-we-verify.md#ai-security-review-before-each-release)).
4. Commit as `Prepare 0.15.0` and open the pull request. Merge it when the checks pass.

Umbrel's image keeps the previous release's digest until step 4: the check only looks at its shape, because the new digest exists only once the image is published.

### Release candidates

A release candidate (`x.y.z-rc.N`, N from 1) is a tag for testers, prepared the same way:

```bash
make release-prepare VERSION=1.0.0-rc.1
```

- **Only `CHANGELOG.md` changes.** It gets a `## [1.0.0-rc.1] - <today>` section with the changelog fragments as its entries and a `[1.0.0-rc.1]` link comparing from the latest release. The fragments stay in `changelog.d/`. Templates, docs, store fields, the Helm chart, the bug report form, `web/package.json` and the `upstream/` copies stay on the latest release, because a candidate is published to none of them (section 2). `[Unreleased]` keeps comparing from the latest release.
- **Each candidate lists everything since the latest release.** `1.0.0-rc.2` takes the fragments as they are then, including the ones added or changed since rc.1. Its number must be higher than the last candidate's.
- **The final release replaces its candidates.** `make release-prepare VERSION=1.0.0` builds one `## [1.0.0]` section from the fragments and deletes them, as for any release, and removes the `1.0.0-rc.N` sections and links from `CHANGELOG.md`. The candidates' notes stay on their GitHub pre-release pages. Write the release's summary there afresh, since a summary under a candidate goes with it.
- **One release at a time.** While `1.0.0-rc.N` sections are in `CHANGELOG.md`, preparing anything else (`0.23.1`, `1.1.0-rc.1`) is refused. To abandon a candidate, delete its section and link by hand.
- **The gates are those of `x.y.z`, with one more warning.** On a candidate, if the release has a reference-device record, an over-budget value without an issue is printed as `warning: …`, naming it. A missing device record is no warning: it is optional until real devices are measured (#990). The screen-reader passes (NVDA, VoiceOver on macOS and in the iOS shell, TalkBack) gate no release, candidate or final (owner decision 2026-11-07): they are recorded when someone runs them ([#9](https://github.com/OpenTodoApp/OpenTodo/issues/9)), and while some are pending every release prints one `warning: accessibility audit: N screen-reader passes pending …` line, so the release notes can say so. Every other gate refuses a candidate as it refuses the release: the upgrade fixture of a new minor, screenshots older than the app, the security review rule, the migration matrix dates, an audit more than 12 months old, and pending keyboard or zoom passes. For the final release every other gate is strict.

Then write a line under the candidate's heading saying what to test, commit as `Prepare 1.0.0-rc.1` and open the pull request.

## 2. Tag the release

Tag the merge commit on `main` with an annotated tag:

```bash
git checkout main && git pull
git tag -a v0.15.0 -m "OpenTodo 0.15.0"
git push origin v0.15.0
```

Only organization admins can create `v*` tags: a ruleset protects them. A tag with a suffix (`v0.15.0-rc.1`) is a release candidate: it is published as a pre-release, moves neither `stable` nor the `0.15` (or, from 1.0, the `1`) tag, publishes neither the Helm chart nor the Claude and Obsidian plugins, and is never submitted to a store (Google Play, F-Droid, the Home Assistant add-on). Its release notes are its `CHANGELOG.md` section ([Release candidates](#release-candidates)).

A pushed tag never moves. If the tag's run fails before anything is published, fix the problem on `main` and release the next patch (or the next `-rc.N`) from the fixed commit. Do not delete the tag and push it again on another commit: mirrors, caches, F-Droid's bot and anyone who fetched the tag would keep the old commit under the same name.

## 3. The release workflow

The tag runs the full CI matrix (`.github/workflows/ci.yml`: every binary, the WebKit, German and French layouts, Android, the image). Only when every gate passes:

- the image is pushed to `ghcr.io/opentodoapp/opentodo` as `0.15.0`, `0.15` and `stable`, signed with its SBOM and provenance;
- before the GitHub release is published, the release job checks that the new tag can be pulled without signing in (an anonymous ghcr.io token, then the manifest; `scripts/release/check-public-image.sh`). If the package was left private, it fails with a message naming the package's visibility setting;
- the **GitHub release** gets the binaries, the extension and skill zips, the Android APK and AAB, the site bundle and `SHA256SUMS` (only these, by exact name: `scripts/release/collect-assets.sh`) with attestations, and its notes from the `CHANGELOG.md` section (`scripts/release-notes.sh`; a tag without a section fails);
- for a final tag, the Helm chart is published (`.github/workflows/helm.yml`), the Claude plugin is pushed to `OpenTodoApp/opentodo-claude` and the Obsidian plugin to `OpenTodoApp/obsidian-opentodo`;
- the release also carries the signed Android APK and AAB (`opentodo-android-<version>.apk`, `.aab`), after the Android job proved the build reproducible (a second build in a fresh checkout, compared by `scripts/android-repro.sh`; a mismatch fails the release) and checked the certificate against the documented one;
- the AAB is the Google Play build, without location permissions until Play approves background location (`-Popentodo.play=true`; the Android job fails when it declares one or the APK lost one, `scripts/android-store-check.sh`);
- for a final tag, the `play` job puts the AAB on Google Play's **internal** testing track with the CHANGELOG notes (`scripts/release/play-upload.mjs`, secrets in the `release` environment; without them it warns and succeeds). It never touches production.

**Legacy image name.** Through the 0.16.x releases (`legacy.publishedThrough` in `deploy/deploy.json`), the image and the chart are also pushed to the old names `ghcr.io/pixari/opentodo` and `oci://ghcr.io/pixari/charts/opentodo` by `scripts/legacy-image.sh`, with the repository secret `GHCR_LEGACY_TOKEN` (a classic token of the user `pixari` with `write:packages`). A refused push is a warning in the run, not a failure: check the run's warnings, and renew the token if it expired. See [the move to OpenTodoApp](docs/self-hosting/docker.md#the-move-to-opentodoapp). From 0.17.0 nothing is pushed there; then remove the legacy steps.

**Promote stable.** The release moves `stable` by itself. Check that `ghcr.io/opentodoapp/opentodo:stable` now has the release's digest (`docker buildx imagetools inspect`). Run **Actions → Promote stable** with the version only when it did not (a failed or re-run image job), or to roll back to an older release: it repoints `stable` without rebuilding, under both names during the legacy window.

## 4. After the release

1. **Umbrel digest** (pull request): `node scripts/deploy/pin.mjs` writes the published index digest into `deploy/umbrel/` and its upstream copy (`--check` only reports). Commit as `Pin the Umbrel image to the 0.15.0 index digest`.
2. **Store updates**: open the update pull request in each store that pins the version; [`deploy/README.md`](deploy/README.md#on-a-release) has the table, and each folder's README the exact steps. The Home Assistant add-on repository follows the release by itself within a day.
3. **Google Play: promote to production** (final releases only). In the Play Console, open **Test and release → Testing → Internal testing**, check the new version code (`major·10000 + minor·100 + patch`) and its notes, install it from the internal track on a phone and open a server. Then **Promote release → Production** as a staged rollout at **20 %**; after a day without new crashes or ANRs in **Android vitals**, raise it to **100 %**. A problem found during the rollout: **Halt rollout**, fix, release a patch. If Play rejects the update, the release of the server is not affected; answer the review from `mobile/android/store/play-review.md`.
4. **F-Droid: check the update.** F-Droid's bot sees the new tag (`UpdateCheckMode: Tags`), builds it from source and publishes the GitHub APK only when its own build matches it. Within a few days the version appears on [f-droid.org/packages/app.opentodo](https://f-droid.org/packages/app.opentodo/). If it does not, look at the app's build log on [monitor.f-droid.org](https://monitor.f-droid.org/builds) ("Unsigned and signed APKs differ" means the build stopped being reproducible): run `scripts/android-repro.sh v<version>` locally, fix the build settings, and release a patch. Changes to the recipe go to `mobile/android/store/fdroid/app.opentodo.yml` first, then to `fdroiddata` as a merge request.
