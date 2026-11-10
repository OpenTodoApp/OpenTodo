---
title: Signed app code
summary: How releases sign the web app's file list, how the app checks every update, the keys and their rotation, report-only mode and what the check does not cover.
audience: developer
section: Internals
specs: []
screens: []
order: 44
---
# Signed app code

The server delivers the web app's code. For an end-to-end encrypted account, a server that changed that code could capture the passphrase on the next load. Signed app code lets an installed app check that the code it runs is the code OpenTodo released (OpenSpec change `signed-web-app`).

**Report-only mode is on.** The app runs every check and records the result in Settings → About, but still installs an update that fails. A later release turns refusal on, after real setups (PikaPods, servers behind Cloudflare) have been seen to pass. Until then the check protects nothing; it shows whether it would.

## What is signed

Every build writes `app-manifest.json` next to the app's files: an envelope around the exact bytes of a manifest.

- **The manifest** names the version, the keys trusted for later updates, the switch from report-only to refusal (`refuse`), the service worker's hash, and every file of the web app with its size and SHA-256 (the page, every chunk, the locales and help, the styles, fonts and icons). Files the app needs offline are marked `install`; the map and the task page are `lazy`, checked when first used. The web app manifest is left out: a branded server rewrites it.
- **The signature** is ECDSA P-256 with SHA-256 over `opentodo-web-manifest/v1\n` followed by the manifest's bytes, stored raw (r‖s). WebCrypto, Android and Go's standard library all verify it with no added code.
- **The signing** happens in CI on release tags only, in the protected `web-signing` environment, after the maintainer approves the run. The private key never reaches a server, an image or an artifact. A build without a key ships the same list, unsigned.

`internal/websign` reads and checks the list; `cmd/websign` makes keys, signs and verifies. The server links only the reading half, and `TestServerDoesNotLinkSign` keeps the signing half out of it.

## The keys

The official public keys are in `internal/websign/release-keys.json`: a release key, kept as a GitHub environment secret, and a recovery key, kept offline by the maintainer with a second copy in another place. Their fingerprints are published in [SECURITY.md](../../SECURITY.md), here and on the website's Security page.

| Key | Fingerprint |
| --- | --- |
| Release | not created yet |
| Recovery | not created yet |

Until the keys exist, official images are unsigned and read **Self-built**.

A key's fingerprint is the SHA-256 of its SubjectPublicKeyInfo. About shows the first 16 characters in four groups (`3F2A 9C41 7B0D E615`). **Verify key** opens `https://open-todo.app/security/verify#<full fingerprint>`, a static page that compares the fragment with the published keys. A fragment is never sent to a server, and it is a link the person opens, not a request the app makes.

## How a device checks

The service worker (`web/src/sw.ts`, `web/src/lib/appInstall.ts`) checks when a new worker installs, after navigations and when a tab comes back into focus or online, at most once a minute:

1. The list parses and is OpenTodo's.
2. A key the device trusts signed it.
3. The version is newer than the newest one the device verified.
4. Every `install` file downloads with the listed size and hash.

Files go into a staging cache, and one write of the trust record switches to the new set. A network failure leaves the current set in place and records nothing. Lazy files are checked when first loaded. The previous set stays for open tabs. Scripts, workers and stylesheets are never loaded from the server's own addresses (`/api/` and the other data paths), and the worker writes the page's Content-Security-Policy from the signed build, taking only the assistant's `connect-src` origins from the server.

**Trust on first use.** The first install decides the mode: a list signed by a key built into the worker gives **signed** mode; an unsigned one gives **self-built** (or **preview** for the image built from `main`). Self-built moves to signed when a signed list arrives; signed never moves back. The trust record lives in its own IndexedDB database, `opentodo-app`, so signing out and the revoked-device wipe keep it.

## Report-only, then refusal

While refusal is off, a failed check is recorded with its cause (`changed-file` or `missing-file` with the path, `unsigned`, `unknown-key`, `bad-signature`, `older`, `no-list`) and the update is installed anyway. A failed check never moves the device's mode or keys.

The switch is the `refuse` field of the signed manifest, copied by the build from `internal/websign/release-keys.json`. A device that installs a list that verified and says `refuse: true` refuses from then on, and no later list, server setting or header turns that off. A switch on the server would be held by the party the check guards against; a constant in the worker could be replaced by the server; only a signed field can be set by the release alone and seen by every device.

With refusal on, a failed update is not installed. The page shows "This update wasn't installed." with the likely cause and **What to do**, which opens [Signed updates](../signed-updates.md).

## Rotating keys

- **Planned rotation.** Generate the new key offline with `go run ./cmd/websign keygen -out new-release.pem`. Add its public key to `release-keys.json` next to the old one, and sign the next release with both (`websign sign -key old.pem -key new.pem`, or both secrets in the job). Keep both signatures for six months, then remove the old key from the file and the environment.
- **Lost or stolen release key.** Sign a release with the recovery key; its list names the new release key and the recovery key. Devices accept it because they trust the recovery key. Publish the change, and the fingerprints, loudly.
- **Both keys lost.** Installed apps keep the last good version and every person starts over on their device ([Signed updates](../signed-updates.md#starting-over-on-this-device)).
- The procedure is rehearsed with throwaway keys before it is needed; the record of the run goes here.

## Your own key

A self-built server can sign its own builds. Make a key pair with `go run ./cmd/websign keygen -out my-key.pem`, keep the private key on the build machine, then build with `make build WEB_SIGNING_KEY=my-key.pem`. The build trusts that key alone, the list is signed with it, and About reads **Signed with this server's key**. The running server needs no key. Moving an installed base from the official key to your own, or back, needs a release signed by the old key that names the new one; otherwise each device starts over.

Check any server with `go run github.com/OpenTodoApp/opentodo/cmd/websign@latest verify https://your.server/` (`-keys release-keys.json` for your own key).

## What the check does not cover

- A first-ever visit to a hostile server, and any visit before the app is installed.
- In a browser, a server that replaces the service worker itself or sends `Clear-Site-Data`: the browser installs a new worker without asking the current one.
- A stolen release key, until a rotation reaches each device.
- The iOS app, which is a later change.
- While report-only mode is on, everything: a failed check is recorded and the update is installed.
- Code that was signed but has a bug: a signature says who built the code, not that it is safe.

## Tests

- Shared vectors `internal/websign/testdata/manifest.vectors.json`, read by `TestVectors` and `web/src/lib/appCode.test.ts` (signatures, unknown keys, the domain string, rotation, the recovery key, version order).
- `go test ./internal/websign/... ./cmd/websign`: key generation, signing and verifying, a signing step that refuses changed, missing or unlisted files and a wrong version, and `TestServerDoesNotLinkSign`.
- `web/src/lib/appInstall.test.ts`: first use, valid updates, a tampered chunk recorded while reporting and refused with refusal on, unsigned, unknown-key and older lists, a cut-off download, offline, lazy chunks, rotation, refusal that cannot be turned off, and the trust record surviving sign-out.
- `web/src/lib/pagePolicy.test.ts` and `TestCSPFixture`: the worker's page policy equals the server's.
- `internal/web` `TestServedAsBuilt` and `TestSecurityHeaders`: `/index.html` unmodified, the list never cached, `no-transform`.
- `scripts/e2e-signed.mjs` (`make e2e-signed`): a real browser against servers signed with the test key.
