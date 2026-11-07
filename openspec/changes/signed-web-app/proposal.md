# Proposal

## Why

The server delivers the web app's code. For an end-to-end encrypted account, a malicious or compromised server can serve changed JavaScript that captures the passphrase or the key on the next load, and nothing on the device checks that the code it runs is the code that was released. The threat model lists this as **Tampered JavaScript** under "Not defended", and the limits page says the same ([#970](https://github.com/OpenTodoApp/OpenTodo/issues/970)).

The owner's rule for the fix: safe but not invasive. Normal people do nothing; interested people can do something, and it must be easy.

## What Changes

- **A signed file list per release.** The build writes `app-manifest.json`: the version and every file of the web app with its SHA-256. At release time, CI signs it with a release key that lives only in a protected release environment, never on a server. Self-built servers ship the same list unsigned.
- **The service worker installs only verified updates.** It fetches the list, checks the signature with the key it trusts, downloads every file, checks every hash, and switches to the new set in one step. Any failure keeps the last good version and shows one warning: "This update wasn't signed by OpenTodo. It wasn't installed." An older signed version is refused too.
- **The worker is the only door for code.** It answers every app file from the verified set, never from the network. Lazy chunks are checked against the list when first loaded. Scripts never come from anywhere else on the origin, and server pages it passes through cannot reach the app's storage.
- **The Android app is the strongest form.** The key is built into the app, not learned from the server, and the app serves the web app's files to its web view only after checking them. The iOS app warns but cannot refuse yet (design D9).
- **Settings → About** shows "Signed by OpenTodo" with the key's short fingerprint, a link to the website's Security page, and an optional **Verify** button that checks the key on the website. A self-built server shows "Self-built: updates are not signature-checked".
- **A self-built server or a fork can sign with its own key** through one documented build setting, `WEB_SIGNING_KEY`. It is read at build time; the server never holds a private key.
- **Docs say plainly what this does not cover**: a first-ever visit to a hostile server, a server that replaces the service worker itself in a normal browser, and a stolen release key.

No op schema, data model, API route or runtime environment variable changes. The web app's Workbox runtime is replaced by the verifier (three dependencies fewer). Not **BREAKING**: existing installs move to the verifier with their next update.

**Out of scope**: a browser extension that checks pages (like WEBCAT); moving the iOS app to a custom scheme so it can refuse (design D9, a later change); signing preview images built from `main` (question 4); transparency logs; signing anything other than the web app. Implementation is after 1.0 (owner decision of 2026-11-06).

ROADMAP.md: none of its rows. This is hardening item 6.13d of `external-security-review` (the 1.0 "Trust" milestone), deferred after 1.0 as #970.

## Capabilities

### New Capabilities

- `signed-web-app`: the signed file list, the release key and its rotation, how a device verifies, installs and serves the web app, what About shows, self-built servers and the documented limits.

### Modified Capabilities

- `web-app`: "Recovery after a server upgrade" now also covers an update the device refused.
- `native-shells`: the Android app checks the web app's signature itself and serves only verified files; offline start uses that copy.

## Impact

- **Build and release:** a Vite plugin writes the unsigned list; `cmd/websign` (Go standard library only) generates keys, signs and verifies; a `web-sign` CI job on release tags; the image and the release binaries embed the signed list; `web/release-keys.json` holds the public keys.
- **Web:** `web/src/sw.ts` becomes the verifier and also takes in `push-sw.js`; `UpdateBanner`, About, the branding of the page title and icons; `workbox-core`, `workbox-precaching` and `workbox-routing` are removed.
- **Server:** serves `app-manifest.json` with `no-store`, serves `/index.html` unmodified, adds `no-transform` to the app's files and logs the signature state at startup. No new route.
- **Android:** `ShellCache` verifies the list with the built-in key and serves every app file. **iOS:** a native check that warns.
- **Docs:** threat model, limits, `docs/e2ee.md`, a new `docs/security/signed-app.md`, self-hosting (proxies that rewrite files), SECURITY.md (the fingerprint); the website's Security page with the fingerprint and the Verify page.
- **Size:** first load about +0.5 KB gzip (design D12); the worker gets smaller.
