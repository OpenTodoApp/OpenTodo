## Purpose

Lets an installed OpenTodo app run only web app code that a key it trusts signed: what each release signs, how a device checks, installs and serves the code, what Settings shows, how self-built servers and own keys work, and the limits the documentation states.

## ADDED Requirements

### Requirement: Every build lists its files, and releases sign the list
Every web app build SHALL include `app-manifest.json`: the app's version, the key set trusted for later updates, and every file of the built web app with its size and SHA-256, including the page, the task page, every code chunk, the locales, the in-app help, the styles, the fonts, the icons and the service worker. A release build made from a version tag SHALL sign the list with the release key in the release environment. Any other build SHALL ship the list unsigned. The private key SHALL never be included in an image, a binary or an artifact, and SHALL never be read by a running server. The signing step SHALL refuse a build whose files don't match its list.

#### Scenario: Release build
- **WHEN** CI builds the image and the binaries for tag `v1.3.0`
- **THEN** both serve the same `app-manifest.json`, signed with the release key, and the release's smoke test verifies it against the official keys before anything is published

#### Scenario: Local build
- **WHEN** a person runs `make build` without a signing key
- **THEN** the binary serves `app-manifest.json` with no signature, and the server starts normally

#### Scenario: Changed file before signing
- **WHEN** a file in the built web app differs from the hash in its list at the signing step
- **THEN** the signing step fails and nothing is signed

### Requirement: The file list is public
The server SHALL serve `/app-manifest.json` to any request without sign-in, like the web app itself, with `Cache-Control: no-store`. It SHALL serve every file of the list byte for byte at its path, `/index.html` included, with no branding, no `noindex` tag and `no-transform`, while navigations keep their branding and `noindex` tag as before. Serving the list writes nothing, so sync and convergence are unaffected.

#### Scenario: Read without signing in
- **WHEN** a request without a session or token asks for `/app-manifest.json`
- **THEN** the answer is 200 with the list and `Cache-Control: no-store`

#### Scenario: Server without a list
- **WHEN** a device asks a server older than this change for `/app-manifest.json`
- **THEN** the answer is 404, and the device treats the server as self-built

#### Scenario: Branded instance
- **WHEN** a branded instance serves `/index.html`
- **THEN** the bytes are exactly those named in the list, while a navigation to `/` still gets the branded page

### Requirement: Updates are installed only when verified
An installed app SHALL install a new version only when a key it trusts signed the version's list, the version is newer than the installed one, and every file needed offline downloaded with the listed size and SHA-256. It SHALL switch to the new set in one step, only after every file is verified. On any failure it SHALL keep running the version it has, serve nothing from the failed set, and show once, for that list: "This update wasn't signed by OpenTodo. It wasn't installed." A successful install SHALL show "A new version of OpenTodo is ready." with "Reload to update". Offline, the app SHALL make no check, show no warning and keep serving its installed version. A download cut off by the network SHALL be discarded and retried later. No operation is written, so local data, sync and convergence are unaffected.

#### Scenario: Valid update
- **WHEN** the server moves from signed 1.3.0 to signed 1.4.0 while a tab is open
- **THEN** the app verifies and installs 1.4.0, the tab shows "A new version of OpenTodo is ready.", and after the reload About shows 1.4.0

#### Scenario: Tampered chunk
- **WHEN** the server offers a signed 1.4.0 list but one chunk it serves differs by a single byte
- **THEN** nothing of 1.4.0 is installed, the tab shows "This update wasn't signed by OpenTodo. It wasn't installed.", and the app keeps running 1.3.0

#### Scenario: Unsigned update
- **WHEN** an app installed from a signed release is offered an unsigned list
- **THEN** the update is refused with the same message and the app keeps its version

#### Scenario: Interrupted download
- **WHEN** the network drops halfway through downloading 1.4.0
- **THEN** the app keeps serving 1.3.0, shows no warning and tries again on its next check

#### Scenario: Offline
- **WHEN** the device is offline and the app is opened
- **THEN** the installed version opens with its local data and no update message appears

### Requirement: Older versions are refused
An app in signed mode SHALL refuse a signed list whose version is lower than the installed one, or equal to it with different content, keep its version and show once: "This server went back to an older version. It wasn't installed." Sync SHALL keep working with the older server, because the operation schema is additive.

#### Scenario: Server rolled back
- **WHEN** a device runs 1.4.0 and the server is rolled back to signed 1.3.0
- **THEN** the device keeps 1.4.0, shows "This server went back to an older version. It wasn't installed.", and keeps syncing

### Requirement: Trust on first use, and no way back to unchecked
A device's first install SHALL decide its mode for that server. A list signed by a key built into the app gives signed mode. An unsigned list, or one signed by a key the app doesn't know, gives self-built mode: file hashes are checked, signatures are not. A self-built install SHALL move to signed mode when a list signed by a built-in key arrives. A signed install SHALL never move back to self-built mode. The trusted keys and the mode SHALL survive signing out, a revoked device's wipe and a new service worker.

#### Scenario: First install from an official image
- **WHEN** a person opens a server running the official image for the first time and the app installs
- **THEN** the device is in signed mode and trusts the keys the list names

#### Scenario: Server switches to the official image
- **WHEN** a device installed from a self-built server receives a list signed by the official key
- **THEN** the device installs it and from then on refuses unsigned updates

#### Scenario: Sign out
- **WHEN** a person signs out on a device in signed mode and signs in again
- **THEN** the device is still in signed mode and still refuses an unsigned update

### Requirement: Code runs only from the verified set
In a browser, the service worker SHALL answer every request for the web app's files from the verified set and never from the network. A file needed only later, such as the map, SHALL be checked against the list when first loaded. If it doesn't match, the load fails, the update message is shown and nothing is cached. A path that is neither a listed file nor a data path (the API, health, CalDAV, calendar feeds, OAuth, `.well-known`, MCP, branding images, the web manifest) SHALL get a 404 from the worker. A script, worker or stylesheet SHALL never be loaded from a data path. A document from a data path SHALL be opened sandboxed, without access to the app's storage. Task pages and public lists SHALL be served from the verified set. The page's script policy SHALL come from the signed build and allow scripts only from the app's own origin, whatever policy the server sends. Only the server's allowed connection origins are taken from the server.

#### Scenario: Lazy chunk tampered
- **WHEN** an installed app opens the map for the first time and the server's map chunk does not match the list
- **THEN** the map fails to open, the update message is shown, and the chunk is not stored

#### Scenario: Script from the API
- **WHEN** a page asks for `/api/v1/anything` as a script
- **THEN** the worker refuses the request

#### Scenario: Server weakens the policy
- **WHEN** the server sends a content security policy that allows scripts from another origin
- **THEN** the app's pages keep `script-src 'self'`

#### Scenario: Server document opened in a tab
- **WHEN** an installed app opens an address under `/api/` as a page
- **THEN** that page is sandboxed and cannot read the app's local database

### Requirement: Keys rotate without stranding devices
A list SHALL be accepted when any one of its signatures verifies with a trusted key. After an install, the device SHALL trust exactly the keys the installed list names. A release SHALL be able to name a new key while signed by the old one, or by the recovery key that every signed release names.

#### Scenario: Planned rotation
- **WHEN** a release signed with both the old and the new key names only the new key and the recovery key
- **THEN** devices install it, and afterwards refuse a list signed only with the old key

#### Scenario: Lost release key
- **WHEN** a release signed only with the recovery key names a new release key
- **THEN** devices install it and accept the next release signed with the new key

### Requirement: About shows who signed the app
Settings → About SHALL show an "App code" row. When an official key signed the app, the row SHALL show "Signed by OpenTodo" with the key's short fingerprint (four groups of four characters), a link to the website's Security page where the same fingerprint is published, and a **Verify** action. When another key signed it, the row SHALL show "Signed with this server's key" with its fingerprint and **Verify**. When the app is self-built, the row SHALL show "Self-built: updates are not signature-checked". After a refused update, the row SHALL show the refusal message until a valid update is installed. **Verify** SHALL open the website's verify page with the full fingerprint in the address fragment, so no request carries the fingerprint and the app makes no request to the website. About SHALL show the version the device runs, and the server's version when it differs. Offline, the row shows the installed state.

#### Scenario: Official build
- **WHEN** a person opens Settings → About on a device installed from the official image
- **THEN** the row reads "Signed by OpenTodo" with the fingerprint published on the website's Security page

#### Scenario: Verify
- **WHEN** the person presses **Verify**
- **THEN** the website's verify page opens in a new tab and says whether the fingerprint is one of OpenTodo's keys, and the app itself sends no request to the website

#### Scenario: Self-built server
- **WHEN** a person opens Settings → About on a server built without a signing key
- **THEN** the row reads "Self-built: updates are not signature-checked" and nothing fails

### Requirement: A server can sign with its own key
One documented build setting, `WEB_SIGNING_KEY`, SHALL sign a build with the operator's own private key at build time, for `make` and for `docker build`, and make that key the build's only built-in key. A documented command SHALL create a key pair. The running server SHALL need no key and no new environment variable.

#### Scenario: Operator's own key
- **WHEN** an operator builds the image with `WEB_SIGNING_KEY` and people install the app from it
- **THEN** About reads "Signed with this server's key" with that key's fingerprint, and updates the operator signs with that key are installed

### Requirement: Development needs no signature
`make dev` SHALL serve the web app without a service worker and without any signature check. Builds without a key SHALL keep working everywhere, self-built.

#### Scenario: Development server
- **WHEN** a developer runs `make dev` without any key
- **THEN** the app loads and works, and no signature message appears

### Requirement: A changed service worker is reported
In a browser, when a new service worker installs or takes control, the open page SHALL compare the server's service worker with the one in the verified list. If they differ after a fresh check, it SHALL show: "This server changed how the app checks updates. Don't enter your passphrase, and ask the server's operator."

#### Scenario: Unannounced worker
- **WHEN** a tab of a signed install is open and the server starts serving a service worker that no verified list names
- **THEN** the tab shows "This server changed how the app checks updates. Don't enter your passphrase, and ask the server's operator."

### Requirement: The limits are documented
The security documentation SHALL state, in plain words, what the check does not cover:
- a first-ever visit to a hostile server;
- in a browser, a server that replaces the service worker itself or clears the site's data;
- a stolen release key, until a rotation reaches each device;
- the iOS app, which can warn but not refuse.

It SHALL publish the official keys' fingerprints and explain how to verify them.

#### Scenario: Reading the limits
- **WHEN** a person reads the security limits page
- **THEN** it says that a first visit to a malicious server is not protected, and that the Android app checks the code itself
