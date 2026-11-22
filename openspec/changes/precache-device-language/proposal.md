# Proposal

## Why

The first install of the web app downloads every interface catalogue: ten languages, 6.6 MB raw and 2.0 MB gzip of the 14.3 MB the service worker installs (analysis on #1746). A device uses one language, rarely two. With compression at the origin (#1753) the catalogues are still the largest single group a phone downloads at first install and at every update, on mobile data too.

## What Changes

- The service worker installs the catalogue of a language only when this device has used that language. A first install fetches, checks and stores the catalogue of the device's language when the app first loads it, as it already does for the map. An update installs the new version's catalogues for the languages this device holds, so they keep working offline after the update.
- A catalogue the device never used is fetched, checked against the signed list and stored the first time the user picks that language, online.
- Picking a language offline whose catalogue was never fetched keeps the current language and says so in the Language panel. The preference is saved and applied once the catalogue loads, as "Catalog unavailable" already says. This is the one thing an installed app can no longer do offline.
- The Workbox list in `sw.js`, which older Android shells read for their offline copy, stays complete, so those shells keep every language.

Not **BREAKING**: no op, field, route or environment variable changes. The signed list keeps its format; catalogue entries are `lazy` and name their language.

## Out of scope

- Help on first use or after idle (option 3 of #1746): the owner said no.
- Splitting the app's own chunks, or changing which other files install.
- The aisle vocabularies (`aisles/*.json`, a few KB each): they stay installed.
- Native shells' own copies of the web app: unchanged.

ROADMAP item advanced: "Consolidation" (smaller first install on phones) and "Next: Native shells" mobile plan (#1720).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `localization`: "Catalogs load on demand and work offline" now installs only the catalogues of the languages the device uses.
- `app-shell`: "Screens off the start path load on demand" now precaches every emitted chunk except the catalogues of languages the device hasn't used.

## Impact

- **Web build:** catalogue chunks get a recognisable file name (`assets/lang-<code>-<hash>.js`). `web/scripts/app-manifest.mjs` lists them as `lazy` with their language.
- **Service worker** (`web/src/lib/appInstall.ts`): an update also downloads the lazy catalogues of languages the current set holds.
- **First install:** about 6 MB raw (about 2 MB gzip) less for a device in one language; nothing changes for a device in English, which needs no catalogue.
- **Data model, sync, op schema, API, CLI, MCP:** none. **Server, image size, memory:** unchanged.
- **Simple-list users:** nothing visible, apart from the offline case above.
