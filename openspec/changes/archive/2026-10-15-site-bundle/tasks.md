# Tasks

## 1. Build outputs without `website/`

- [x] 1.1 Make `OUT_SITE` in `web/scripts/docs/build.mjs` a parameter (default `dist/docs-site`) while `make docs` keeps writing `website/docs` for now, and keep `help.json` where it is. Verify `make docs` output is unchanged and `make docs-check` passes.
- [x] 1.2 Move the website WebP output of `scripts/screenshots.mjs` to `docs/screenshots/site/` (move the existing files with `git mv`) and keep `website/assets/shots` as a copy until the switch-over. Verify a run with `ONLY=today` writes to the new folder and the landing page still shows its images.

## 2. The bundle

- [x] 2.1 Write `scripts/site-bundle.mjs` and `make site-bundle`: docs site into `dist/site-bundle/docs`, shots, `tokens/tokens.css` extracted from `index.css` (D4), the icon sprite with its licence, `changelog.json` parsed from `CHANGELOG.md`, and the bundle README. Verify `make site-bundle` produces the D1 layout and a node test checks tokens.css contains the same `--ot-*` values as `index.css`.
- [x] 2.2 Generate `manifest.json` (schema 1, version, date, `importFormats` from the importer, measured `facts`) with a hidden `--print-formats` flag on the server binary. Verify a Go test for the flag's output, a node test that the manifest validates against a small JSON schema, and `go test ./...`.
- [x] 2.3 Add a docs-check rule that every screenshot listed in the manifest exists. Verify it fails when one is deleted and passes otherwise (`make docs-check`).

## 3. CI

- [x] 3.1 Add a `site-bundle` job on pushes to main that uploads the bundle as an artefact named with the short commit. Verify on a branch run that the artefact downloads and unpacks to the D1 layout.
- [x] 3.2 Make the `release` job depend on the bundle and upload `opentodo-site-bundle-<tag>.tar.gz` with the other assets (and in `SHA256SUMS`). Verify with a pre-release tag (`v0.x.y-rc.1`) on a branch that the asset is attached.
  - Checked locally on 2026-10-15 without publishing anything: a bundle built as `v0.3.1-rc.1` is named `opentodo-site-bundle-v0.3.1-rc.1.tar.gz`, the release job's collection step (`find artifacts … -name 'opentodo-*'`) copies it next to the binaries and lists it in `SHA256SUMS`, and `release` needs `site-bundle`. Found: `scripts/release-notes.sh` exits 1 for a version without its own CHANGELOG section, so a pre-release tag needs a `## [0.3.1-rc.1]` section first or the release step fails. The tag itself publishes a GitHub pre-release and a container tag, so it waits for the maintainer.
  - Verified with the maintainer-approved pre-release `v0.3.1-rc.1` (run 38677573568): every job passed, the GitHub pre-release lists `opentodo-site-bundle-v0.3.1-rc.1.tar.gz` with the binaries, `SHA256SUMS` covers it, and its manifest says `"version": "v0.3.1-rc.1"`.
- [x] 3.3 Add path filters (D7) with a `git diff` step. Verify a docs-only PR skips the Go, cross-compile and layout jobs, and a Go change runs them.

## 4. Switch-over (after the website repository serves the site)

- [x] 4.1 Confirm the website repository deploys from a bundle and Coolify points at it. Verify the public site and `/docs/` are served from the new repository.
  - The maintainer switched Coolify to the website repository; on 2026-10-15 open-todo.app serves the Astro site (`/_astro/` assets, today's footer) and `/docs/` and `/templates/` answer 200.
- [x] 4.2 Delete `website/` from this repository, drop the committed-site comparison from `docs:check`, point `scripts/e2e-docs.mjs` at `dist/docs-site`, and update `AGENTS.md`, `CONTRIBUTING.md`, the Makefile help and `docs/` references. Verify `make check` and the docs browser check pass.
  - `website/` deleted; `docs:build` writes `dist/docs-site` (ignored); `docs:check` compares the in-app help only; `e2e-docs.mjs` builds into `dist/docs-root/docs` and serves it; screenshots no longer copy to `website/assets/shots`; CONTRIBUTING, scripts/README, the Makefile help and `.gitattributes` updated. `make check` and `node scripts/e2e-docs.mjs` pass.
- [x] 4.3 Add a CHANGELOG entry (site bundle, layout v1) and run `make check`. Verify it passes, including `openspec validate --all --strict`.
