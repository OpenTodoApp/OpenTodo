# Design

## Context

- **Docs build output.** `web/scripts/docs/build.mjs` writes two outputs from `docs/*.md`:
  - `OUT_SITE = 'website/docs'`: about 4.9 MB of pages, `search.json`, `docs.css`, `docs.js` and images, committed.
  - `OUT_HELP = 'web/src/generated/help.json'`: the in-app help, committed because the app embeds it.
- **Docs checks.** `docs:check` compares both outputs with a fresh build, plus links, anchors, images, spec coverage and help ids. `scripts/e2e-docs.mjs` serves `website/` and checks the docs site in a browser (sideways scrolling, axe-core, search, no-JS).
- **Screenshots.** `scripts/screenshots.mjs` seeds a server and writes PNGs to `docs/screenshots` (README) and WebP to `website/assets/shots` (about 2.8 MB, landing page). It needs Playwright and a running server, so it runs by hand, not in CI.
- **Tokens and icons.** Colour tokens live in `web/src/index.css` (`--ot-*` blocks for light and the two dark selectors). Icons are vendored Lucide in `web/src/ui/icons/` (`lucide.ts`, `names.json`, `LICENSE-lucide.txt`).
- **Release.** `.github/workflows/ci.yml` has a `release` job on `v*` tags that collects artefacts from `cli`, `extension`, `skill` and `docker` and uploads them with `gh release upload`. Notes come from `scripts/release-notes.sh`.
- **The new home.** The website moves to `pixari/OpenTodoWebsite` (see proposal.md).

## Goals / Non-Goals

**Goals:**
- The website repository needs nothing from this repository except one release asset, or one CI artefact for previews.
- Docs edits produce Markdown diffs only, plus the in-app help.
- No release step needs a browser or a running server.

**Non-Goals:**
- Changing the docs generator's HTML, the search or the in-app help.
- Moving `docs/` out of this repository. Docs stay next to the code and specs they describe, and the in-app help depends on them.

## Decisions

### D1. Bundle layout (v1)
```
opentodo-site-bundle-<version>/
  manifest.json          schema 1: version, date, importFormats[], facts{}
  docs/                  the generated docs site (as website/docs today)
  shots/                 product screenshots, light + dark, WebP
  tokens/tokens.css      :root / dark blocks of --ot-* only (no Tailwind)
  icons/icons.svg        SVG sprite of the Lucide set, plus LICENSE-lucide.txt
  icons/names.json
  changelog.json         [{version, date, sections: {Added: [...], ...}}]
  README.md              the layout above, and the stability rule
```
`facts` holds named, typed values the website may show (for example `dockerImageMB`, `binaryMB`, `languages` for quick add, `specCount`). They're computed during the build, not typed by hand.

### D2. One build script, three callers
`scripts/site-bundle.mjs` (Node, no new dependency, `tar` from the system) assembles the bundle into `dist/site-bundle/` and archives it. The three callers:
- `make site-bundle` locally.
- The `site-bundle` CI job on every push to main, uploading the result as an artefact named with the short commit.
- The `release` job, which adds the archive to the uploaded release assets.

The docs site is built into `dist/site-bundle/docs` by passing an output directory to `build.mjs`, whose `OUT_SITE` becomes a parameter defaulting to `dist/docs-site`.

### D3. Screenshots stay hand-made but leave `website/`
Screenshots need a browser and a seeded server, which a release job shouldn't depend on. They stay hand-generated (`make docs-screenshots` / `scripts/screenshots.mjs`), but their WebP output moves from `website/assets/shots` to `docs/screenshots/site/`, committed as before. The bundle copies them. A docs-check rule fails when a screenshot named in the bundle manifest is missing.

Alternative considered: taking screenshots in the release job. Rejected because it adds Playwright, a server and seeding to the release path, making releases slow and flaky for images that change rarely.

### D4. Tokens and icons extracted, not duplicated
- **Tokens.** The bundle script reuses `web/src/ui/tokens/css.ts`'s parsing (ported to a small `.mjs` helper or run through the existing vitest-free path) to copy the three `--ot-*` blocks verbatim into `tokens.css`, together with the `prefers-color-scheme` / `data-theme` selectors. When `theming` lands, its `[data-accent]` blocks are included too.
- **Icons.** An SVG sprite is generated from `lucide.ts`, with its licence file.

The website therefore gets the same colours and icons without importing app source.

### D5. Manifest fields from the code
- `importFormats` comes from `importer.ProfileNames()` through `ot schema` or a tiny `go run` helper (`cmd/opentodo` flag `--print-formats`, hidden).
- `version` and `date` come from the tag and the CHANGELOG section.
- `facts` come from measured artefacts (image size from the docker job's output, binary size from the build).

The manifest has `"schema": 1`. Fields are only added (spec "Feature manifest").

### D6. Stop committing `website/docs`, then remove `website/`
The order keeps the live site up:
1. The bundle ships, built from `dist/`. `website/docs` is still committed and checked (both exist).
2. The website repository deploys from a bundle, and Coolify is switched to the new repository.
3. This repository deletes `website/`. `docs:check` drops the committed-site comparison and keeps the help comparison. `e2e-docs.mjs` serves `dist/docs-site`, so CI still checks the docs site in a browser.

### D7. CI path filters
A `changes` job uses `dorny/paths-filter`, or an equivalent `git diff` step with no third-party action, to compute `go`, `web`, `docs` and `meta` flags. Go, cross-compile and layout jobs run only when Go, web or embed inputs changed. Docs-only changes run the web job (docs check), the docs browser check and the bundle preview. Tags always run everything.

Choice: a plain `git diff --name-only` step, to avoid a new third-party action in the release path.

## Risks / Trade-offs

- [The website breaks if the bundle layout changes] → Layout v1 is documented in the bundle's README, and renames keep the old path for one release (spec "Stable bundle layout").
- [A release without screenshots] → The docs check fails when manifest-listed screenshots are missing, so this is caught in CI, not by visitors.
- [Path filters skip a job that mattered] → Tags run everything, and the filters are conservative (any file under `internal/`, `cmd/`, `web/` or `go.*` triggers Go jobs).
- [Size] → The bundle is about 8 MB (docs 4.9 MB, shots 2.8 MB) per release. No change to the binary or image, and no runtime effect.

## Migration Plan

Follow D6. Rollback before step 3 is trivial, since both paths exist. After step 3, rolling back means restoring `website/` from git history and pointing Coolify back.

## Open Questions

- Whether `facts` should also carry test and spec counts for the site's "built in the open" section. Additive, so it can be decided by the website repository later.
