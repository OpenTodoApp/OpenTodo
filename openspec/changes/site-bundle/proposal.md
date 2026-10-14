# Proposal

## Why

The public website moves to its own repository (`pixari/OpenTodoWebsite`), so that app changes never rebuild the website and website edits never run the app's CI. Today the two are coupled inside this repository:
- `make docs` writes the generated docs site into `website/docs/**`, which is committed, so every docs edit produces a large diff of regenerated HTML.
- `scripts/screenshots.mjs` writes product shots into `website/assets/shots`.
- The website describes `main`, which can include features that are not released yet.

The website still needs those outputs, plus the colour tokens, icons, changelog and the list of released importers. The app repository must therefore publish them as a versioned artefact that the website consumes.

## What Changes

- **A site bundle per release.** On every release tag, CI builds `opentodo-site-bundle-<version>.tar.gz` and attaches it to the GitHub release. It contains:
  - the generated docs site (pages, search index, assets) for that version
  - the product screenshots in light and dark
  - the colour tokens as a standalone stylesheet, and the icon set
  - the changelog as structured data
  - a feature manifest (version, released import formats, and other facts the website shows conditionally)
- **No more generated website files in this repository.** `website/` is removed from this repository once the website repository serves the site.
  - `make docs` still regenerates the in-app help, and writes the docs site to a build directory instead of a committed folder.
  - The docs check still verifies links, anchors, images, spec coverage and help links, but no longer compares committed HTML.
- **Screenshots go to the bundle.** `scripts/screenshots.mjs` writes to a build directory used by the bundle. README images stay where they are.
- **A preview bundle for unreleased docs.** CI on `main` also produces the bundle as a workflow artefact (not a release asset), so the website repository can preview upcoming docs without publishing them.
- **CI path filters.** Docs-only and Markdown-only changes skip the Go, cross-compile and layout jobs that cannot be affected.

## Out of scope

- The website itself: platform, pages, comparisons, content. These live in `pixari/OpenTodoWebsite` with its own OpenSpec setup. The changes `website-switcher-pages` and `website-content-hub` move there.
- Changing what the docs say or how the in-app help works.
- Hosting or deploying the website (configured in Coolify for the new repository).

Advances no ROADMAP.md capability. It is repository hygiene that supports the website work.

## Capabilities

### New Capabilities

- `site-bundle`: the contents, versioning, publication and stability of the release artefact the website consumes, including the feature manifest's guarantees.

### Modified Capabilities

- `documentation`:
  - "Documentation website" changes from "the website SHALL publish the documentation" to "every release SHALL ship the documentation website in the site bundle", with search, version, "Edit this page" and no-JavaScript rules unchanged.
  - "Documentation stays complete and correct" stops checking committed generated output and checks the bundle's build instead.

## Impact

- **Repository:** `website/` removed after the switch-over. `web/scripts/docs/build.mjs` output path, `scripts/screenshots.mjs` output path, `Makefile` targets (`docs`, `docs-site-check`, a new `site-bundle`), `.github/workflows/ci.yml` (release job, path filters, preview artefact).
- **Release process:** one more release asset. No change to the binary, image or app.
- **Coordination:** the website repository must consume a bundle before `website/` is deleted here, so the live site never breaks. The switch-over is the last task.
- **Size:** none for the app. The bundle is a few megabytes, mostly screenshots.
