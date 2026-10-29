## ADDED Requirements

### Requirement: The iOS app is built and signed by whoever runs it
The iOS shell SHALL be source in `mobile/ios`, built with Xcode against iOS 16.4 or later, signed with the builder's own team, and shipped through no store. It SHALL bundle no copy of the web app, link only system frameworks, and list no third-party dependency. It SHALL declare the App Group it shares with its extensions, the local-network usage text and the photo-free privacy manifest, and it SHALL collect no usage data, as the other shells do. `make ios` SHALL run the unit tests and an unsigned simulator build and SHALL NOT be part of `make check`; CI SHALL build the app only for changes under `mobile/ios/**` and on tags.

#### Scenario: Built by a self-hoster
- **WHEN** a self-hoster opens `mobile/ios/OpenTodo.xcodeproj`, selects their own team and runs the app on their phone
- **THEN** the app loads the web app from the address they enter, signs no store agreement and needs no account from the project

#### Scenario: Change outside mobile/ios
- **WHEN** a pull request changes only server code
- **THEN** the iOS job does not run and `make check` does not build the app

## MODIFIED Requirements

### Requirement: A shell loads the user's server and nothing else
A native shell SHALL load the web app from the server address the user entered, over `https` (or `http` only for `localhost` and private network addresses, with a warning), in a full-screen web view that keeps the app's origin, cookies and local storage and IndexedDB, exactly like the installed web app, and the service worker wherever the platform gives an app one (on Android always; on iOS only for a host the app was built for, see "Offline start"). The shell SHALL open network connections only to that server (and, when the web app itself requests them, to the same origin). It SHALL collect no usage data, include no analytics, crash-reporting or advertising library, and declare "no data collected" in every store listing. The shell SHALL NOT bundle a copy of the web app: the server serves the app version that matches it.

#### Scenario: Connections stay with the server
- **WHEN** the Android or iOS app is used for a session with the device's traffic inspected
- **THEN** every connection goes to the configured server's host and port, and none to any other host

#### Scenario: Server upgraded
- **WHEN** the server is upgraded to a newer release and the app is opened
- **THEN** the app loads the new web app from the server without an app update, and the web app's own "Recovery after a server upgrade" behaviour applies

#### Scenario: Plain http to a public host
- **WHEN** the user enters `http://todo.example.com` on the first-run screen
- **THEN** the shell refuses it, explains that a secure address is needed and offers to try `https://todo.example.com`

#### Scenario: Private address over http
- **WHEN** the user enters `http://192.168.1.20:8080`
- **THEN** the shell accepts it after showing that the connection is not encrypted on the way to that address

### Requirement: First-run server screen
On first start, and whenever no server is configured, a shell SHALL show a screen asking for the server address with the device's language, SHALL check the address by requesting the server's health route, and SHALL name the reason when the check fails (no network, not an OpenTodo server, certificate not trusted, address refused). A trusted certificate the user installed on the device SHALL be accepted. The address SHALL be changeable later from the shell's own menu, and changing it SHALL discard the web view's storage for the old server only after the user confirms.

#### Scenario: Not an OpenTodo server
- **WHEN** the user enters `https://example.com`
- **THEN** the screen says the address does not answer as an OpenTodo server and keeps the address for editing

#### Scenario: Self-signed certificate the user trusts
- **WHEN** the home server uses a certificate from a private authority installed in the device's user credentials
- **THEN** the shell accepts the connection, and a certificate the device does not trust is refused with an explanation, never silently accepted

#### Scenario: Change the server
- **WHEN** a signed-in user chooses "Change server" and confirms
- **THEN** the shell forgets the old server's storage, scheduled reminders and widget data, and shows the first-run screen

#### Scenario: Behind a login page
- **WHEN** the user enters the address of a server whose login wall redirects `/healthz` to its sign-in page
- **THEN** the screen says the server is behind a login page and offers "Sign in here"; after signing in there, the check passes and the app opens the server

### Requirement: Offline start
On Android, once the web app has been loaded once, the shell SHALL open offline and show the app from the service worker's precache with the local data, like the installed web app. On iOS the system gives a service worker to an app only for a host the app declares at build time, so the iOS shell SHALL offer two builds and say which one it is: a portable build for any server, which needs the network and SHALL show an offline screen naming the reason and offering a retry; and a one-server build, whose declared host gets the service worker, the precache and therefore the same offline start as Android. In both builds the first start SHALL need the network and SHALL say so when it is missing.

#### Scenario: Opened in flight mode
- **WHEN** the user has used the Android app, or the iOS one-server build, before and opens it with no network
- **THEN** the Today list shows the locally stored tasks, and the sync indicator reads offline

#### Scenario: Opened offline in the portable iOS build
- **WHEN** the portable iOS build is opened with no network
- **THEN** the app says it cannot reach the server, offers a retry, and claims no offline copy

#### Scenario: First start offline
- **WHEN** the app is opened for the first time with no network
- **THEN** the first-run screen explains that the first start needs a connection, and retries when the network returns

### Requirement: Share sheet into the capture screen
Each shell SHALL register as a share target for text, links and files: the Android app through `SEND` and `SEND_MULTIPLE` for `text/*`, `image/*` and `application/*`, the iOS app through a share extension for text, URLs and file items. A shared text or link SHALL open the app's capture screen with the same `title`, `text` and `url` the web share target receives; shared files SHALL be handed to the capture screen with the same hand-over the browser extension uses, so the existing limits (at most 10 files, the server's per-file limit, 100 MB in total, hygiene rules) apply unchanged. Nothing SHALL be saved without the user's confirmation; a share while offline SHALL work like the web app's offline share.

#### Scenario: Share a link from a browser
- **WHEN** the user shares a page from Chrome or Safari to OpenTodo
- **THEN** the capture screen opens in the app with the page's title and URL, and saving creates the task with that URL as its origin

#### Scenario: Share two photos
- **WHEN** the user shares two photos from the gallery to OpenTodo
- **THEN** the capture screen lists both as files and the task carries them as attachments after Save

#### Scenario: Share before the server is set
- **WHEN** the app has no server configured and receives a share
- **THEN** the first-run screen opens, and the share continues on the capture screen once the server is saved

### Requirement: Reminders scheduled on the device
A shell SHALL deliver reminders without a push service: the web app, while it runs in the shell, SHALL hand the shell the reminders due in the next 7 days (reminder id, task id, firing time, and the title only when the device's "include task titles" option is on and the account is not encrypted) whenever they change, and the shell SHALL schedule each and show a system notification at its time, titled from the handed-over title or a generic text in the device's language. On Android the schedule is an exact alarm and is refreshed at least hourly. On iOS a local notification fires at its time without extra permission, at most 64 pending notifications exist per app (the earliest are kept), and the refresh runs when the system decides, so an iOS reminder created on another device may arrive late; the app SHALL say so where the device's reminder setting is explained. A notification SHALL offer Snooze 10 min and Dismiss, which SHALL act through the web app's own reminder operations (opened in the background), and a tap SHALL open the task. The schedule and the handed-over titles SHALL be stored only in the app's private storage and SHALL be deleted on sign-out, on lock of an encrypted account and when the server is changed.

#### Scenario: Reminder fires with the app closed
- **WHEN** a reminder is due at 15:00, the app was last open at 14:00 and is closed
- **THEN** the phone shows a notification at 15:00 with the task's title (or the generic text), without any push service being involved

#### Scenario: Reminder set on another device
- **WHEN** a reminder for 18:00 is created on the user's laptop at 16:00 and the Android app stays closed
- **THEN** the phone has scheduled it by 17:00 at the latest and shows the notification at 18:00

#### Scenario: More than 64 pending reminders on iOS
- **WHEN** the handed-over schedule holds more than 64 reminders
- **THEN** the iOS app schedules the 64 that are due soonest and schedules the rest on the next refresh

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
The Android shell SHALL offer a Today widget (today's and overdue open tasks: title, time and priority, the count in the header, a tap opening the task) and a quick-add widget (one field opening the app's quick add with the typed text). The iOS shell SHALL offer the Today widget; the platform has no text input in a widget, so there is no quick-add widget there and the web app SHALL NOT expect one. The widgets SHALL read only data the web app published through the bridge (the Today list while the app runs or during a background refresh), stored in the app's private storage, and SHALL show the time of the last update. For an encrypted account the widget SHALL show titles only from a publication made while the device was unlocked, and SHALL show counts only once the device is locked. The widget SHALL never make a request of its own.

#### Scenario: Today widget after a change elsewhere
- **WHEN** a task is completed on the laptop at 09:00 and the phone's app stays closed
- **THEN** the widget no longer lists it after the next refresh, and the header shows when it was updated

#### Scenario: Quick add from the widget
- **WHEN** the user types "Call the plumber tomorrow 9am" in the Android quick-add widget
- **THEN** the app opens with quick add showing that text parsed, and the task exists only after the user confirms

#### Scenario: iOS capabilities
- **WHEN** the web app runs in the iOS shell and reads `capabilities`
- **THEN** `widgets` means the Today widget, and no quick-add widget is offered

#### Scenario: Locked encrypted account
- **WHEN** the device is locked
- **THEN** the Today widget shows "3 tasks today" and no title

### Requirement: Shell release and store readiness
CI SHALL build the Android shell on every change under `mobile/android/` and on every tag, SHALL attach a signed release APK and AAB to tagged releases with the same build provenance as other release assets, and SHALL fail the release when the Android build fails. CI SHALL build the iOS shell unsigned for changes under `mobile/ios/` and on every tag, and SHALL fail the release when that build fails. The repository SHALL hold the store listing texts, the privacy declaration ("no data collected") and the F-Droid metadata so the listings can be published from the repository; the iOS shell is published through no store, so it carries no listing. Each shell's version SHALL be the app's release version.

#### Scenario: Release assets
- **WHEN** the tag `v0.10.0` is pushed and every gate passes
- **THEN** the release carries `opentodo-android-0.10.0.apk` and `.aab` with provenance attestations next to the extension zip, and the iOS build passed without producing an asset

#### Scenario: Change outside mobile
- **WHEN** a pull request changes only server code
- **THEN** neither the Android nor the iOS job runs
