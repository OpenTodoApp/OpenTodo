# Design

## Context

How the web app reaches a device today:

- `web/src/sw.ts` is built by `vite-plugin-pwa` in `injectManifest` mode. Workbox precaches the files listed in `self.__WB_MANIFEST`, which is inlined into `sw.js`, serves navigations from the cached `index.html`, imports `push-sw.js` with `importScripts`, and calls `skipWaiting()` and `clientsClaim()`. A new worker that takes control raises the "A new version of OpenTodo is ready." banner (`web/src/lib/appUpdate.ts`, `UpdateBanner.tsx`).
- The file list lives inside `sw.js`, so every release changes `sw.js`, and the browser installs whatever `sw.js` the server sends. Nothing checks who built it.
- The server embeds `internal/web/dist`. On a branded instance it rewrites the page and `manifest.webmanifest` on the way out (`internal/httpapi/branding.go`); on the demo it adds a `noindex` tag (`web.InjectNoIndex`). The page's CSP is `cspBase` (`script-src 'self'`), and the worker replaces it on navigations with the latest policy the server sent, for the assistant's provider origins.
- The Android app keeps its own copy of the precache (`ShellCache`, read from `sw.js`) and serves it only when offline. The iOS app gets a service worker only in the one-server build (`ios-shell` D2).

One platform fact shapes the whole design. **A service worker cannot vet its own successor.** The browser fetches `sw.js` for updates without passing through the current worker, installs any new bytes, and lets the new worker take over. A server can also send `Clear-Site-Data` and wipe the worker and the app's storage. So in an ordinary browser, a check in the worker stops a server that sends changed files the ordinary way, but not a server that replaces the worker itself. Only code the server does not deliver, such as a native app, can make the check binding. D8 and D9 follow from this.

The maintainer approved the design on pull request #1025 (2026-11-08), answered its six questions (recorded under "Maintainer's answers" at the end) and added three requirements: report-only first (D17), real hosting tested before refusal (D17, task group 6), and a refusal message that names the likely cause and links to a help page (D6, D18).

## Goals / Non-Goals

**Goals:**
- An installed app runs only code that a key it trusts signed, as far as the platform allows, and says plainly where it cannot.
- Official builds check with no setup. Self-built servers keep working and say they are unchecked.
- The private key never touches a server. The browser uses WebCrypto, the build uses the Go standard library.
- `make dev` and every existing test run without a key.
- Nobody gets stuck because of the check while it is new: it reports before it refuses (D17), and every refusal says what probably caused it and how to fix it (D18).

**Non-Goals:**
- Protecting a first-ever visit to a hostile server.
- A browser extension or browser changes (WEBCAT, isolated web apps).
- Signing the server binary or the image. Cosign already does that.
- A transparency log.

## Decisions

### D1. What is signed: one file list per release

The build writes `app-manifest.json`, an envelope around a payload:

```json
{
  "format": 1,
  "payload": "<base64url of the manifest bytes>",
  "signatures": [{ "key": "<full fingerprint>", "sig": "<base64url, 64 bytes r||s>" }]
}
```

The payload is the manifest, verified as the exact bytes, so nobody has to canonicalize JSON:

```json
{
  "app": "opentodo-web",
  "version": "1.3.0",
  "refuse": false,
  "keys": [{ "spki": "<base64 SubjectPublicKeyInfo>", "role": "release" }, { "spki": "…", "role": "recovery" }],
  "worker": { "path": "sw.js", "sha256": "…" },
  "files": {
    "index.html": { "sha256": "…", "size": 1830, "load": "install" },
    "assets/index-3fa1c2.js": { "sha256": "…", "size": 301772, "load": "install" },
    "assets/MapView-9c01aa.js": { "sha256": "…", "size": 812044, "load": "lazy" },
    "t.html": { "sha256": "…", "size": 990, "load": "lazy" }
  }
}
```

- **Every file in `dist` is listed**: `index.html`, `t.html`, every chunk, the locale and help chunks (`help.json` is compiled into a chunk), the CSS, the fonts, the icons, `appearance.js`, `registerSW.js` and the theme credit `.md` files. `install` files are what Workbox precaches today. `lazy` files (the map, `t.html` and its chunks) are verified when first used.
- **`push-sw.js` goes into `sw.js`.** A worker's `importScripts` fetch does not pass through any worker, so a separate file could not be checked. The worker is one file, and its hash is listed (D8 uses it).
- **What is signed** is the domain string `opentodo-web-manifest/v1\n` followed by the payload bytes, so a signature can never be reused as anything else.
- **`keys`** is the key set future updates must be signed with (D3).
- **`refuse`** is the switch from report-only to refusal (D17). An unsigned list may also carry `"build": "preview"` (D4).
- **Self-built builds** write the same envelope with `"signatures": []`.

A Vite plugin writes the unsigned envelope after the bundle is written. Signing is a separate step on the finished `dist`, so CI signs exactly the files it embeds.

### D2. ECDSA P-256 with SHA-256, no dependency

The check runs in four places: the browser (WebCrypto), Android (minSdk 26), iOS (CryptoKit) and Go (the build, the release check and the server's startup log).

- **ECDSA P-256 works in all four with no added code.** It is in every browser's WebCrypto, in Android's platform `Signature("SHA256withECDSA")` well before API 26, in CryptoKit, and in Go's `crypto/ecdsa`.
- **Ed25519 does not yet.** WebCrypto has it only from Chrome 137, Firefox 129 and Safari 17. Android's platform has it only from API 33, so supporting it would mean bundling a verifier.
- **Encoding.** Signatures are stored raw (r||s, 64 bytes), which is what WebCrypto reads. Android converts them to DER in about twenty lines.
- **Signing.** Go's ECDSA signing uses hedged nonces, so a weak random source in CI does not leak the key.
- **Fingerprints.** A key's fingerprint is the SHA-256 of its SubjectPublicKeyInfo. The full one is 64 hex characters. The short one is the first 16, in four groups: `3F2A 9C41 7B0D E615`. About shows the short one. Verify (D10) compares the full one.

New code: `internal/websign` (manifest, envelope, verify, fingerprints, version order; standard library only), `internal/websign/sign` (key generation and signing) and `cmd/websign` (`keygen`, `sign <dist>`, `verify <dist|url>`). The server links only `internal/websign`, for its startup log. A test like `TestServerDoesNotLinkCrypt` keeps `internal/websign/sign` out of the server binary: the split into two packages is what makes that test possible.

### D3. Keys: one release key, one recovery key, rotation by overlap

- **Release key.** It is generated offline and stored as the secret `WEB_SIGNING_KEY` of a GitHub environment, `web-signing`. Only `v*` tags may use that environment (deployment rule), the maintainer is its required reviewer, so every release waits for his approval before it is signed (answer 2), and only one job references it (D4). It never reaches a server, an image or an artifact.
- **Recovery key.** A second key pair, generated offline and never in CI. It is in the trusted set from the first signed release and is used only to rotate after the release key is lost or stolen. The maintainer keeps it offline, with a second copy in a separate place (answer 3). Its public half is committed; its private half never leaves those two copies.
- **The rotation procedure is written down and rehearsed** (answer 3) in `docs/security/signed-app.md`: generate, publish the fingerprint, sign one release with both keys, drop the old key after six months, and the lost-key path with the recovery key. It is rehearsed once with throwaway keys against a test server (task 5.7) before it is ever needed.
- **Public keys** are in `web/release-keys.json` in the repository, marked official. Their fingerprints are also in SECURITY.md, `docs/security/signed-app.md`, the website's Security page and every release's notes.
- **Accepting a list.** An update is accepted when at least one signature verifies with a key in the device's trusted set. After a verified install, the device's trusted set becomes the list's `keys`.
- **Planned rotation.** One release lists the old and the new key and is signed by both. Releases keep both signatures for six months, then drop the old key. A device offline for longer than that refuses the next update, and the person clears the site's data as `docs/signed-updates.md` explains (answer 5).
- **Lost release key.** A release signed with the recovery key lists a new release key. Devices accept it because the recovery key is trusted.
- **Stolen release key.** The same rotation, published loudly, removes the stolen key. Until a device installs that release, a hostile server holding the stolen key can still serve it signed code (D15).
- **Both keys lost.** Installed apps refuse every update and keep running the last good version. Each person clears the site's data or reinstalls, as the help page explains (answer 5). This is the price of having no server-side override.

### D4. Release pipeline: build once, sign once, embed everywhere

1. The `web-build` job builds `dist` once on the tag and uploads it as an artifact.
2. A new `web-sign` job runs only on `v*` tags, in the `web-signing` environment, so it waits for the maintainer's approval (answer 2). It is the only job that reads the key. It runs `websign sign`, which first checks that every file matches the unsigned list and the version matches the tag, then writes the signed envelope. It uploads `web-dist-signed` and nothing else. When the secret is not set (a fork, or before the maintainer adds it), the job says so and uploads the unsigned `dist` unchanged, so the release stays green and its builds read "Self-built" until a key exists.
3. The image and the release binaries are built from `web-dist-signed`. The Dockerfile's web stage stays for pull requests and local builds, and a build context (`--build-context web-dist=…`) replaces it on tags.
4. The `image` job's smoke test runs `websign verify http://…/` against the running container with the official keys. A release whose served files fail the check does not publish.
5. The release job attaches `app-manifest.json` to the GitHub release. That is the public record of what each version's code is.
6. **`latest` is never signed** (answer 4). The image built from every merge to `main` writes `"build": "preview"` into its unsigned list, and About reads "Preview build: updates are not signature-checked". The label is unsigned, so it proves nothing; it only tells people which unchecked build they run.

`scripts/repo-checks.test.mjs` adds three checks: only `web-sign` references the environment, the official keys in `web/release-keys.json` match the fingerprints in SECURITY.md and `docs/security/signed-app.md`, and the test key (D11) is never in an official build's key set.

### D5. Trust on first use, two modes, one ratchet

The worker keeps a **trust record** in its own IndexedDB database, `opentodo-app`, separate from the app's Dexie database. It holds the mode, the trusted keys, the current and previous versions with their payloads, and the hashes of recently refused lists.

- **First install (no record).** The worker fetches the list. If a key built into this worker (the official keys, or an own-key build's key, D11) signed it and every `install` file matches, the mode is **signed**. If the list is unsigned, or signed by an unknown key, the mode is **self-built**: hashes are still checked, but not who signed them. If files don't match, nothing is installed, and the page runs from the network as on any first visit.
- **Self-built to signed.** When a list signed by a built-in key arrives, a self-built install moves to signed. This happens, for example, when a server switches from a local build to the official image.
- **Signed to self-built never happens.** An unsigned list or one signed by an untrusted key is refused.
- **Signing out keeps the trust record.** Signing out and the revoked-device wipe (`web/src/lib/revocation.ts`) skip the trust record. Otherwise a server could revoke a session to send a device back to first use.
- **A new worker keeps it too.** A legitimate new `sw.js` reads the same record and never trusts again from scratch.

How the built-in key is trusted at all: it arrives inside the first worker, from the server. That is trust on first use, and D15 says so. A person can compare it once with Verify (D10). The Android app does not depend on the server for the key (D9).

### D6. How the worker gets and installs updates

- **When it checks.** After each navigation it serves (inside `waitUntil`, without delaying the page), and when the page asks on focus or when the network returns, at most once a minute. It fetches `/app-manifest.json` with `cache: 'no-store'`. A payload identical to the installed one ends the check.
- **What it verifies, in order:**
  1. the envelope parses and `app` is `opentodo-web`;
  2. a signature verifies with a trusted key;
  3. the version is strictly higher than the installed one, by semver precedence (`1.0.0-rc.2 < 1.0.0`);
  4. every `install` file downloads with the listed size and SHA-256.

  Files whose hash is already in the current set are copied over, not downloaded again.
- **Atomic install.** Files go into a staging cache, `opentodo-app-<version>`. Only when every file is present and verified does one IndexedDB transaction move `current` to the new version and `previous` to the old one. Then every other cache is deleted. A failure or interruption at any step leaves `current` untouched and deletes the staging cache. Nothing half-installed is ever served.
- **When `index.html` changes.** It is one file of the list like any other. The worker never takes `index.html` from the network for a navigation. A new page is served only after the list that names it was verified and installed. A different `index.html` on the server with no new signed list is never used.
- **Telling the page.** After the switch, the worker posts `{type: "opentodo-app", state: "ready", version}`, and the existing banner shows "A new version of OpenTodo is ready." with "Reload to update". Open tabs keep working: the previous version's set stays cached until the next install, so their lazy chunks still load. The `vite:preloadError` reload remains for a tab older than that.
- **`sw.js` still changes with every release in phase 1.** It keeps Workbox's inlined list of files (`self.__WB_MANIFEST`, as plain data; no Workbox code is left), because the Android app versions already installed read that list from `sw.js` for their offline copy (`ShellCache.precacheEntries`) until the Android app reads `app-manifest.json` (D9, phase 2). A side effect: the browser's own update cycle is unchanged, a new release still installs a new worker, and the worker's install runs the check. `controllerchange` stays the release signal until `sw.js` stops changing per release.
- **Refusing** (only once refusal is on, D17). The worker posts `state: "refused"` with a cause, and the page shows one banner without a reload button. It names the likely cause and links to the help page (D18):
  - a file that doesn't match or is missing: "This update wasn't installed. A proxy or the server changed the app's files."
  - an unsigned list, an untrusted key or a bad signature: "This update wasn't installed. It isn't signed by OpenTodo." A device that trusts an own-key build's key reads "It isn't signed with this app's key."
  - an older signed version, or the same version with other files: "This update wasn't installed. The server went back to an older version."
  - a list that can't be read: "This update wasn't installed. The server's list of files couldn't be read."

  Each ends with the link **What to do**, which opens the help page "Signed updates" in the in-app Help (D18). Each refused list is announced once (its hash is remembered, five at most). The banner can be dismissed, and About keeps the state until a good update arrives.
- **Reporting** (report-only, D17). The same checks run in the same order and the same cause is recorded, but the update is installed anyway, by the same staging and switch, and no banner is shown. About shows the result.
- **Downgrades are refused.** An older signed release may have a hole that was fixed later, and a hostile server could serve it again to use that hole. The app's local database also cannot move to an older schema: Dexie upgrades are one way, and an older app cannot open a newer database. An operator who rolls back the server leaves installed apps on the newer version, and sync keeps working because the op schema is additive. The docs say so. Self-built mode does not enforce the order, because its lists prove nothing anyway.
- **Offline.** No check, no warning. The current set serves everything. A download cut off by the network is discarded and retried on the next check.

### D7. The worker is the only door for code

A check is only as good as the paths around it. The worker answers every same-origin `GET`:

| Request | Answer |
| --- | --- |
| A path in the current or previous list | The verified cached file, with headers the worker writes |
| A `lazy` file not cached yet | Fetched, checked against the list, cached, then served. A mismatch fails the request (the screen's error boundary shows it) and posts `refused` |
| Any other path outside the data paths | 404 from the worker, never the network |
| A data path: `/api/`, `/healthz`, `/dav/`, `/feeds/`, `/oauth/`, `/.well-known/`, `/mcp`, `/branding/`, `/manifest.webmanifest` | Passed to the network, with two limits below |

- **No script from a data path.** A request whose destination is `script`, `worker`, `sharedworker` or `style` is refused for a data path. A JSONP-style answer from `/api/` can never run.
- **Server documents can't reach the app's storage.** A navigation to a data path (an attachment opened in a tab, an OAuth page) gets `Content-Security-Policy: sandbox` added by the worker. The document then has an opaque origin and cannot read the app's IndexedDB, caches or cookies. Task pages (`/t/<secret>`) and public lists (`/public/…`) are served from the verified `t.html` and `index.html`, with the server's `Referrer-Policy: no-referrer` and `noindex` headers kept.
- **The worker writes the page's CSP.** `script-src 'self'`, `worker-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` and the rest of `cspBase` come from the signed build. From the server's latest policy, the worker takes only `connect-src` origins, `https:` only, which is what the assistant needs. A shared fixture keeps the TypeScript policy equal to Go's `cspBase`. So scripts come only from the worker's origin, and every script on that origin comes from the verified set.
- **Branding moves into the page.** The worker serves the signed `index.html` byte for byte. The page sets the branded title and icon links on start from the copy it already keeps (`web/src/lib/branding.ts`). The server keeps rewriting pages it serves directly (first visits, no worker), and keeps serving `manifest.webmanifest` and `/branding/` images as data.
- **Server changes.** `/index.html` is served unmodified, with no branding and no `noindex`, so the worker can download the signed bytes. `app-manifest.json` is served `no-store`. Every app file gets `no-transform`, so caching proxies don't rewrite files. No new route: the existing public handler for `/` serves all of it.

**Phase 1 and phase 2.** Phase 1 (report-only, D17) serves listed files from the verified set, checks lazy files, refuses scripts, workers and styles from data paths, and writes the CSP from the build. The rules that could break an honest setup land with refusal (phase 2), each after it is measured: the 404 for unknown paths (a route the worker doesn't know would stop working), the sandbox on data-path documents (Chrome's PDF viewer and the OAuth consent form must be checked inside a sandbox first), `t.html` and `/public/` from the verified set, and `push-sw.js` folded into `sw.js` (until then the worker still imports it, and its hash is checked like any other file's but cannot bind the import). The data paths gain `/dav/`, `/feeds/`, `/branding/` and `/public/` in phase 2 as well; phase 1 keeps today's navigation deny list exactly.

### D8. What an ordinary browser cannot stop, and the one warning it gives

In a browser, D5 to D7 stop changed files delivered the ordinary way: a changed chunk, page or locale, an unsigned build, an older build. They don't stop:

- **A replaced `sw.js`.** The browser installs it without asking the current worker. The new worker can read the app's IndexedDB, which holds plaintext, and serve any page.
- **`Clear-Site-Data`.** It wipes the worker and the trust record. The next visit is a first visit.
- **The first visit itself**, and any visit before the worker is installed.

A cheap warning still catches careless or accidental cases. When the page sees a new worker installing or taking control, it fetches `sw.js` and compares its SHA-256 with `worker.sha256` in the verified list. If they don't match after a fresh check, it shows: "This server changed how the app checks updates. Don't enter your passphrase, and ask the server's operator." A determined server defeats this: it can serve good bytes to the page and others to the browser's update fetch, or install while no tab is open, for example after a push it sends itself. The docs call it a warning, not a defence. The code loads only when a worker changes.

The same fact is also the escape hatch for bugs. A broken verifier can always be replaced by the next release's `sw.js`.

The warning lands in phase 2, with refusal: while checks only report, `sw.js` changes with every release (D6) and the warning would only repeat what About records.

### D9. The native apps: Android checks the code itself (phase 2); iOS comes later

The Android part is phase 2: it refuses by nature (a file that fails is never handed to the web view), so it lands with refusal, after report-only has shown that real setups pass. Until then the Android app keeps today's offline copy, read from `sw.js` (D6). iOS is not part of this change (answer 6): both the native warning below and loading the app in a way the iOS app can check move to a separate change after `ios-shell`. The text below stays as the plan for both.

The Android app is the strong form, because its code doesn't come from the server:

- **The keys come from the APK.** `web/release-keys.json` is built into it. The APK's own signature (the release certificate in `docs/android-app.md`) vouches for them. No trust on first use for the key.
- **It serves every app file.** In signed mode, `shouldInterceptRequest` answers every `GET` for an app path from `ShellStore`, which holds only verified files. A missing file is fetched, checked against the verified list and stored before it is answered. A mismatch is a 404. Data paths pass through, with D7's rules: no scripts, and the sandbox CSP on documents. Today `ShellCache` is used only offline; now it is used always.
- **It installs updates atomically.** `ShellCache.refresh` reads `app-manifest.json` instead of parsing `sw.js`, applies D6's checks in Kotlin (`org.json`, `MessageDigest`, `Signature`), and keeps using `ShellStore.replace`, which already swaps the directory only when every file is present. Downgrades are refused. Results reach the page through the bridge and show the same banners.
- **No service worker inside the app.** The bridge advertises a new capability, `verified-files`. With it, the page doesn't register a worker and removes an existing one. The shell also answers every worker request (`ServiceWorkerController`) with 404, so a worker can't load even if one is registered. The shell's own store already covers offline, and push and share are native.
- **It shows the state natively.** The shell's server screen shows "Signed by OpenTodo · 3F2A 9C41 7B0D E615" and a Verify action that opens the website in the browser. The server cannot fake a native screen.
- **Mode per server.** A server whose list is unsigned or signed by an unknown key gets self-built mode, which is today's behaviour, and the native screen says "Self-built: updates are not signature-checked". Signed to self-built is refused, as in D5. A shell built with an operator's key (D11) trusts that key instead.

What remains: a server first met in self-built mode stays unchecked, and whoever can sign APKs with the release certificate can change the key.

**The iOS app warns but can't refuse.** `WKWebView` lets an app serve its own files only for a custom scheme, never for `https`, so the shell can't check what its web view loads. In the one-server build (`ios-shell` D2), the web view runs the worker, so it gets the browser-level checks of D5 to D7. On top of that, on every launch and resume the shell fetches `app-manifest.json` itself and checks it with the key built into the app (CryptoKit's `P256.Signing`, the same vectors). If the list is unsigned after being signed, signed by an unknown key, or older than the last one it saw, the shell shows a native alert before the page: "This server's app isn't signed by OpenTodo. Don't enter your passphrase." This catches a server that changed its build. It doesn't catch one that shows the shell a good list and the web view other files. To refuse, the app would have to serve the web app from a custom scheme with the API on `https`, which changes cookies, the API's cross-site check and the CSP. That is a change of its own, after `ios-shell` (answer 6). The bridge's `verified-files` capability stays off on iOS.

### D10. About and Verify

Settings → About gets one row, **App code**, built from `SettingRow` and the copy in `settingsCopy.ts`:

| State | Status | Line |
| --- | --- | --- |
| Signed with an official key | "Signed by OpenTodo" | `3F2A 9C41 7B0D E615` · Security page link · **Verify** |
| Signed with another key | "Signed with this server's key" | the short fingerprint · **Verify** |
| Self-built | "Self-built" | "Updates are not signature-checked." |
| Preview build (`latest`, D4) | "Preview build" | "Updates are not signature-checked." |
| Last update refused | a warning `Notice` under the row: "This update wasn't installed." with the cause and **What to do** (D6, D18) | |
| Last update failed the check while reporting (D17) | a warning `Notice`: "The last update didn't pass the check. It was installed, because checks only report for now." with the cause and **What to do** | |

- **Copy diagnostics.** The row has a **Copy diagnostics** action that copies one line a person can paste into an issue or a support chat: `opentodo-app-code version=1.3.0 mode=signed key=3F2A9C417B0DE615 refuse=off check=failed cause=changed-file path=assets/index-3fa1c2.js at=2026-11-08T10:12:00Z`. It holds no account data, only the trust record's summary.
- **No record yet.** Without a trust record (no worker: `make dev`, a plain-http address, the first visit before install), the row is not shown.

- **The Security page link** opens `https://open-todo.app/security#app-signing`, where the fingerprints are published.
- **Verify** opens `https://open-todo.app/security/verify#<full fingerprint>` in a new tab, or in the system browser inside a shell. That static page compares the fragment with its published list and says "This is OpenTodo's release key." or "This key is not one of OpenTodo's." A fragment is never sent to any server. It is a link the person opens, not a request the app makes, so the no-third-party-calls rule holds and the CSP needs no change.
- **What Verify proves.** In a browser, it checks which key the app trusts. It cannot prove that the code showing the row is honest, because a hostile worker could draw the same row. The docs say so, and point to the Android app's native screen for a check the server cannot fake.
- **The version.** About also shows the app version the device runs. When the server runs another one, it says "This server runs 1.4.0".

### D11. Self-built servers, forks, host mode, the demo, development

- **Self-built.** `make web` and `docker build` without a key write the unsigned envelope. About reads "Self-built: updates are not signature-checked". Hashes are still checked, which catches broken files and rewriting proxies.
- **Own key: the one operator setting.** Set `WEB_SIGNING_KEY` to a private key file: a make variable for `make web` and `make build`, or the BuildKit secret `web_signing_key` for `docker build`. The build signs `dist` with it and makes its public key the build's only built-in key. `go run ./cmd/websign keygen` makes the key pair. The key is used on the build machine only, never by the running server. A shell built with `make android WEB_SIGNING_PUBKEY=…` trusts it. Moving an installed base from the official key to an own key, or back, needs a release signed by the old key that lists the new one. Otherwise each device resets.
- **Forks** either use the same setting or replace `web/release-keys.json`. Their About says "Signed with this server's key", unless they mark their own key official, which Verify exposes.
- **Host mode.** One binary means one signed list for every tenant. Trust is per origin, so per tenant host name, and needs nothing in `internal/host`.
- **The demo** runs the official image and is checked like any server. Its `noindex` tag stays on pages the server serves directly. Crawlers don't run workers.
- **Development.** `make dev` serves through Vite without a worker (`vite-plugin-pwa` dev mode stays off), so nothing is checked and nothing changes. Unit tests use fakes. The e2e signing tests sign with `internal/websign/testdata/test-key.pem` through the same `WEB_SIGNING_KEY` setting. A repo check keeps that key out of official builds.
- **The list is written by a build step, not a Vite plugin.** `npm run build` runs `scripts/app-manifest.mjs` after `vite build`, once `vite-plugin-pwa` has written `sw.js`, whose hash the list needs; a plugin's `closeBundle` would race the worker build. Every way of building the web app (`make web`, the Dockerfile, CI) goes through `npm run build`. The step reads `OPENTODO_VERSION` for the version (`0.0.0-dev` without it) and `OPENTODO_BUILD=preview` for the preview label (D4).

### D12. Interactions

- **Update banner.** It is the same one-line `role="alert"` strip (`UpdateBanner`), with two new texts. A refused update has a close button and no "Reload to update". `appUpdate.ts` gets a `refused` reason. `ready` replaces `controllerchange` as the release signal, because the worker no longer changes with each release.
- **Safe area.** No new surface. The banner sits where it does today, under the status-bar backdrop. `scripts/e2e-safe-area.mjs` adds the refused state.
- **Offline.** As D6. Offline start in a browser is unchanged: the current verified set serves everything.
- **Bundle budget.** New first-load code: the banner texts and the message listener in `appUpdate.ts`, and the branding title and icons on start, about 0.3 to 0.6 KB gzip. The About row, Verify and the diagnostics line load with Settings. The D8 check is a lazy import. The verifier itself is in `sw.js`, which the budget does not measure. Replacing `workbox-core`, `workbox-precaching` and `workbox-routing` with about 300 lines makes `sw.js` smaller, even with `push-sw.js` folded in later. The budget is measured when the work lands; if the first load passes it, the budget is raised by the measured amount with this change named in its comment.
- **Unlocking an encrypted account.** Nothing changes in `e2ee.ts`. The unlock screen comes from the verified set, so a refused update never blocks unlocking: the last good code asks for the passphrase. The refused banner shows above the unlock screen like anywhere else.
- **Interface budget.** No chrome is added above a list, no task property, no sidebar destination, no scroll region and no shortcut. About gains one row ("App code": 2 words; lines under 90 characters). All banner and row texts go through `t()` in every catalog.

### D13. Data model, size and memory

- **Server data:** none. No op field, migration, setting or route. The images' and binaries' `dist` gains `app-manifest.json`: about 600 files at 120 bytes each, so about 70 KB, or about 30 KB compressed. The server links the verify half of `internal/websign`, a few KB of standard library code. Runtime memory: the file list is read once at startup for the log line.
- **Device data:** the `opentodo-app` IndexedDB database (D5) and up to two caches of the app, current and previous, so twice today's precache at most, briefly.
- **Dependencies:** three fewer (`workbox-*`), none added. `vite-plugin-pwa` stays for the web manifest and to build the worker.

### D14. What the docs will say afterwards

- **Threat model, "Malicious server for an encrypted account".**
  - *Defended:* "Serving changed or older web app files to an installed app: the app installs only a file list signed by a trusted key, with every file's hash checked, and keeps the last good version otherwise. In the Android app, the key is built into the app and the app serves every file to its web view only after checking it."
  - *Mechanism:* `web/src/sw.ts`, `internal/websign`, `ShellCache`.
  - *Verified by:* the tests of D16.
  - *Not defended:* "**Tampered JavaScript, in some cases.** In a browser, a server can replace the service worker itself, or clear the site's data, and then serve any code. A first visit, and any visit before the app is installed, runs whatever the server sends. A stolen release key signs code that every device accepts until a rotation reaches it. The iOS app warns but cannot refuse."
  - *Web client:* the worker as the only door, the CSP the worker writes, and the sandboxed server documents.
  - *Accepted risks:* the operator line becomes "…only while the operator does not change the served code, which installed apps check where the platform allows (see [Signed app code](signed-app.md))."
- **Limits, "The code".** "Installed apps check that updates are signed. In a browser, a malicious server can still replace the update check itself, and a first visit is not checked. The Android app checks the code itself. [Signed app code](signed-app.md) explains what is covered."
- **`docs/e2ee.md`.** The same bullet, shortened, with the advice: "If you don't trust the server, use the Android app, and compare the fingerprint in About once."
- **`docs/security/signed-app.md` (new).** What is signed, the fingerprints, Verify, the modes, report-only and the switch to refusal (D17), rotation and its rehearsal, and the own-key setting.
- **`docs/signed-updates.md` (new, D18).** The help page the refusal message links to.
- **While report-only mode is on**, the threat model's *Defended* line says so plainly: "Report-only for now: the app checks and records, but still installs an update that fails. Refusal is switched on in a later release." The limits page says the same.
- **Self-hosting docs.** Proxies that rewrite HTML or JavaScript (Cloudflare Rocket Loader, email obfuscation, injected analytics) make updates fail the check. Turn that rewriting off, and check the deployment with `websign verify https://your.server/`. A rolled-back server leaves apps on the newer version.

### D15. What stays undefended

- A first-ever visit to a hostile server, and the first contact of the Android app with a server that has never been signed.
- In a browser: a server that replaces `sw.js` or sends `Clear-Site-Data` (D8).
- A stolen release key, until a rotation reaches each device. A stolen Android release certificate.
- A compromised CI that runs the `web-sign` job on a malicious tree. Tag protection and the maintainer's approval of every signing (answer 2) limit this.
- The iOS app until it serves files itself (D9, answer 6).
- While report-only mode is on (D17), everything: a failed check is recorded and shown in About, but the update is installed.
- Code that was signed but has a bug. A signature says who built the code, not that it is safe.

### D16. Tests that prove it

- **Shared vectors.** `internal/websign/testdata/vectors.json` holds valid envelopes, a bad signature, an unknown key, a wrong domain string, a mutated payload, two signatures during a rotation, and the recovery key. They are read by Go (`TestVectors`), the worker's tests (`web/src/sw.verify.test.ts`), the Android tests (`ManifestVerifyTest`) and iOS (`ManifestVerifyTests`), and listed in `docs/contracts.md`.
- **Worker** (`web/src/sw.test.ts`, vitest with fake caches, fake-indexeddb and Node's WebCrypto):
  - a tampered chunk is refused, the old set still serves, and `refused` is posted;
  - a valid update is installed only after every file verifies, and an update cut off mid-download leaves `current` unchanged;
  - an older signed version is refused;
  - an equal version with a different payload is refused;
  - an unsigned list is refused in signed mode, and a signed list moves a self-built install to signed;
  - a tampered lazy chunk fails and an intact one is cached;
  - a script from `/api/` is refused, and a document from a data path gets the sandbox CSP;
  - the CSP keeps `script-src 'self'` whatever the server sends;
  - offline, there is no check and no warning;
  - signing out leaves the trust record.
- **Browser end to end** (`scripts/e2e-signed.mjs`, Playwright against real servers signed with the test key):
  - v1 installs;
  - v2 with one byte changed in a chunk: in report-only mode it is installed and About shows the failed check with the cause and the path; with refusal on, the banner reads "This update wasn't installed. A proxy or the server changed the app's files." and About still shows v1;
  - a correctly signed v2 shows "A new version of OpenTodo is ready." and v2 after the reload, with the check passed;
  - a signed v0 is recorded as `older` (report-only), or refused with "The server went back to an older version." (refusal on);
  - with the server stopped, a reload opens the app from the verified set.
- **Go:**
  - `go test ./internal/websign` covers keygen, sign and verify round trips and the sign step refusing a `dist` that doesn't match its list;
  - `internal/web` serves `/index.html` unmodified and `app-manifest.json` with `no-store`;
  - a test keeps the signing code out of the server binary;
  - `TestSecurityHeaders` covers `no-transform`.
- **Android:** `ShellCacheTest` covers:
  - verified refresh, a tampered file, an unknown key and a downgrade;
  - self-built mode for an unsigned server;
  - the move from self-built to signed;
  - the worker requests refused.
- **CI:** the release smoke test runs `websign verify` against the built image, and the repo checks of D4.
- **Report-only** (`sw.test.ts` and `scripts/e2e-signed.mjs`): a tampered chunk is installed and recorded as `changed-file` with its path; About shows the notice and the diagnostics line; nothing is refused. A list with `refuse: true` turns refusal on, and a later list with `refuse: false` does not turn it off.

## Risks / Trade-offs

- **Proxies that rewrite files** cause refused updates on otherwise honest servers. Mitigations: report-only first, so these setups show up in About before anything is refused (D17), the tests on PikaPods and behind Cloudflare, `no-transform`, the help page (D18), `websign verify` for operators, and the refused message in About until fixed.
- **A device can get stuck** after a legitimate change: a rollback, a switch to a self-built server, or a key change without overlap. The way out is to clear the site's data or reinstall, as the help page explains (answer 5). Allowing these changes silently would defeat the check.
- **Report-only proves nothing on its own.** While it is on, a hostile server is recorded, not stopped. It is a short phase, and the docs say it is on.
- **A verifier bug could block updates.** The next release's `sw.js` always replaces it in a browser. The Android app updates through its store.
- **The browser guarantee is weaker than it sounds.** D8 and the docs say so in plain words. The strong form is the Android app.
- **Storage.** Two copies of the app are kept briefly. Cache sizes are already bounded by the browser's quota.

## Migration

- **Browsers.** The first signed release ships a new `sw.js`. The old Workbox worker is replaced as usual. The new worker finds no trust record, trusts the release's list on first use (signed mode on official images) and deletes the Workbox caches. People see nothing beyond the usual "A new version" banner.
- **Android.** An app update brings the key. On a server still older than the first signed release, `app-manifest.json` is missing, so the server is treated as self-built, which is today's behaviour. It moves to signed with the server's first signed release.
- **Servers.** Nothing to configure.

### D17. Report-only first, then refusal

The maintainer's first addition: for the first release or releases, the check runs and records its result, but still installs the update. Refusal is switched on only after real setups have been seen to pass.

- **Phase 1, report-only.** Every check of D5 to D7 runs exactly as it will when refusing: the signature, the trusted key, the version order, every file's size and hash, the lazy files. The worker records the result in the trust record: passed, or the first failure with its cause (`unsigned`, `unknown-key`, `bad-signature`, `older`, `changed-file` or `missing-file` with the path, `no-list`). Then it installs the update anyway, through the same staging and one-step switch, so the installed files are the ones the server sent. The mode and the trusted keys never move backwards on a failed list: a signed device that installs an unsigned list in this phase is still in signed mode afterwards, and the next good list passes. Nobody sees a banner; About shows the result and the diagnostics line (D10).
- **The switch is a field of the signed list**, `"refuse": true`, which the build copies from `web/release-keys.json` (`"refuse": false` in phase 1). A device starts refusing when it installs a list that verified with a key it trusts and says `refuse: true`. It writes that into its trust record and never goes back, whatever later lists say.
- **Why there, and not a server or worker setting.** The check guards against the server, so a switch the server holds proves nothing:
  - A server-side switch (an environment variable, an owner setting, a header) is held by the operator. A hostile operator, or a careless one, would turn refusal off again.
  - A constant in the worker is no better. The worker is a file the server serves, and in a browser the server can replace it (D8).
  - A field of the signed payload can be set only by whoever holds the release key, so only a release can turn refusal on, and every device can tell. The trust record keeps it on: neither the operator nor an older signed release that still says `false` can turn it off for a device that has seen it on (an older release is refused as a downgrade anyway). Changing the field breaks the signature.
  - A build that signs with its own key (D11) uses the same field from its own `web/release-keys.json`.
- **Phase 2, refusal.** A release sets `refuse: true` once the checks of task group 6 pass: PikaPods, a server behind Cloudflare with Auto Minify and Rocket Loader each on and off (on must show the cause; off must pass), the official image behind nginx and Caddy, and the report-only results of at least one release show no unexplained failure. The phase 2 parts of D7, D8 and D9 land with it.
- **Self-built and preview builds** are unsigned, so refusal never applies to who signed them; in self-built mode the hashes are still checked and reported.

### D18. A refusal says what probably happened, and links to the fix

The maintainer's third addition, so that less experienced people don't get stuck.

- **The cause, named.** Every refusal and every failed report names the likely cause in one sentence (D6): a proxy or the server changed the app's files; the update isn't signed by OpenTodo (the server may run a self-built version); the server went back to an older version; the list couldn't be read.
- **One link, What to do**, opens the page "Signed updates" in the in-app Help. It is built from `docs/signed-updates.md` like every guide, so it opens offline and the app makes no request to another site. The same page is on the website.
- **What the page covers, briefly, one section per cause:**
  - *Cloudflare and other proxies*: turn off Rocket Loader, Auto Minify (where still offered), Email Address Obfuscation and other HTML or JavaScript rewriting for the server's host name; nginx `sub_filter` and injected analytics do the same. `Cache-Control: no-transform` is already sent. Check with `websign verify https://your.server/`.
  - *The server went back to an older version*: the device keeps the newer one and sync keeps working; to follow the rollback, clear the site's data in the browser (the local data downloads again from the server) or reinstall the Android app. There is no reset button (answer 5).
  - *A self-built server*: what self-built, preview and own-key builds show, how to move a server to the official image or to an own key without stranding devices, and how a person gets unstuck after a switch.
  - *If you don't trust the server*: don't enter your passphrase; ask the operator; use the Android app.

## Maintainer's answers (pull request #1025, 2026-11-08)

1. **Ship the browser check even though a hostile server can still replace it?** Yes. It stops tampering delivered the ordinary way and costs almost nothing. The docs say plainly what it doesn't stop and recommend the Android app to anyone who doesn't trust their server.
2. **Should every release wait for the maintainer's approval before it's signed?** Yes. The `web-signing` environment has him as required reviewer (D3, D4).
3. **Who keeps the recovery key?** The maintainer, offline, with a second copy in a separate place. The rotation procedure is documented and rehearsed before it's needed (D3).
4. **Sign the `latest` image built from `main`?** No. Only tagged releases are signed; preview builds say "Preview build: updates are not signature-checked" (D4).
5. **How do people recover after a legitimate rollback or a switch to a self-built server?** Documentation only, no reset button (D18).
6. **Later, make the iPhone app check the code too?** Yes, as a separate change. The iOS warning moves there too (D9).

The original questions, as asked:

1. **Is the browser part worth shipping as it is?** In a normal browser, a hostile server can still replace the part of the app that does the checking, and nothing in the browser can prevent that. Only the Android app makes the check impossible to get around. The browser part still stops ordinary tampering, older versions and broken files, and the docs say plainly what it can't do. Recommendation: ship both, and recommend the Android app to people who don't trust their server.
2. **Should every release wait for your click before it's signed?** GitHub can hold the signing step until you press "Approve". Then someone who gets into CI alone can't sign code. The cost is one click per release, and releases stop being fully automatic. Recommendation: yes, because this key is the most powerful secret in the project.
3. **Who keeps the spare key?** A second, "recovery" key replaces the release key if it's lost or stolen. It must never be on GitHub. Recommendation: you keep it offline, for example on a USB key or a printed copy in a safe place, with a second copy somewhere else.
4. **Should the preview image built from every change on `main` (`latest`) be signed?** Signing every merge means the key is used dozens of times a week, by automated merges. Recommendation: no. Those builds would say "Preview build: updates are not signature-checked", and only releases are signed.
5. **How does someone get unstuck?** After an operator rolls the server back, or switches to a self-built version, devices refuse the change and keep the last good version. Option A: the docs explain how to clear the site's data in the browser, or reinstall the Android app. Option B: a "Reset this app" button in About. A button is easier to use, but a hostile server operator could talk people into pressing it. Recommendation: A, docs only.
6. **Should the iPhone app later load the web app in a way it can check?** Today it can only warn, because iOS doesn't let an app inspect what its web view downloads from a normal web address. Making it refuse means loading the app through the iPhone app itself, which changes how sign-in cookies and addresses work. That is a change of its own. Recommendation: yes, but as a separate change after this one.
