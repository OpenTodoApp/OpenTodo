# Releasing OpenTodo

A release is one pull request, one tag and one follow-up pull request. The release workflow builds, checks and publishes everything else. Versions follow [Semantic Versioning](https://semver.org): a patch for fixes only, a minor for anything new. `CHANGELOG.md` decides what the latest release is; every check that compares versions reads it.

## 1. Prepare the release (pull request)

On a branch from an up-to-date `main`:

```bash
make release-prepare VERSION=0.15.0          # or: node scripts/release/prepare.mjs 0.15.0 [--date 2026-11-02]
```

It makes every edit a release needs, in one go:

- `CHANGELOG.md`: a `## [0.15.0] - <today>` heading right under `## [Unreleased]`, so the entries collected there become the release's, and the compare links (`[Unreleased]` from `v0.15.0`, a new `[0.15.0]` link).
- The release in every pinned template in `deploy/` (CapRover, CasaOS, Dokploy, Easypanel, Helm, Runtipi, TrueNAS, Umbrel, the Home Assistant add-on, the Claude plugin) and in their READMEs, in `docs/self-hosting/`, in the bug report form (`.github/ISSUE_TEMPLATE/bug_report.yml`), in `web/package.json`, the two root entries of `web/package-lock.json` and `web/src/generated/help.json`.
- Runtipi's `tipi_version` + 1 (Runtipi offers an update only when it changes).
- The store fields the version alone does not move: CasaOS's `update_at` (the release date), a `changeLog` entry in Easypanel's `meta.yaml` (`Update to 0.15.0`) and a patch bump of TrueNAS's own app `version` in `app.yaml` (as truenas/apps' Renovate does).
- On a new minor, the release line in the docs (`ghcr.io/opentodoapp/opentodo:0.15`, `:0.15`).
- A `## 0.15.0` entry in the Home Assistant add-on's `CHANGELOG.md`.
- The `upstream/` copies, regenerated from their templates (`node scripts/deploy/mirror.mjs`; `--check` only lists stale copies, and `make deploy-check` runs it).

It changes the release only where the text names the project's version (an image tag, a `version`/`tag`/`placeholder` key, `ARG OPENTODO_VERSION`, a version in backticks), never a bare number: the lockfile has dependencies whose version can equal a release. `scripts/release/prepare.test.mjs` runs it on a copy of the tree for the next patch and the next minor, and checks the result against the files a hand-made release changed and against `make deploy-check`.

Then, by hand:

1. Write the release's summary paragraph under its heading in `CHANGELOG.md` (what a person upgrading should know first; for a security release, say so and ask people to upgrade), check the entries are in the right sections, and add **Upgrade notes** when there is a migration, a new setting or anything an operator must do. Add a word to the add-on's entry if the release needs one (for example "a security release").
2. `make deploy-check docs-check` (the full `make check` runs in CI).
3. Commit as `Prepare 0.15.0` and open the pull request. Merge it when the checks pass.

Umbrel's image keeps the previous release's digest until step 4: the check only looks at its shape, because the new digest exists only once the image is published.

## 2. Tag the release

Tag the merge commit on `main` with an annotated tag:

```bash
git checkout main && git pull
git tag -a v0.15.0 -m "OpenTodo 0.15.0"
git push origin v0.15.0
```

Only organization admins can create `v*` tags: a ruleset protects them. A tag with a suffix (`v0.15.0-rc.1`) is a release candidate: it is published as a pre-release, moves neither `stable` nor the `0.15` tag, does not publish the Helm chart and is never submitted to a store.

## 3. The release workflow

The tag runs the full CI matrix (`.github/workflows/ci.yml`: every binary, the WebKit, German and French layouts, Android, the image). Only when every gate passes:

- the image is pushed to `ghcr.io/opentodoapp/opentodo` as `0.15.0`, `0.15` and `stable`, signed with its SBOM and provenance;
- the **GitHub release** gets the binaries, the extension and skill zips, the site bundle and `SHA256SUMS` with attestations, and its notes from the `CHANGELOG.md` section (`scripts/release-notes.sh`; a tag without a section fails);
- the Helm chart is published (`.github/workflows/helm.yml`) and the Claude plugin is pushed to `OpenTodoApp/opentodo-claude`.

**Legacy image name.** Through the 0.16.x releases (`legacy.publishedThrough` in `deploy/deploy.json`), the image and the chart are also pushed to the old names `ghcr.io/pixari/opentodo` and `oci://ghcr.io/pixari/charts/opentodo` by `scripts/legacy-image.sh`, with the repository secret `GHCR_LEGACY_TOKEN` (a classic token of the user `pixari` with `write:packages`). A refused push is a warning in the run, not a failure: check the run's warnings, and renew the token if it expired. See [the move to OpenTodoApp](docs/self-hosting/docker.md#the-move-to-opentodoapp). From 0.17.0 nothing is pushed there; then remove the legacy steps.

**Promote stable.** The release moves `stable` by itself. Check that `ghcr.io/opentodoapp/opentodo:stable` now has the release's digest (`docker buildx imagetools inspect`). Run **Actions → Promote stable** with the version only when it did not (a failed or re-run image job), or to roll back to an older release: it repoints `stable` without rebuilding, under both names during the legacy window.

## 4. After the release

1. **Umbrel digest** (pull request): `node scripts/deploy/pin.mjs` writes the published index digest into `deploy/umbrel/` and its upstream copy (`--check` only reports). Commit as `Pin the Umbrel image to the 0.15.0 index digest`.
2. **Store updates**: open the update pull request in each store that pins the version; [`deploy/README.md`](deploy/README.md#on-a-release) has the table, and each folder's README the exact steps. The Home Assistant add-on repository follows the release by itself within a day.
