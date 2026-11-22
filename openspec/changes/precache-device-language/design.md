# Design

## Context

The service worker installs the web app from the signed file list (`signed-web-app`). `web/scripts/app-manifest.mjs` marks each file `install` (downloaded and checked before a version switch) or `lazy` (checked and stored when first used, today the map and the task page). `stage()` in `web/src/lib/appInstall.ts` downloads the `install` files. `fetchLazy()` serves a `lazy` file that isn't stored yet: it fetches it, checks its size and SHA-256 against the list and stores it in the set that lists it. Catalogues are `web/src/locales/<code>.json`, one lazy Vite chunk each, imported by `fetchCatalog` (`web/src/lib/i18n/catalog.ts`). Their chunk names (`de-<hash>.js`) clash with the aisle vocabularies (`aisles/de.json`, also `de-<hash>.js`). The Workbox list injected into `sw.js` is data only, read by Android shells already installed for their offline copy. Neither shell reads `load`.

## Goals / Non-Goals

**Goals:**
- A device downloads only the catalogues of the languages it uses, at first install and at every update.
- A language used once keeps working offline, across updates.

**Non-Goals:**
- Predicting a language the device might use: the system's other preferred languages are not fetched.
- Changing how any other file installs.

## Decisions

**D1. Catalogue chunks are named `assets/lang-<code>-<hash>.js`.**
Rollup's `chunkFileNames` gets a function: a chunk whose facade module is `src/locales/<code>.json` is named `assets/lang-[name]-[hash].js`, and every other chunk keeps `assets/[name]-[hash].js`. The build then tells catalogues from aisle vocabularies by name. `app-manifest.mjs` reads the name. Alternative: Vite's build manifest to map modules to files. It's more moving parts for the same answer.

**D2. The signed list marks a catalogue `lazy` and names its language.**
`loadOf` returns `lazy` for `assets/lang-*`, and the entry gains `"lang": "<code>"`. The signature covers the payload as written, so the field is signed. Older readers ignore it: `internal/websign` decodes `File` without `DisallowUnknownFields`, and the shells don't read `load`. A worker already installed never installs the new list: `sw.js` changes with every release, so the new worker runs the install. `ManifestFile` gains the optional `lang`. Alternative: a third `load` value such as `"language"`. Every reader that switches on `load` would then have to learn it. `lazy` plus a tag keeps today's meaning for everyone else.

**D3. "Languages the device holds" are the catalogues stored in the current set.**
When `stage()` builds its queue, it adds each `lazy` file with a `lang` whose language has a stored catalogue in the current set (a `match` on the current cache for any listed file of that language). No new state, no message from the page, nothing to clear at sign-out: the cache is the record, and it goes with the app's caches. A first install has no current set, so it stores no catalogue. A load through the worker goes through `fetchLazy`, which stores it. The very first visit runs before the worker controls the page, so the page's catalogue came from the network. Once a worker takes control, the page asks again for each catalogue it loaded (`storeCataloguesOnceControlled`, from the page's resource timing), and the browser's HTTP cache usually answers. A catalogue that fails its check at an update fails the install exactly like an `install` file, through the same `fail()` path.
Alternative: the page posts its language to the worker, which keeps it in IndexedDB. It's a second source of truth that can disagree with the cache, and one more thing for sign-out to clear.

**D4. The Workbox list stays complete.**
`globIgnores` in `vite.config.ts` is unchanged, so `self.__WB_MANIFEST` still names every catalogue, and Android shells that read it keep their offline copy whole. The comment beside `loadOf` says that catalogues are the one deliberate difference from the globs. `app-manifest.test.mjs` pins it.

**D5. Offline, an unknown language keeps the current one.**
`loadLanguage` already rejects and keeps the current language. The Language panel already explains a catalogue that could not be loaded, and the preference applies when it loads later. No new interface.

## Data model impact

None: no op, field, route or migration. The signed list gains an optional `lang` on catalogue entries (additive).

## Size

First install of a device in one non-English language: about 6 MB raw, about 2 MB gzip, less. English: about 6.6 MB raw less. Every later update saves the same for the languages not used. The first load and the bundle are unchanged. The server, the image size and memory are unchanged.

## Interface budget

No screen changes.

## Risks / Trade-offs

- [A user who switches languages offline for the first time sees the current language] → It's the existing "Catalog unavailable" behaviour; the docs on languages say it.
- [The device's language is stored only when the app first loads it, so a device that installs the app and goes offline before the first screen loads its catalogue has English until online] → The catalogue is fetched at start, before the first screen. The e2e offline step already waits for the worker to control the page (#1750). A test pins that the language's catalogue is stored after the first start.
- [The help chunk and app chunks are unaffected] → Out of scope by the owner's decision on option 3.
