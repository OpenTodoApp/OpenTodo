# Design: stable image tag

## Decisions

### D1. A moving `stable` tag, published by the release job

`docker/metadata-action` gets `type=raw,value=stable` enabled only for `refs/tags/v*` whose name has no `-`, so release candidates never move it. It is pushed in the same multi-arch manifest as the version tags, so `stable`, `0.6` and `0.6.1` point at the same image after a release.

### D2. Promote stable: create and roll back

`promote-stable.yml` (manual, input `version`, for example `0.6.1`) runs `docker buildx imagetools create -t ghcr.io/<repo>:stable ghcr.io/<repo>:<version>`. It copies the manifest list without rebuilding. It is needed once now, since no release has published `stable` yet, and later only to roll back. It refuses a version with a `-`.

### D3. The checks bind templates to `stable`

`deploy/deploy.json` holds `"tag": "stable"`. The shared rule requires `<image>:<tag>` exactly; the Coolify checker uses the same rule. Because templates no longer change on a release, the release-line comparison with `CHANGELOG.md` is dropped. In its place, the deploy check reads `.github/workflows/ci.yml` and fails if the `stable` raw tag is missing, so the templates can never point at a tag the release stops publishing.

### D4. Updates: what users get

With `stable`, an update installs whatever was released last, minor versions included, and migrations run on start (there are no down-migrations). The docs say this next to the update button of each platform, recommend a backup before updating, and show how to pin a line instead. Existing installs on `:0.6` keep working and keep receiving 0.6 patches; their owners switch by editing the tag once.

### D5. Order of the rollout

`stable` must exist before any template that names it is published. After this change merges: run **Promote stable** with `0.6.1`, check that the tag resolves, then publish the Unraid template repository. The Coolify template is not in Coolify's list yet; its upstream copy is updated in the repository only.

## Size and data

No image, binary, runtime or data model change.

## Interface budget

No screen changes.
