# native-shells Specification

## Purpose
Defines the native shells around the web app: thin, platform-specific apps that load the user's own server, add only what a browser cannot do (system share sheet, device-scheduled reminders, home-screen widgets, biometric unlock, and later a tray and an embedded server), expose a small optional bridge to the web app, and contact nothing but the user's server.

## Requirements

### Requirement: A shell loads the user's server and nothing else
A native shell SHALL load the web app from the server address the user entered, over `https` (or `http` only for `localhost` and private network addresses, with a warning), in a full-screen web view that keeps the app's origin, cookies, local storage, IndexedDB and service worker, exactly like the installed web app. The shell SHALL open network connections only to that server (and, when the web app itself requests them, to the same origin), and, during a sign-in flow that server starts, to the sign-in pages it redirects to. It SHALL collect no usage data, include no analytics, crash-reporting or advertising library, and declare "no data collected" in every store listing. The shell SHALL NOT bundle a copy of the web app: the server serves the app version that matches it.

#### Scenario: Connections stay with the server
- **WHEN** the Android app is used for a session with the device's traffic inspected
- **THEN** every connection goes to the configured server's host and port, or to the sign-in pages of a sign-in flow the server started, and none to any other host

#### Scenario: Server upgraded
- **WHEN** the server is upgraded to a newer release and the Android app is opened
- **THEN** the app loads the new web app from the server without an app update, and the web app's own "Recovery after a server upgrade" behaviour applies

#### Scenario: Plain http to a public host
- **WHEN** the user enters `http://todo.example.com` on the first-run screen
- **THEN** the shell refuses it, explains that a secure address is needed and offers to try `https://todo.example.com`

#### Scenario: Private address over http
- **WHEN** the user enters `http://192.168.1.20:8080`
- **THEN** the shell accepts it after showing that the connection is not encrypted on the way to that address

### Requirement: First-run server screen
On first start, and whenever no server is configured, a shell SHALL show a screen asking for the server address with the device's language, SHALL check the address by requesting the server's health route with the web view's cookies for it, and SHALL name the reason when the check fails (no network, not an OpenTodo server, behind a login page, certificate not trusted, address refused). When the health route answers with a redirect to a sign-in page or with a sign-in page refusing access, the screen SHALL say the server is behind a login page and offer to sign in inside the app; when it answers with a web page, the screen SHALL say so and offer the same. Signing in SHALL use the shell's sign-in flow without the bridge and SHALL end, with the check repeated, once the health route answers. A trusted certificate the user installed on the device SHALL be accepted. The address SHALL be changeable later from the shell's own menu, and changing it SHALL discard the web view's storage for the old server only after the user confirms.

#### Scenario: Not an OpenTodo server
- **WHEN** the user enters `https://example.com`
- **THEN** the screen says the address does not answer as an OpenTodo server and keeps the address for editing

#### Scenario: Behind a login page
- **WHEN** the user enters the address of a server whose login wall redirects `/healthz` to its sign-in page
- **THEN** the screen says the server is behind a login page and offers "Sign in here"; after signing in there, the check passes and the app opens the server

#### Scenario: Self-signed certificate the user trusts
- **WHEN** the home server uses a certificate from a private authority installed in the device's user credentials
- **THEN** the shell accepts the connection, and a certificate the device does not trust is refused with an explanation, never silently accepted

#### Scenario: Change the server
- **WHEN** a signed-in user chooses "Change server" and confirms
- **THEN** the shell forgets the old server's storage, scheduled reminders and widget data, and shows the first-run screen

### Requirement: Offline start
Once the web app has been loaded once, a shell SHALL open offline and show the app from the service worker's precache with the local data, like the installed web app. The first start SHALL need the network and SHALL say so when it is missing.

#### Scenario: Opened in flight mode
- **WHEN** the user has used the Android app before and opens it with no network
- **THEN** the Today list shows the locally stored tasks, and the sync indicator reads offline

#### Scenario: First start offline
- **WHEN** the app is opened for the first time with no network
- **THEN** the first-run screen explains that the first start needs a connection, and retries when the network returns

### Requirement: The bridge is optional and versioned
A shell SHALL expose a bridge object `window.opentodoShell` to pages of the configured server's origin only, carrying `bridge` (an integer version, 1 for this change), `platform` (`android`, `ios`, `desktop`), `app` (the shell's version string), `capabilities` (the names the shell implements) and the methods of that version. The web app SHALL use the bridge only when it is present and SHALL behave identically without it; a method a shell does not list in `capabilities` SHALL NOT be called. A shell with a lower bridge version than the web app expects SHALL still work for the capabilities both know, and the web app SHALL show a one-line notice in Settings when the shell is older than the server's minimum.

#### Scenario: Web app in a browser
- **WHEN** the web app runs in an ordinary browser tab
- **THEN** `window.opentodoShell` is undefined and every screen behaves as specified elsewhere

#### Scenario: Bridge on another origin
- **WHEN** the web view shows a page of another origin (a sign-in page during a sign-in flow)
- **THEN** that page has no `window.opentodoShell` and no script of the shell runs in it, and links to other sites outside a sign-in flow (an "Open in maps" link) open in the system browser instead of the web view

#### Scenario: Older shell
- **WHEN** a shell with `bridge: 1` and `capabilities: ["reminders", "share"]` loads a web app that also knows `widgets`
- **THEN** reminders and sharing work, no widget data is published, and Settings says the app is older than this server expects

### Requirement: Share sheet into the capture screen
The Android shell SHALL register as a share target for text, links and files (`SEND` and `SEND_MULTIPLE` for `text/*`, `image/*` and `application/*`). A shared text or link SHALL open the app's capture screen with the same `title`, `text` and `url` the web share target receives; shared files SHALL be handed to the capture screen with the same hand-over the browser extension uses, so the existing limits (at most 10 files, the per-file limit, 100 MB in total, hygiene rules) apply unchanged. Nothing SHALL be saved without the user's confirmation; a share while offline SHALL work like the web app's offline share.

#### Scenario: Share a link from a browser
- **WHEN** the user shares a page from Chrome to OpenTodo
- **THEN** the capture screen opens in the app with the page's title and URL, and saving creates the task with that URL as its origin

#### Scenario: Share two photos
- **WHEN** the user shares two photos from the gallery to OpenTodo
- **THEN** the capture screen lists both as files and the task carries them as attachments after Save

#### Scenario: Share before the server is set
- **WHEN** the app has no server configured and receives a share
- **THEN** the first-run screen opens, and the share continues on the capture screen once the server is saved

### Requirement: Reminders scheduled on the device
A shell SHALL deliver reminders without a push service: the web app, while it runs in the shell, SHALL hand the shell the reminders due in the next 7 days (reminder id, task id, firing time, and the title only when the device's "include task titles" option is on and the account is not encrypted) whenever they change, and the shell SHALL schedule each as an exact alarm and show a system notification at its time, titled from the handed-over title or a generic text in the device's language. The shell SHALL refresh the schedule at least hourly by running the web app briefly in the background, so a reminder created on another device fires on this one. A notification SHALL offer Snooze 10 min and Dismiss, which SHALL act through the web app's own reminder operations (opened in the background), and a tap SHALL open the task. The schedule and the handed-over titles SHALL be stored only in the app's private storage and SHALL be deleted on sign-out, on lock of an encrypted account and when the server is changed.

#### Scenario: Reminder fires with the app closed
- **WHEN** a reminder is due at 15:00, the app was last open at 14:00 and is closed
- **THEN** the phone shows a notification at 15:00 with the task's title (or the generic text), without any push service being involved

#### Scenario: Reminder set on another device
- **WHEN** a reminder for 18:00 is created on the user's laptop at 16:00 and the phone's app stays closed
- **THEN** the phone has scheduled it by 17:00 at the latest and shows the notification at 18:00

#### Scenario: Snooze from the notification
- **WHEN** the user taps Snooze 10 min on the notification
- **THEN** the reminder's firing time moves by ten minutes as one reminder operation that reaches every device, and the notification shows again ten minutes later

#### Scenario: Encrypted account
- **WHEN** the account uses end-to-end encryption and the device is unlocked
- **THEN** the handed-over schedule carries no titles, the notification reads the generic text, and the task opens decrypted on tap

#### Scenario: Locked device
- **WHEN** the user locks the encrypted account on the device
- **THEN** the shell deletes its schedule and shows no reminder until the device is unlocked again

### Requirement: Widgets
The Android shell SHALL offer a Today widget (today's and overdue open tasks: title, time and priority, the count in the header, a tap opening the task) and a quick-add widget (one field opening the app's quick add with the typed text). The widgets SHALL read only data the web app published through the bridge (the Today list while the app runs or during the hourly refresh), stored in the app's private storage, and SHALL show the time of the last update. For an encrypted account the widget SHALL show titles only from a publication made while the device was unlocked, and SHALL show counts only once the device is locked. The widget SHALL never make a request of its own.

#### Scenario: Today widget after a change elsewhere
- **WHEN** a task is completed on the laptop at 09:00 and the phone's app stays closed
- **THEN** the widget no longer lists it after the next hourly refresh, and the header shows when it was updated

#### Scenario: Quick add from the widget
- **WHEN** the user types "Call the plumber tomorrow 9am" in the quick-add widget
- **THEN** the app opens with quick add showing that text parsed, and the task exists only after the user confirms

#### Scenario: Locked encrypted account
- **WHEN** the device is locked
- **THEN** the Today widget shows "3 tasks today" and no title

### Requirement: Biometric unlock of an encrypted account
On a shell with the `biometric` capability and a device with enrolled biometrics, the unlock screen of an encrypted account SHALL offer "Unlock with fingerprint or face next time" after a successful passphrase unlock. Accepting SHALL store the account key in the shell's private storage, encrypted with a hardware-backed key that can only be used after the device's biometric prompt; the key SHALL never leave the device and SHALL never be sent to the server. The next unlock SHALL offer the biometric prompt first and the passphrase as the alternative. The stored key SHALL be deleted on lock, sign-out, server change, passphrase change, encryption turned off, and when the device's biometric enrolment changes.

#### Scenario: Unlock with a fingerprint
- **WHEN** the user has enabled biometric unlock and opens the locked app
- **THEN** the device's biometric prompt appears, and a successful scan unlocks the account without the passphrase

#### Scenario: Biometrics changed
- **WHEN** a new fingerprint is enrolled on the phone after biometric unlock was enabled
- **THEN** the stored key is unusable, the app asks for the passphrase and offers to enable biometric unlock again

#### Scenario: Passphrase changed elsewhere
- **WHEN** the passphrase is changed on another device and this device next syncs the key record
- **THEN** biometric unlock keeps working, because the account key did not change, and a changed account key (encryption turned off and on again) invalidates it

### Requirement: Shell release and store readiness
CI SHALL build the Android shell on every change under `mobile/` and on every tag, SHALL attach a signed release APK and AAB to tagged releases with the same build provenance as other release assets, and SHALL fail the release when the shell build fails. The repository SHALL hold the store listing texts, the privacy declaration ("no data collected") and the F-Droid metadata so the listings can be published from the repository. The shell's version SHALL be the app's release version.

#### Scenario: Release assets
- **WHEN** the tag `v0.10.0` is pushed and every gate passes
- **THEN** the release carries `opentodo-android-0.10.0.apk` and `.aab` with provenance attestations next to the extension zip

#### Scenario: Change outside mobile
- **WHEN** a pull request changes only server code
- **THEN** the Android job does not run

### Requirement: Follow-up shells share the contract
The iOS shell and the desktop shell SHALL implement the same bridge contract and the same guarantees of this capability (the user's server only, no data collected, optional bridge, no bundled web app except where the desktop shell embeds the server itself), each as its own change (`ios-shell`, `desktop-shell`).

#### Scenario: Web app code is platform-neutral
- **WHEN** the iOS shell later exposes `platform: "ios"` with the same capabilities
- **THEN** the web app's bridge module works without a change, and only the shell-specific folder is new

### Requirement: Sign-in flows stay in the shell
A shell SHALL keep a sign-in flow in its web view: when a navigation on the server's origin is answered with an HTTP redirect to another origin (a login wall in front of the server, or the server's own single sign-on start route), the shell SHALL follow it in the web view, together with the redirects that follow, the pages and form submissions of the origins the flow has visited, and navigations the person did not start. The flow SHALL end when a navigation reaches the server's origin or when the person leaves it; 15 minutes after its last navigation it SHALL stop leading to origins it has not visited. A redirect the shell does not follow SHALL NOT open the system browser and SHALL NOT leave an empty screen: the shell SHALL say that signing in did not continue and offer to sign in again from the server's address. A link the person opens to an origin the flow has not visited, and every link to another origin outside a flow, SHALL open in the system browser. While a page of another origin fills the web view, the shell SHALL show that page's host and a control that returns to the server; back SHALL return to the server when a page of the server came before, and the sign-in pages SHALL NOT stay in the back history once the flow reaches the server. Cookies the flow sets SHALL be kept across restarts of the app. The background run SHALL never follow a navigation off the server's origin and SHALL never open a browser; an expired login-wall session SHALL make it end without effect.

#### Scenario: Server behind a login wall
- **WHEN** the server is behind a login wall whose sign-in page is on another origin, and the person opens the Android app
- **THEN** the wall's sign-in page shows in the app with its host named above it and without `window.opentodoShell`, and after signing in the web app opens with the bridge, and nothing opened in the system browser

#### Scenario: Health route bypassed, the app behind the wall
- **WHEN** the wall lets `/healthz` and `/api/*` through but guards the app's page, so the first-run check passes without signing in
- **THEN** opening the app shows the wall's sign-in page inside the app, and after signing in the web app opens; no browser opens and the screen is never left empty

#### Scenario: Sign-in that cannot continue
- **WHEN** a sign-in page, 15 minutes after the flow's last navigation, redirects to a site the flow has not visited
- **THEN** the shell neither follows it nor opens the browser, and shows that signing in did not continue with "Sign in here", which starts again from the server's address

#### Scenario: Single sign-on in the app
- **WHEN** the person taps "Sign in with" the server's identity provider in the Android app
- **THEN** the provider's sign-in page opens in the app and, once it sends the person back, the person is signed in to the web app in the app

#### Scenario: Leaving a sign-in page
- **WHEN** a sign-in page of another origin is showing and the person taps the close control or back
- **THEN** the app loads the server again and the flow is over

#### Scenario: Link on a sign-in page
- **WHEN** the person taps a link on the provider's page to a site the flow has not visited
- **THEN** that site opens in the system browser and the sign-in page stays

#### Scenario: Restart after signing in
- **WHEN** the person signed in through a login wall and the app is closed and opened again within the wall's session lifetime
- **THEN** the web app opens without the wall asking again

#### Scenario: Wall session expired in the background
- **WHEN** the hourly background run starts after the wall's session expired
- **THEN** it does not follow the redirect, opens nothing and ends; the next time the app is opened, the wall asks inside the app

#### Scenario: Provider refuses web views
- **WHEN** the identity provider refuses sign-in in an embedded web view
- **THEN** its error page shows in the app with the way back to the server, and the documentation names the fallbacks (a password or passkey, or a bypass at the wall)

### Requirement: Shared bridge fixtures
The payloads the web app hands a shell (the reminder schedule, the widget data, and their sign-out reset) and the addresses a shell opens the app at (notification buttons, a task, quick add) SHALL be kept as fixture files in the repository, produced from the web app's own code and paired with what a shell must read from each. The web app's tests SHALL fail when the files no longer match what the web app produces, and SHALL check that the web app reads every address in them; each shell's unit tests SHALL parse the same files and build the same addresses.

#### Scenario: The web app renames a payload field
- **WHEN** a change renames `fireAt` in the reminder schedule the web app hands over
- **THEN** the web test fails until the fixtures are regenerated, and with the new fixtures the Android unit tests fail until the shell reads the new field

#### Scenario: The shell changes an address
- **WHEN** a change makes the Android shell open notification actions at another address
- **THEN** the Android unit test of the addresses fails against the shared fixture

### Requirement: Obsidian note links leave the shell
A shell that lists the capability `obsidian-links` SHALL accept, through its external-link method, an Obsidian note link of the exact form the `task-management` "Origin validation" requirement defines (`obsidian://open` with only `vault` and `file`) and hand it to the operating system, which opens Obsidian or does nothing when Obsidian is not installed. Every other `obsidian:` URL, and every other custom scheme, SHALL still be refused; the external-link allow-list otherwise stays `https`, `http`, `mailto` and `tel`. The shell SHALL NOT navigate its web view to an `obsidian:` URL. The check SHALL be a pure function covered by each shell's unit tests and by the shared bridge fixtures.

#### Scenario: Open a note from the Android app
- **WHEN** the user taps the origin chip of a task whose origin is `{kind: "obsidian", id: "Daily/2026-10-29.md", url: "obsidian://open?vault=Notes&file=Daily%2F2026-10-29"}` in the Android app with Obsidian installed
- **THEN** Obsidian opens the note, and the shell's web view stays on the task

#### Scenario: Another action refused
- **WHEN** the web app, or a page script, calls the external-link method with `obsidian://new?vault=Notes&name=x`
- **THEN** the shell opens nothing and the web view does not navigate

#### Scenario: Obsidian not installed
- **WHEN** the user taps an Obsidian chip on an iPhone without Obsidian
- **THEN** nothing opens, the app stays as it was, and the chip's menu still offers "Copy link"

#### Scenario: Older shell
- **WHEN** a shell released before this change loads a web app that knows `obsidian-links`
- **THEN** the shell does not list the capability, the web app never calls the external-link method with an Obsidian link, and the chip offers "Copy link"

### Requirement: System bars follow the app's theme
A shell MAY offer the bridge capability `system-bars`, which lets the web app hand it the bar colour as `#rrggbb` and whether the icons on it must be light. A shell that offers it SHALL colour the phone's status bar (and on Android the navigation bar) with it and choose legible icons (on iOS, where the status bar is drawn over the page, the colour SHALL fill the web view's background and under-page area and the icons MAY follow the system appearance), SHALL remember the last colour and apply it at its next launch before the page is drawn, and SHALL ignore a malformed payload. The web app SHALL hand the colour over whenever the bar colour changes, and SHALL NOT call the method on a shell that does not list the capability. The payload SHALL be part of the shared bridge fixtures.

#### Scenario: Theme change on Android
- **WHEN** the user switches the dark side's theme while the Android app is in dark mode
- **THEN** the status and navigation bars take the new theme's bar colour in the same moment the page changes

#### Scenario: Malformed payload
- **WHEN** the shell receives a colour `red` or a payload without `dark`
- **THEN** it keeps its current bars and logs nothing that contains the payload beyond its length

#### Scenario: Fixture changes
- **WHEN** a change renames the `dark` field of the payload
- **THEN** the web fixture test fails until the fixture is regenerated, and then the Android and iOS unit tests fail until the shells read the new field
