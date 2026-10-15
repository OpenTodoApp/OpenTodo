# Design

## Context

`buildManifest` in `scripts/site-bundle.mjs` already measures facts from the tree (quick-add languages, spec count, docs pages, binary size). The server facts the website shows live in the Dockerfile, the release workflow, the export route and LICENSE.

## Decisions

### D1. Read each fact from its one source
- `architectures`: the `platforms:` line of the image build in `.github/workflows/ci.yml`.
- `port`: the Dockerfile's `EXPOSE`; `dataDir`: its `VOLUME`.
- `exportFormat`, `exportFormatVersion`: the `"format": "opentodo-export", "version": N` literal of the export route in `internal/httpapi/server.go`.
- `license`: LICENSE's title ("GNU AFFERO GENERAL PUBLIC LICENSE … Version 3" → `AGPL-3.0`).
- `database`: `SQLite`, checked against the `modernc.org/sqlite` (or `mattn/go-sqlite3`) requirement in `go.mod`, so it cannot drift silently.

A source that no longer matches its pattern fails the build with the file's name: a wrong fact on the website is worse than a failed bundle.

Alternative considered: constants in the script. Rejected: they would drift from the Dockerfile and the workflow without anything noticing.

### D2. Website icons in the bundle's sprite
The app's sprite is generated from `web/src/ui/icons/lucide.ts` (the icons the app uses). The website's pages need more Lucide icons, which its interim bundle added by hand. They move to `web/src/ui/icons/site-icons.json` (name → inner SVG, the same Lucide ISC licence), and the bundle script merges them into `icons.svg` and `names.json`; an app icon wins on a name clash, and a test fails if an icon is listed in both. The app never imports the file, so its JavaScript does not grow.

### Data model, size and memory
No change to the op log or the store. The manifest grows by a few hundred bytes.
