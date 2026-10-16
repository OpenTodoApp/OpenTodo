# Proposal

## Why

The website's self-host page shows how OpenTodo runs, and its pages use icons the app does not: the platforms it runs on, the port, the data folder, the database and the licence, and the import pages name the export format. The site bundle's manifest does not carry these yet, so the website either repeats them by hand, which its "released facts only" rule forbids, or leaves them out. The facts already live in this repository (the Dockerfile, the release workflow, the export route, LICENSE), so the bundle can read them from there and the website can show them for the version it describes.

## What Changes

- The manifest's `facts` gain `architectures`, `port`, `dataDir`, `database`, `license`, `exportFormat` and `exportFormatVersion`.
- Each is read from its source when the bundle is built (the release workflow's image platforms, the Dockerfile's `EXPOSE` and `VOLUME`, the export route's format and version, LICENSE), so a change there changes the bundle without a second edit.
- The bundle's icon sprite also carries the website-only Lucide icons the website's pages use (`web/src/ui/icons/site-icons.json`, 49 icons such as `server`, `terminal`, `rss`), so the website can draw every icon from the bundle. They are not part of the app's JavaScript.
- The bundle README lists the new facts. Not **BREAKING**: fields are only added (schema 1 stays).

## Out of scope

- Measuring the container image size or idle memory in the release job. `binaryMB` stays the measured size fact; `dockerImageMB` stays optional.
- Any change to the website (its own repository adapts to the bundle).

ROADMAP: supports the site-bundle switch-over (the website deploys from a bundle).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-bundle`: adds a requirement naming the server facts the manifest carries and where they come from.

## Impact

- `scripts/site-bundle.mjs` (`buildManifest` reads the facts; the sprite and `names.json` add the website icons; README text), `scripts/site-bundle.test.mjs`, new `web/src/ui/icons/site-icons.json`.
- App bundle size: unchanged (the website icons are only read by the bundle script).
- No Go code, no dependency, no migration, no new environment variable.
