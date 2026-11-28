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
On first start, and whenever no server is configured, a shell SHALL show a screen asking for the server address with the device's language, SHALL check the address by requesting the server's health route with the web view's cookies for it, and SHALL name the reason when the check fails (no network, not an OpenTodo server, behind a login page, certificate not trusted, address refused). The shell SHALL request `/api/v1/health` first and, unless that answers as OpenTodo or the connection or certificate failed, `/healthz`, so a server whose proxy answers `/healthz` itself and a server from before `/api/v1/health` both pass. When the health route answers with a redirect to a sign-in page or with a sign-in page refusing access, the screen SHALL say the server is behind a login page and offer to sign in inside the app; when it answers with a web page, the screen SHALL say so and offer the same. Signing in SHALL use the shell's sign-in flow without the bridge and SHALL end, with the check repeated, once the health route answers. A trusted certificate the user installed on the device SHALL be accepted. The address SHALL be changeable later from the shell's own menu, and changing it SHALL discard the web view's storage for the old server only after the user confirms.

#### Scenario: Not an OpenTodo server
- **WHEN** the user enters `https://example.com`
- **THEN** the screen says the address does not answer as an OpenTodo server and keeps the address for editing

#### Scenario: Behind a login page
- **WHEN** the user enters the address of a server whose login wall redirects `/healthz` to its sign-in page
- **THEN** the screen says the server is behind a login page and offers "Sign in here"; after signing in there, the check passes and the app opens the server

#### Scenario: Behind a proxy that answers /healthz
- **WHEN** the user enters the address of a server behind Pomerium, which answers `/healthz` with a plain `OK`
- **THEN** the check passes on `/api/v1/health` and the app opens the server

#### Scenario: A server before 1.0.1
- **WHEN** the user enters the address of a server that has no `/api/v1/health`
- **THEN** the check passes on `/healthz` and the app opens the server

#### Scenario: Self-signed certificate the user trusts
- **WHEN** the home server uses a certificate from a private authority installed in the device's user credentials
- **THEN** the shell accepts the connection, and a certificate the device does not trust is refused with an explanation, never silently accepted

#### Scenario: Change the server
- **WHEN** a signed-in user chooses "Change server" and confirms
- **THEN** the shell forgets the old server's storage, scheduled reminders and widget data, and shows the first-run screen

### Requirement: Offline start
Once the web app has been loaded once, a shell SHALL open offline and show the app from the service worker's precache with the local data, like the installed web app. Where that origin cannot install a service worker (plain http other than localhost), the shell SHALL keep the same precache itself after a successful load and open from that copy. The first start SHALL need the network and SHALL say so when it is missing.

#### Scenario: Opened in flight mode
- **WHEN** the user has used the Android app before and opens it with no network
- **THEN** the Today list shows the locally stored tasks, and the sync indicator reads offline

#### Scenario: Server on the local network switched off
- **WHEN** the user has opened the Android app on `http://192.168.1.20:8080` and opens it again with that server switched off
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
The Android shell SHALL offer a Today widget and a quick-add widget (one field opening the app's quick add with the typed text). The Today widget SHALL show today's and overdue open tasks as a list that scrolls, up to the 50 the web app publishes: a header with the count, a button that opens quick add, and the time of the last update; a heading "Earlier" above the overdue tasks and "Today" above the rest when both exist; and per task the title and, when set, its time, its due date (overdue tasks only) and its project. A tap on a task SHALL open it in the app. When the web app's publication says it can complete tasks, each row SHALL have a completion circle: a tap SHALL hide the task from the widget at once and have the web app complete it through its own operations, in a background run of the app, exactly as completing it in the app does (a repeating task moves to its next occurrence). The shell SHALL never write task data itself. Offline, the completion SHALL be stored on the device as an operation and synced with the next sync; it converges with edits on other devices through the op log like any other completion. A task hidden this way SHALL reappear if no publication confirms the completion within 30 minutes. The web app SHALL apply a completion address only in a background run, never in the visible app. The widgets SHALL read only data the web app published through the bridge (the Today list while the app runs or during the hourly refresh), stored in the app's private storage, and SHALL use the theme's colours in light and dark at every size the launcher allows. For an encrypted account the widget SHALL show titles only from a publication made while the device was unlocked, and SHALL show counts only, without completion circles, once the device is locked. The widget SHALL never make a request of its own.

#### Scenario: Today widget after a change elsewhere
- **WHEN** a task is completed on the laptop at 09:00 and the phone's app stays closed
- **THEN** the widget no longer lists it after the next hourly refresh, and the header shows when it was updated

#### Scenario: A long Today list
- **WHEN** the web app publishes 20 tasks for today, two of them overdue
- **THEN** the widget lists all 20 in a list that scrolls, the two overdue ones under "Earlier" with their due date, and the rest under "Today"

#### Scenario: Complete a task from the widget
- **WHEN** the user taps the circle of "Call the plumber" in the Today widget
- **THEN** the row disappears and the count drops by one at once, and the web app completes the task in a background run, so the laptop shows it completed after the next sync

#### Scenario: Complete a task offline
- **WHEN** the phone has no network and the user taps a task's circle in the widget
- **THEN** the completion is stored on the phone as an operation and reaches the server with the next sync, and the widget does not list the task in the meantime

#### Scenario: Complete a repeating task
- **WHEN** the user taps the circle of a task that repeats every week
- **THEN** the task moves to its next occurrence, as completing it in the app does

#### Scenario: An older server
- **WHEN** the web app's publication does not say it can complete tasks
- **THEN** the widget lists the tasks without completion circles

#### Scenario: A completion address in the visible app
- **WHEN** another app opens the visible OpenTodo app at an address asking to complete a task
- **THEN** nothing is completed

#### Scenario: Add from the Today widget
- **WHEN** the user taps the add button in the Today widget's header
- **THEN** the app opens with quick add, and a task exists only after the user confirms

#### Scenario: Nothing left
- **WHEN** the web app publishes no task for today
- **THEN** the Today widget says there is nothing left for today

#### Scenario: Quick add from the widget
- **WHEN** the user types "Call the plumber tomorrow 9am" in the quick-add widget
- **THEN** the app opens with quick add showing that text parsed, and the task exists only after the user confirms

#### Scenario: Locked encrypted account
- **WHEN** the device is locked
- **THEN** the Today widget shows "3 tasks today", no title and no completion circle

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
A shell that lists the capability `obsidian-links` SHALL accept, through its external-link method, an Obsidian note link of the exact form the `task-management` "Origin validation" requirement defines (`obsidian://open` with only `vault` and `file`) and hand it to the operating system, which opens Obsidian or does nothing when Obsidian is not installed. Every other `obsidian:` URL, and every other custom scheme, SHALL still be refused; the external-link allow-list otherwise stays `https`, `http`, `mailto` and `tel`, and on Android also a `geo:` point of the form `geo:<lat>,<lon>` or `geo:<lat>,<lon>?q=<lat>,<lon>` with coordinates in range, which the Android shell SHALL hand to the maps app and, when no app opens it, open as the same point on openstreetmap.org in the browser. The shell SHALL NOT navigate its web view to an `obsidian:` URL. The check SHALL be a pure function covered by each shell's unit tests and by the shared bridge fixtures.

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

#### Scenario: Open in maps from the Android app
- **WHEN** the user taps "Open in maps" on a task's location with coordinates in the Android app
- **THEN** the phone's maps app opens at that point, or the browser opens it on openstreetmap.org when no maps app is installed, and the web view stays on the task

#### Scenario: Another geo link refused
- **WHEN** a page hands the Android shell `geo:0,0?q=pizza`
- **THEN** the shell opens nothing

### Requirement: System bars follow the app's theme
A shell MAY offer the bridge capability `system-bars`, which lets the web app hand it the bar colour as `#rrggbb` and whether the icons on it must be light. A shell that offers it SHALL colour the phone's status bar (and on Android the navigation bar) with it and SHALL show light icons when the payload asks for them and dark icons otherwise, whatever the phone's own appearance is (on iOS, where the status bar is drawn over the page, the colour SHALL fill the web view's background and under-page area). Choosing the icons SHALL NOT change the appearance the page sees from the system. A shell SHALL remember the last colour and icon choice and apply them at its next launch before the page is drawn, and SHALL ignore a malformed payload. The web app SHALL hand the colour over whenever the bar colour changes, and SHALL NOT call the method on a shell that does not list the capability. The payload SHALL be part of the shared bridge fixtures.

#### Scenario: Theme change on Android
- **WHEN** the user switches the dark side's theme while the Android app is in dark mode
- **THEN** the status and navigation bars take the new theme's bar colour in the same moment the page changes

#### Scenario: Dark theme under a light system on iPhone
- **WHEN** the iPhone is in light appearance and the user chooses a dark theme in the app
- **THEN** the status bar icons turn light, and a page that follows the system still sees a light system

#### Scenario: Malformed payload
- **WHEN** the shell receives a colour `red` or a payload without `dark`
- **THEN** it keeps its current bars and logs nothing that contains the payload beyond its length

#### Scenario: Fixture changes
- **WHEN** a change renames the `dark` field of the payload
- **THEN** the web fixture test fails until the fixture is regenerated, and then the Android and iOS unit tests fail until the shells read the new field

### Requirement: Google Play build without location reminders
Until Google Play approves the app's background-location declaration, the Android app built for Google Play (the AAB) SHALL NOT declare `ACCESS_BACKGROUND_LOCATION`, `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`, SHALL NOT list the `geofences` bridge capability, SHALL never ask for location, and SHALL add `store: 'play'` to the bridge object. In that app, Settings → Notifications → Location reminders SHALL show no switch and say that location reminders come to the Google Play version later and that the app from GitHub or F-Droid has them. The APK published on GitHub and built by F-Droid SHALL keep the three permissions and the capability, and its build SHALL stay the reproducible one F-Droid verifies. CI SHALL read the built AAB's and APK's manifests and fail when the AAB declares any of the three permissions or the APK lacks one. This requirement touches no synced data: nothing is stored, and offline behaviour and convergence are unchanged.

#### Scenario: Play app
- **WHEN** a person opens Settings → Notifications in the Android app installed from Google Play
- **THEN** Location reminders reads "Location reminders come to the Google Play version later; the GitHub/F-Droid app has them." with no switch, and Android never asks for location

#### Scenario: GitHub or F-Droid app
- **WHEN** a person opens the same card in the app from GitHub or F-Droid
- **THEN** the switch "On this phone" is there as before, and the APK declares background location

#### Scenario: The permission slips into the bundle
- **WHEN** a change makes the AAB declare `ACCESS_BACKGROUND_LOCATION` again, or removes it from the APK
- **THEN** the Android CI job fails and names the permission and the build

### Requirement: Microphone for voice capture
The Android shell SHALL declare `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`, without which the web view opens no microphone, and SHALL ask for it the first time the web app records, and not before. It SHALL grant audio capture only to a page of the configured server, and SHALL NOT grant the camera from that request. A page of another origin SHALL be refused without a prompt. The microphone feature SHALL NOT be required, so a device without one can still install the app. The web app SHALL ask the shell before it records when the shell lists the `microphone` capability, and SHALL keep today's behaviour when it does not.

#### Scenario: First dictation
- **WHEN** the person taps the microphone in the Android app and has not allowed it
- **THEN** Android asks for the microphone, and allowing it lets the page record

#### Scenario: Another origin
- **WHEN** a page of another origin loaded in the shell asks for the microphone
- **THEN** the shell refuses and Android does not ask

#### Scenario: Already allowed
- **WHEN** the person has already allowed the microphone and taps it again
- **THEN** Android does not ask again and the page records

#### Scenario: Server speech service in the app
- **WHEN** the person has allowed the microphone, chose **This server's speech service** and taps the microphone in Quick Add
- **THEN** Android shows its microphone indicator and the page records, as in Chrome on the same phone

### Requirement: The iOS bridge exists on every server
The iOS app's bridge (`window.opentodoShell` and its message handler) SHALL exist on the pages of the configured server's origin in every build, whatever that server's host. The portable build, which is the one published through TestFlight and the App Store, SHALL NOT declare `WKAppBoundDomains`, not even a placeholder, because WebKit denies user scripts, `evaluateJavaScript` and message handlers outside the declared domains as soon as the key is present. Only a one-server build SHALL declare app-bound domains, and only the hosts its builder names. The page-side origin check SHALL compare against what `location.origin` prints, which leaves out only the scheme's own default port. The message handler's origin check SHALL read the port WebKit reports for a frame's security origin as 0 as the scheme's own default port (443 for `https`, 80 for `http`), never as another port, so a server on its standard port is answered. The iOS tests SHALL load a page from a server on an ordinary host in the real shell and check that the page sees the bridge.

#### Scenario: Widget and reminders on a self-hosted server
- **WHEN** a person installs the App Store build, connects it to `https://todo.example.com` and signs in
- **THEN** the page sees `window.opentodoShell` with `platform: "ios"`, the Today widget shows that day's tasks, and Settings offers the phone's reminders instead of the browser's push text

#### Scenario: The portable build declares no app-bound domain
- **WHEN** the app is built without `OPENTODO_APP_BOUND_HOST`
- **THEN** its Info.plist has no `WKAppBoundDomains` key and no navigation is limited to app-bound domains

#### Scenario: One-server build
- **WHEN** the app is built with `OPENTODO_APP_BOUND_HOST=todo.example.com` and connected to `https://todo.example.com`
- **THEN** its Info.plist lists that host, the web view limits navigation to it, the bridge exists, and the app starts offline from the precache after one online start

#### Scenario: A port that is not the scheme's default
- **WHEN** the configured server is `https://todo.example.com:80`
- **THEN** the bridge's origin check expects `https://todo.example.com:80`, the origin the page reports, and the bridge exists

#### Scenario: A server on the standard port
- **WHEN** the configured server is `https://todo.example.com` and its page calls the bridge, and WebKit reports the frame's security origin as `https`, `todo.example.com`, port 0
- **THEN** the message handler answers the call: links open in Safari, the widget is published, and reminders and the test notification are scheduled

#### Scenario: Port 0 is never another port
- **WHEN** the configured server is `https://todo.example.com:8443` and a frame of `https://todo.example.com` (port 0) calls the bridge
- **THEN** the call is refused

### Requirement: The iOS first-run screen shows the address it uses
The iOS app's first-run screen SHALL show the scheme of the address it will open. An address typed without a scheme SHALL be reached over `https` and SHALL appear in the field as the `https://` origin the app uses once the person leaves the field or connects, never only internally. Plain `http` SHALL be used only when typed, and while a local `http` address is in the field the screen SHALL say that the connection is not encrypted. A host name typed in Unicode SHALL be sent in its ASCII (Punycode) form on every supported iOS version. The Connect button SHALL look and be active as soon as the address is well-formed and SHALL look and be inactive, also to VoiceOver, while it is empty or unusable. After connecting, Settings → About SHALL show the exact server address the app uses under the app's own row. The check SHALL request only the address shown and SHALL NOT follow redirects; nothing on this screen touches task data, so it has no offline or convergence behaviour of its own.

#### Scenario: No scheme typed
- **WHEN** the person types `todo.example.com` and taps Connect
- **THEN** the field shows `https://todo.example.com` and the health check goes to that https address only

#### Scenario: Local http typed on purpose
- **WHEN** the person types `http://192.168.1.20:8080`
- **THEN** the screen says the connection is not encrypted and Connect is active

#### Scenario: Connect follows the address
- **WHEN** the field is empty or holds `not an address`
- **THEN** Connect is drawn and announced as inactive, and it becomes active once the field holds a well-formed address

#### Scenario: The address after connecting
- **WHEN** a connected person opens Settings → About in the iOS app
- **THEN** the "OpenTodo for iOS" row shows the server address the app opened, such as `https://todo.example.com`

### Requirement: Completed widget
The Android app and the iOS app SHALL each offer a **Completed** home-screen widget beside the Today widget, showing the number of tasks the person completed today and a bar per day for the last 7 days, scaled to the busiest of them, with a one-letter weekday under each bar and the time of the last update; a tap SHALL open Statistics. It SHALL read only data the web app published through the bridge with the Today list: today's count and the 7-day series (days and numbers only, never task content), counted by the same rules as Statistics from the same local rows, and stored in the app's private storage (on iOS, the app group the widget shares with the app). The widget SHALL never make a request of its own. While an encrypted account is locked, the web app SHALL publish today's count alone, and the widget SHALL show that count and say it is locked, without bars. A publication from a web app that publishes no completions SHALL leave the widget asking the person to open the app. The bars SHALL use the theme's accent and track colours as the launcher (on iOS, the system) resolves them for light and dark. Completing a task from the widget is out of scope.

#### Scenario: A day's completions appear
- **WHEN** the person completes three tasks today and the web app publishes
- **THEN** the Completed widget shows today's count as three, today's bar is the highest of a week in which no day had more, and the update time is shown

#### Scenario: Recent days as bars
- **WHEN** the widget is shown after a publication
- **THEN** it draws seven bars, oldest on the left, each labelled with its weekday's letter, without making any request, and reads them aloud as each weekday and its count

#### Scenario: The same count as Statistics
- **WHEN** a task completed today is in a project shared with the person and was completed by someone else
- **THEN** the widget counts it exactly as Statistics' Completed does for today

#### Scenario: Locked encrypted account
- **WHEN** the account is encrypted and the device is locked
- **THEN** the web app publishes today's count only, and the widget shows that number and "Locked: today's count only", without bars

#### Scenario: An older web app
- **WHEN** the stored publication has no completions
- **THEN** the widget asks the person to open OpenTodo once

### Requirement: Position for the web app
The Android shell SHALL answer a page's request for the device's position: for a page of the configured server it SHALL ask Android for location (precise or approximate) the first time, and not before, and SHALL give the page the position when either is allowed; it SHALL refuse a page of any other origin without a prompt, and SHALL NOT let the web view keep the answer, so a later refusal in the system settings holds. The Google Play build, which declares no location permission, SHALL refuse without asking. The decision SHALL be a pure function covered by the shell's unit tests. This requirement touches no synced data: the position goes only to the page, which writes it as an ordinary location edit, offline as online.

#### Scenario: Use my location in the Android app
- **WHEN** the person chooses "Use my location" in the Android app for the first time and allows location
- **THEN** Android asks once, and the task's location gets the device's coordinates

#### Scenario: Location refused
- **WHEN** the person refuses Android's location prompt
- **THEN** the editor says the browser did not share the position and nothing is written

#### Scenario: Another origin
- **WHEN** a page of another origin loaded in the shell asks for the position
- **THEN** it is refused and Android does not ask

### Requirement: A shell's pull to refresh yields to the web app
A shell that has its own pull to refresh, which reloads the page (the iOS shell), SHALL list the bridge capability `pull-refresh` in its visible app. A web app that handles a pull down itself (app-shell "Pull down to sync on a touch device") SHALL call the bridge method `pullHandled`, without arguments, on every page load in such a shell, and SHALL NOT call it in a shell that does not list the capability. From that call until another page loads in the web view, the shell SHALL NOT offer its own pull to refresh, so one pull never both syncs and reloads. When another page loads (a reload, a sign-in page, a web app of an older server), the shell's pull to refresh SHALL be back until that page calls the method. A shell without a pull to refresh (the Android shell) SHALL NOT list the capability. The bridge version SHALL stay 1, and the call SHALL be part of the shared bridge fixtures. The call hands over no data, works offline and stores nothing.

#### Scenario: Current web app in the iOS app
- **WHEN** the iOS app shows a web app that handles the pull, and the user pulls Today down
- **THEN** the web app syncs and shows its own mark, the shell's refresh control does not appear, and the page is not reloaded

#### Scenario: Older server
- **WHEN** the iOS app loads the web app of a server that does not know `pullHandled`
- **THEN** the method is never called and pulling down reloads the page, as before

#### Scenario: A sign-in page
- **WHEN** the web view leaves the web app for a sign-in page of another origin
- **THEN** the shell's pull to refresh is back on that page

#### Scenario: Android
- **WHEN** the web app runs in the Android shell
- **THEN** `pull-refresh` is not listed, `pullHandled` is not called, and the web app's pull to sync works by itself

### Requirement: The notification permission is asked with the first reminder
A shell with the `reminders` capability SHALL ask for the phone's notification permission only while the app is visible and only when it is handed a schedule with at least one reminder, and SHALL NOT ask at launch, from a background run, or again after the user answered. A background run that is handed reminders without the permission SHALL answer that notifications are not allowed yet and leave the question to the visible app, which is handed the schedule again whenever it opens. The web app SHALL treat an answer from a background run as no answer: it SHALL NOT turn the device's setting off because of it. Nothing here changes task data or needs the network.

#### Scenario: First reminder on a fresh install
- **WHEN** the user installs the app, signs in, and adds a task with a reminder for tomorrow
- **THEN** the phone asks to allow notifications at that moment, and after Allow the reminder fires tomorrow with the app closed

#### Scenario: No reminders yet
- **WHEN** the user signs in to an account without any reminder in the next seven days
- **THEN** the phone asks nothing

#### Scenario: A background run comes first
- **WHEN** a reminder arrives from another device during a background run, before the user was ever asked
- **THEN** nothing is asked and the setting stays on, and the phone asks the next time the app is opened

#### Scenario: The user says no
- **WHEN** the user answers the phone's question with Don't allow
- **THEN** the device's setting reads Off with the explanation, reminders still appear inside the app, and the phone is not asked again until the user turns the setting on

### Requirement: Exact alarms are asked for with an explanation
On Android, a shell SHALL NOT open the system's alarm settings by itself. When exact alarms are not allowed it SHALL schedule inexact alarms and answer `exact-denied`, and a shell MAY offer the bridge capability `alarm-settings`, whose method opens the system page where the user allows them, only from the visible app. The web app SHALL then say once per device, where the user is, that reminders can arrive a few minutes late, with an action that opens that page when the capability is listed, and SHALL keep the same notice and action in Settings → Notifications while exact alarms are not allowed. After the user allows them the shell SHALL schedule the stored reminders exactly without waiting for the next hand-over.

#### Scenario: New install on Android 14
- **WHEN** the first reminder is handed over on a phone that refuses exact alarms
- **THEN** the app stays where it is, shows the notice once with Allow, and the reminder is scheduled inexactly

#### Scenario: Allow
- **WHEN** the user taps Allow, turns on Alarms & reminders for OpenTodo and returns
- **THEN** the stored reminders are exact, and the notice is gone from Settings

#### Scenario: A shell without the capability
- **WHEN** the web app runs in an older shell that answers `exact-denied` and does not list `alarm-settings`
- **THEN** the notice says where the setting is in Android's settings and offers no button

### Requirement: A background run ends when the app is done
A shell that runs the web app in the background MAY offer the bridge capability `background` to that run. The web app, in a run that lists it, SHALL tell the shell it is done once it has synced, or found it cannot (offline, signed out, a locked encrypted account), and has handed over the reminders and the widget data that follow from it. The shell SHALL end the run then, and SHALL end it by itself after a limit of at least 60 seconds on Android and within the time iOS grants when nothing is heard. A run that performs a notification action SHALL be done only after the action's operation is stored on the device. A run SHALL change nothing but through the web app's own operations, so an interrupted run loses nothing: what it did not send goes out with the next sync.

#### Scenario: A quick refresh
- **WHEN** a background run syncs and hands over the schedule in four seconds
- **THEN** the run ends then, not after its limit

#### Scenario: A slow server
- **WHEN** the sync of a background run takes 40 seconds on Android
- **THEN** the run lasts until the schedule is handed over, and a reminder set on another device is scheduled

#### Scenario: Offline
- **WHEN** a background run starts without a connection
- **THEN** the web app hands over what the device already knows, says it is done, and the run ends

#### Scenario: An older web app
- **WHEN** the server's web app does not know the capability
- **THEN** the run ends at its limit, as before

### Requirement: Launch screen until the page shows
A shell SHALL open on a launch screen in the web app's default canvas colour, light or dark with the phone's appearance, and SHALL keep it until the shell has something to show: the page of the server ready to be drawn (in a shell that lists `first-paint`, the web app's first drawn frame; otherwise the end of the page's load), a sign-in page, an error screen or a dialog of the shell. Between the launch screen and what follows, the shell SHALL NOT show an empty web view. On Android the launch screen SHALL carry the app's icon. The launch screen SHALL NOT outlast five seconds from the start of the load: after that the shell shows the web view with whatever it has, so a slow server still gets the screens it had. The bar colour and icons the shell remembers from the last run (see "System bars follow the app's theme") SHALL appear together with the page, not over the launch screen. The launch screen SHALL need no dependency and no permission. This is presentation only: it reads and writes no task data, works the same offline (a start from the stored copy ends it like any page), and changes nothing that syncs.

#### Scenario: Cold start on Android
- **WHEN** the user taps the app's icon on an Android phone in dark mode with a server configured
- **THEN** the icon shows over the dark canvas colour until the page can be drawn, and the page follows with no blank frame

#### Scenario: Cold start on iPhone
- **WHEN** the user opens the iOS app in light mode with a server configured
- **THEN** the light canvas colour shows until the web app has drawn its first frame, and the page follows with no white web view between them

#### Scenario: A page that keeps loading after its first frame
- **WHEN** the iOS app opens on a web app that has drawn its loading frame while its page has not finished loading
- **THEN** the launch screen goes with that frame, not when the page finishes loading or five seconds have passed

#### Scenario: A slow server
- **WHEN** the page has not loaded five seconds after the start
- **THEN** the launch screen goes and the web view shows what it has, as it did before

#### Scenario: The server cannot be reached
- **WHEN** the load fails and no stored copy can stand in
- **THEN** the launch screen goes at once and the shell's error screen shows, with the text it had

#### Scenario: A login wall answers first
- **WHEN** the first page is a sign-in page of another origin
- **THEN** the launch screen goes when that page has loaded, and the site bar names its host

#### Scenario: A remembered dark theme under a light phone
- **WHEN** the app last ran with a dark theme and the phone's appearance is light
- **THEN** the launch screen is light with the system's status bar icons, and the remembered bar colour and icons appear with the page

#### Scenario: Offline start from the stored copy
- **WHEN** the Android app opens with no network and a stored copy of the web app
- **THEN** the launch screen stays until that copy can be drawn, and Today shows the locally stored tasks

### Requirement: Reminders by push through UnifiedPush
The Android shell MAY offer the bridge capability `push`: it registers with the UnifiedPush distributor the user chose, and hands the web app a Web Push subscription (the endpoint the distributor gave, and a public key and secret the shell made on the phone). The web app SHALL subscribe the device with it on the user's server, exactly as a browser is subscribed, and SHALL do so only when the user turned push delivery on, the server offers push, and the shell lists the capability. The shell SHALL keep the private key on the phone, never hand it to the page, and SHALL use no push service of its own and no service the user did not choose.

When the distributor delivers a message, the shell SHALL decrypt it on the phone (RFC 8291), and for a reminder SHALL show the same notification, with the same actions, as a reminder scheduled on the device, without the web app running. A reminder SHALL alert once: when both the device's schedule and a push carry it, the second SHALL replace the first without another sound. A message that cannot be decrypted or is not a reminder SHALL show nothing. After a message the shell SHALL refresh in the background, so its schedule and widgets follow.

When the distributor gives a new endpoint, the shell SHALL keep it and the web app SHALL subscribe it at its next run; when the distributor unregisters the app, or the user turns push delivery off, signs out or changes servers, the shell SHALL forget the registration and its keys and the web app SHALL remove the device's subscription from the server. Reminders scheduled on the device SHALL keep working with or without push. Nothing here writes task data: a notification's actions are the web app's own operations, which apply on the device, work offline and converge like any other.

The subscription the shell hands over and a message the server encrypts for it SHALL be part of the shared bridge fixtures, written by the server's own encryption.

#### Scenario: A reminder set on another device a minute ago
- **WHEN** push delivery is on, the Android app is closed, and a reminder due in two minutes is added on a computer
- **THEN** the phone shows the reminder at its time, with Done, Snooze 10 min and Dismiss, although the phone never refreshed in between

#### Scenario: Scheduled on the phone and pushed
- **WHEN** a reminder is both in the phone's schedule and pushed by the server at the same time
- **THEN** the phone alerts once and shows one notification

#### Scenario: No distributor
- **WHEN** no UnifiedPush app is installed
- **THEN** the shell reports that push is unavailable, the setting says a UnifiedPush app is needed, and reminders scheduled on the phone work as before

#### Scenario: The distributor rotates the endpoint
- **WHEN** the distributor gives the app a new endpoint while the app is closed
- **THEN** the next background run subscribes the new endpoint on the server and removes the old one, and reminders in between still fire from the phone's schedule

#### Scenario: Sign-out
- **WHEN** the user signs out
- **THEN** the device's subscription is removed from the server, the shell unregisters from the distributor and deletes its keys, and a later message for that registration shows nothing

#### Scenario: A message the app cannot read
- **WHEN** the distributor delivers bytes that do not decrypt with the app's keys
- **THEN** nothing is shown and nothing of the message is logged beyond its length

#### Scenario: Encrypted account
- **WHEN** the account is end-to-end encrypted
- **THEN** the pushed reminder carries no task name, the notification reads the generic text, and the task opens decrypted on tap

#### Scenario: Fixture
- **WHEN** the server's encryption changes how it writes a message
- **THEN** the server test that writes the fixture fails until it is regenerated, and then the Android unit test fails until the shell decrypts the new form

### Requirement: Saving a file from the app
When the web app saves a file in a shell, the shell SHALL open the phone's save dialog with the file's name and write the file where the user chooses. This SHALL hold for a file the web app makes on the device (a recovery key, recovery codes, an export of tracked time, a theme, a decrypted attachment) and for a file it fetches from the user's server (an export, an attachment, a server archive), and for no other address. A file SHALL be written whole or not at all: when the user cancels, storage runs out or the transfer breaks, nothing partial SHALL remain and the web app SHALL be able to tell the user it was not saved. The shell SHALL keep no copy after the save ends. Saving works offline for files made on the device, changes no task data and syncs nothing. A shell MAY offer the bridge capability `files` for files made on the device; the web app SHALL use it only when listed and SHALL otherwise save as a browser does. Its payload SHALL be part of the shared bridge fixtures.

#### Scenario: Recovery key on Android
- **WHEN** the user taps Download on the recovery key in the Android app
- **THEN** the save dialog opens with `opentodo-recovery-key.txt`, and the chosen folder holds the file with the key after the user confirms

#### Scenario: Export from the server on iPhone
- **WHEN** the user taps Download export (JSON) in the iOS app
- **THEN** the save dialog opens with `opentodo-export.json` and the file the server sent is saved, fetched with the app's own session

#### Scenario: Cancelled
- **WHEN** the user closes the save dialog without choosing a place
- **THEN** no file is written, the shell keeps no copy, and the app stays where it was

#### Scenario: Offline
- **WHEN** the phone is offline and the user downloads the recovery codes
- **THEN** the file is saved, since it is made on the device

#### Scenario: A foreign address
- **WHEN** a page asks to download from a host that is not the user's server
- **THEN** the shell saves nothing and treats the address as any foreign link

#### Scenario: A shell without the capability
- **WHEN** the web app runs in a shell that does not list `files`
- **THEN** it does not call the method and saves the way it does in a browser

### Requirement: Back stays inside the Android app
On Android, Back SHALL first close what the web app has open (a dialog, a sheet, a task), then go back in the app's history, and leave the app only from its first screen. This SHALL hold every time the app is shown, including after Back has left the app and the user returned to it without the app having been closed.

#### Scenario: Back after returning
- **WHEN** the user leaves the app with Back from Today, opens it again from the launcher, opens a task and presses Back
- **THEN** the task closes and the app stays open on Today

#### Scenario: Back on the first screen
- **WHEN** the user presses Back on the screen the app started on, with nothing open
- **THEN** the app goes to the background, as any Android app does

### Requirement: Haptic feedback through the shell
A shell MAY offer the bridge capability `haptics`: the web app names a kind of feedback, `tick` or `success`, and the shell plays the platform's own feedback for it, following the phone's system setting for touch feedback and needing no permission. A shell SHALL ignore a kind it does not know. The web app SHALL give `success` when a task is completed and `tick` when a long press lifts a row, only while the device's haptics preference is on; in a shell that lists the capability it SHALL use the bridge, and elsewhere it SHALL keep the browser's vibration. The Appearance preference SHALL be shown wherever either way is available. The kinds SHALL be part of the shared bridge fixtures.

#### Scenario: Completing a task on iPhone
- **WHEN** the user completes a task in the iOS app with haptics on
- **THEN** the phone gives its success feedback once

#### Scenario: Haptics off
- **WHEN** the user turned haptics off in Appearance on this device
- **THEN** the web app does not call the shell and nothing is felt

#### Scenario: Unknown kind
- **WHEN** a newer web app hands an older shell the kind `warning`
- **THEN** the shell does nothing and reports no error

### Requirement: Done from a reminder notification
A reminder notification SHALL offer Done in both shells, next to Snooze 10 min and Dismiss. Done SHALL complete the reminder's task through the web app's own task operation, so it applies on the device at once, works offline, and reaches every device when the phone next syncs; a repeating task SHALL move to its next occurrence as it does in the app. On an encrypted account that is locked, Done SHALL open the app at its unlock screen and complete nothing until the user unlocks.

#### Scenario: Done on iPhone
- **WHEN** a reminder notification shows on an iPhone and the user taps Done
- **THEN** the task is completed, the notification is gone, and the completion appears on the user's other devices after the next sync

#### Scenario: Done offline
- **WHEN** the phone is offline and the user taps Done
- **THEN** the task is completed on the phone and the operation is sent when the phone is online again, converging with edits made elsewhere

#### Scenario: Locked account
- **WHEN** the encrypted account is locked and the user taps Done
- **THEN** the app opens at the unlock screen and the task stays open

### Requirement: No link previews in the iOS shell
The iOS shell SHALL NOT show the system's link preview when a link in the web app is held: a long press never lifts a browser preview of a page out of the app. Tapping a link SHALL behave as before (the server's own addresses stay in the shell, others open in the browser), and a link in content SHALL still be copyable. This is presentation only: nothing is stored or synced, and it is the same offline.

#### Scenario: Holding a link in a note
- **WHEN** the user holds a finger on a link in a task's notes in the iOS app
- **THEN** no preview of the linked page appears, and the link can still be copied

#### Scenario: Tapping still opens
- **WHEN** the user taps a link to another site in a comment
- **THEN** it opens in the system browser as before

### Requirement: No native overscroll effect on Android
The Android shell SHALL NOT draw the platform's overscroll glow or stretch over the page; the page's own scrolling decides what happens at an edge. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: The end of a list
- **WHEN** a person flings to the end of a long list in the Android app
- **THEN** no glow or stretch appears

### Requirement: Haptic kinds for outcomes and selection
The shells SHALL accept the haptic kinds `warning`, `error` and `selection` besides `tick` and `success`, map each to the platform's own feedback, and play `tick` for a kind they do not know. On a device without haptics, nothing SHALL play. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: An older shell
- **WHEN** the page asks a shell that knows only `tick` and `success` for `selection`
- **THEN** the shell plays `tick` and reports no error

### Requirement: A status bar tap reaches the page
The iOS shell SHALL deliver a tap on the status bar to the page as a scroll-to-top event and SHALL list the `scroll-top` capability. The web view itself SHALL NOT scroll in response. Shells without the capability SHALL behave as before. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: A tap on the status bar in the iPhone app
- **WHEN** a person scrolled far down the Inbox in the iPhone app and taps the status bar
- **THEN** the page receives one scroll-to-top event and the web view does not move

### Requirement: The web app says when its first frame is drawn
A shell that keeps its web view hidden until the page shows (the iOS shell) SHALL list the bridge capability `first-paint` in its visible app. The web app SHALL call the bridge method `painted`, without arguments, once per page load, after its first frame with the app's own content (the loading skeleton or a screen) has been drawn, and SHALL NOT call it in a shell that does not list the capability. On that call the shell SHALL show its web view at once, whether or not the page has finished loading. A web app of a server that does not know the method leaves the shell showing it when the page has loaded, as before. The background run SHALL NOT list the capability, and a call from it SHALL show nothing. The bridge version SHALL stay 1, and the call SHALL be part of the shared bridge fixtures. The call hands over no data, works offline and stores nothing.

#### Scenario: The first frame ends the launch screen
- **WHEN** the iOS app opens and the web app draws its loading skeleton while a script or font of the page is still loading
- **THEN** the web app calls `painted` and the web view shows with the skeleton, before the page has finished loading

#### Scenario: An older server
- **WHEN** the iOS app loads the web app of a server that does not know `painted`
- **THEN** the web view shows when the page has loaded, or after five seconds

#### Scenario: A shell without the capability
- **WHEN** the web app runs in the Android app or in a browser
- **THEN** `first-paint` is not listed and `painted` is not called

### Requirement: No keyboard accessory bar in the iOS app
The iOS shell SHALL NOT show the web view's keyboard accessory bar above the on-screen keyboard. If the platform changes so it cannot be removed, the app SHALL keep working with the bar. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: Editing a title in the iPhone app
- **WHEN** a person taps a task title to edit it in the iPhone app
- **THEN** the keyboard opens without the previous, next and Done bar

### Requirement: The web app follows the system text size
A shell SHALL let the web app follow the system text size and SHALL NOT scale the page's text a second time. The Android shell SHALL give the page the system font scale as `opentodoShell.textScale` and SHALL keep its web view's own text zoom on each page until that page calls `textScaleApplied`, then set it to 100 %, so a web app that predates this keeps the system text size; a change of the font scale SHALL reach the page when the app is next shown. The iOS shell SHALL leave Dynamic Type to WebKit, whose system body font follows it, and the page SHALL read it from there. An older shell without `textScale` SHALL leave the page at the browser's text size.

#### Scenario: Android at a large font scale
- **WHEN** the Android system font scale is 150 % and the app's text size is Default
- **THEN** the page receives `textScale` 1.5 and lays out at 150 % with its rows reflowed, and text is not enlarged a second time by the web view

#### Scenario: A browser tab
- **WHEN** the web app runs outside a shell
- **THEN** there is no system scale and Default is the browser's own text size

### Requirement: Urgent reminders ring as alarms on iPhone
The web app SHALL mark each urgent reminder it hands the shell (`urgent: true`, absent otherwise). On iOS 26 and later the iPhone app SHALL schedule an urgent reminder whose firing time is still ahead as a system alarm (AlarmKit) instead of a notification: it SHALL ring at the firing time with the handed-over title or the generic text, offer **Stop** and **Snooze 10 min**, and Snooze SHALL open the app on the reminder's snooze address so the web app moves the reminder through its own operation. Stop SHALL only silence the alarm. The app SHALL ask for the alarm permission only while it is visible and only when it is handed an urgent reminder, never at launch, from a background run or again after the user answered. An urgent reminder SHALL be an ordinary notification when the phone runs an earlier iOS, when alarms are not allowed or not asked yet in a background run, when the app was built without AlarmKit, or when it is handed over at its firing time. Alarms SHALL follow the schedule: a reminder that is no longer urgent, moved, dismissed, completed or deleted SHALL have its alarm cancelled or moved at the next hand-over, and notifications refused or turned off in the app, sign-out and a locked encrypted account SHALL cancel every alarm still ahead. A hand-over SHALL NOT cancel an alarm that is ringing, nor one whose time has passed and that the system still holds: it rings until the user stops or snoozes it. A changed server SHALL cancel every alarm. Nothing here changes task data or needs the network.

#### Scenario: An urgent reminder with the phone locked
- **WHEN** an urgent reminder is due at 07:00, the phone runs iOS 26, alarms are allowed and the app is closed
- **THEN** the phone rings at 07:00 with the task's title until the user taps Stop or Snooze 10 min

#### Scenario: Snooze from the alarm
- **WHEN** the user taps Snooze 10 min on the alarm
- **THEN** the app opens, the reminder's firing time moves by ten minutes as one reminder operation that reaches every device, and the alarm rings again ten minutes later

#### Scenario: First urgent reminder
- **WHEN** the user marks a reminder urgent for the first time in the visible iPhone app
- **THEN** iOS asks to allow alarms; after Allow the reminder is an alarm, after Don't Allow it stays a notification and the app does not ask again

#### Scenario: Older iOS
- **WHEN** the phone runs iOS 18 and a reminder is urgent
- **THEN** it arrives as an ordinary notification, with Done, Snooze 10 min and Dismiss

#### Scenario: No longer urgent
- **WHEN** the user clears Urgent on a reminder that the phone has armed as an alarm and the app hands the schedule over
- **THEN** the alarm is cancelled and the reminder is scheduled as a notification at the same time

#### Scenario: The hand-over after the alarm's time
- **WHEN** an urgent reminder's alarm is ringing and the app hands the schedule over again, which no longer lists the reminder
- **THEN** the alarm keeps ringing until the user taps Stop or Snooze 10 min

#### Scenario: Sign-out
- **WHEN** the user signs out on the iPhone with an alarm armed for later
- **THEN** the alarm is cancelled and nothing rings

### Requirement: A task's page offers the iPhone app
The page served for a task's address, `/task/<id>`, SHALL carry Safari's Smart App Banner tag naming the OpenTodo app for iPhone and iPad. Its argument SHALL be that task's address, with the id escaped to unreserved characters only. The server SHALL add it to the page it sends, naming the configured base URL's origin, and with no base URL configured its tag SHALL carry no argument. The service worker SHALL add the tag to the page it serves from its cache for that address, naming the page's own origin. A trailing slash, an id holding a `/` or a deeper path SHALL get no banner. No other page SHALL carry it, and the page's Content-Security-Policy SHALL be the same as on every other page of the app. The server SHALL make no request for it.

The iOS shell SHALL open the task when it is handed such an address whose scheme, host and port are the configured server's. It SHALL ignore one on any other host or with any other path. The banner changes no data. Offline, a page from the service worker still carries it, and the app opens the task from what it holds, converging when it syncs.

#### Scenario: A calendar link on an iPhone with the app
- **WHEN** a person taps a task's link in a calendar event, and Safari opens `https://todo.example.com/task/abc`
- **THEN** the page shows the banner with Open, and Open brings up the OpenTodo app at task `abc`

#### Scenario: A link to another server
- **WHEN** the app connected to `https://todo.example.com` is handed `https://other.example.com/task/abc`
- **THEN** it opens nothing

#### Scenario: Other pages
- **WHEN** Safari opens `/today` or a public task page under `/t/`
- **THEN** the page carries no banner tag

#### Scenario: An id that tries to leave the tag
- **WHEN** the address is `/task/x"><script>,app-id=1`
- **THEN** the id stays escaped inside the argument and the page gains no element

#### Scenario: No base URL
- **WHEN** the server has no base URL and Safari opens `/task/abc`
- **THEN** the banner names the app without an argument and opens the app at its start

#### Scenario: From the service worker
- **WHEN** a Safari that has run the web app opens `https://todo.example.com/task/abc` and the worker serves the cached page
- **THEN** the page carries the same tag as the server's copy, naming `https://todo.example.com`

### Requirement: Completing a task from the iPhone Today widget
On iOS 17 and later, when the web app's publication says it can complete tasks and the account is not locked, each row of the iPhone app's Today widget SHALL have a completion circle, read aloud as "Complete" and the task's title. A tap SHALL hide the task from the widget at once and lower the header's counts by the tasks hidden, and SHALL have the web app complete it through its own operations, in a background run of the app, exactly as completing it in the app does (a repeating task moves to its next occurrence), using the same completion addresses as the Android app. The shell SHALL never write task data itself. Because a widget cannot start the app, the tick SHALL be kept on the device and handed to the web app the next time the app runs: when it is opened, or at its background refresh. Offline, the completion SHALL be stored on the device as an operation and synced with the next sync; it converges with edits on other devices through the op log like any other completion. A task hidden this way SHALL stay hidden while its tick waits for the app, and SHALL reappear if no publication confirms the completion within 30 minutes of the run that applied it. Below iOS 17, with a web app whose publication does not say it can complete tasks, and while the account is locked, the rows SHALL have no circle and the widget SHALL work as before. The widget SHALL never make a request of its own.

#### Scenario: Complete a task from the iPhone widget
- **WHEN** the user taps the circle of "Call the plumber" in the iPhone Today widget
- **THEN** the row disappears and the count drops by one at once, and the next time the app runs the web app completes the task in a background run, so the laptop shows it completed after the next sync

#### Scenario: Complete offline on the iPhone
- **WHEN** the phone has no network, the user taps a task's circle and later opens the app
- **THEN** the completion is stored on the phone as an operation and reaches the server with the next sync, and the widget does not list the task in the meantime

#### Scenario: Complete an occurrence of a repeating task
- **WHEN** the user taps the circle of a task that repeats every week, due today
- **THEN** the task moves to its next occurrence once, even if another device already completed today's occurrence

#### Scenario: A tick the app has not applied yet
- **WHEN** the user taps a task's circle and does not open the app for two hours
- **THEN** the widget keeps the task hidden, and the app completes it when it next runs

#### Scenario: Locked account or an older web app
- **WHEN** the device's encrypted account is locked, or the web app's publication does not say it can complete tasks
- **THEN** the iPhone Today widget lists what it can without completion circles

#### Scenario: iOS 16
- **WHEN** the app runs on iOS 16
- **THEN** the Today widget's rows have no circle and a tap opens the task, as before
