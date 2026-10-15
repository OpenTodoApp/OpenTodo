# Tasks

## 1. Manifest

- [x] 1.1 Read the server facts in `buildManifest` (`scripts/site-bundle.mjs`) from `.github/workflows/ci.yml` (image platforms), the `Dockerfile` (`EXPOSE`, `VOLUME`), `internal/httpapi/server.go` (export format and version) and `LICENSE`, failing with the source's name when one cannot be read; list them in the bundle README. Verify with `node --test scripts/site-bundle.test.mjs`: the facts of the current tree, and a missing source failing with its name.
- [x] 1.2 Move the website-only icons into `web/src/ui/icons/site-icons.json` and merge them into the sprite and `names.json`. Verify with `node --test scripts/site-bundle.test.mjs`: every app and website icon has one symbol, and an icon in both lists fails.
- [x] 1.3 Build the bundle with `make site-bundle` and check `manifest.json` carries the facts and the website builds from it (`BUNDLE_DIR=… npm run build` in the website repository), then run `make check` and `npx @fission-ai/openspec validate --all --strict`.
