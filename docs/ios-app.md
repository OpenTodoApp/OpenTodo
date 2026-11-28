---
title: The iOS app
summary: "The OpenTodo app for iPhone and iPad, from the App Store or built from source: connect it to your server, reminders without push, sharing, widgets and Face ID unlock."
audience: user
section: Reference
specs: []
screens: []
order: 23
---
# The iOS app

The OpenTodo app for iPhone and iPad opens your own OpenTodo server, like the [installed web app](install-phone.md#iphone-and-ipad), and adds what only an app can do: the share sheet, a Today widget and Face ID unlock of an encrypted account. It needs iOS 16.4 or later and an OpenTodo server; it talks to nothing else.

## Install it

The official app is in the App Store: [OpenTodo for iPhone and iPad](https://apps.apple.com/us/app/opentodo/id6832200428). It is the first release, so expect some rough edges, and [say what to improve](feedback-and-support.md). New builds go to testers through TestFlight, Apple's app for testing, and every OpenTodo release is sent to Apple's App Store review the same day: the App Store update arrives once Apple approves it, usually within a few days. The app's version is the server release it belongs to, so until then the App Store shows the previous one. A release that follows before Apple has started reviewing the previous one takes its place.

As the copyright holder, the author of OpenTodo allows distributing its iOS app through Apple's App Store and TestFlight. You can still build the app yourself from source ([Building it](#building-it)).

## Connect to your server

On first start the app asks for your server's address, the one you open in the browser (for example `todo.example.com`). An address without a scheme is reached over `https`, and the field shows it as `https://todo.example.com` before anything is sent; the app never tries `http` by itself and never follows a redirect to another address. Plain `http` is only used when you type it, only for addresses on your own network, and the screen then says the connection is not encrypted; everything else must be `https`. **Connect** becomes active once the address is well-formed. After connecting, **Settings → About** shows the exact address under **OpenTodo for iOS**. The screen says what is wrong when it can't connect:

- **No answer**: the first start needs the network. Check the address and the connection.
- **Not an OpenTodo server**: the address answers, but not like OpenTodo. Check for typos.
- **Certificate not trusted**: the phone doesn't trust the server's certificate. The app uses iOS's own check and does not offer to skip it; a private authority you installed on the phone is fine.
- **Must be reached over https**: the app suggests the `https` address; tap it and try again.

To point the app at another server later, long-press its icon and choose **Change server**. It asks first, because it also forgets the cached web app and its data, including changes that have not reached the server yet.

### Single sign-on and login walls

OpenTodo's own **Sign in with …** button (see [Single sign-on](self-hosting/sso.md)) opens the provider's page in Safari's sign-in sheet (iOS asks first whether OpenTodo may use your server's address to sign in) asks you to confirm with **Continue**, and brings you back to the app signed in, so providers that refuse sign-in inside apps, such as Google, work too. Close the sheet to cancel. A login wall in front of the server (Pangolin, Authelia, Authentik's proxy, Cloudflare Access, oauth2-proxy) is different: once the app is connected, when the wall asks again, its sign-in page opens inside the app, with a bar above it that names the site you are signing in on (the app has no address bar); the **×** in the bar, or swiping back, returns to your server. If a sign-in can't continue in the app (for example a page left open for a long time), the app says so and offers **Sign in here** to start again.

Only pages the sign-in leads through stay in the app; a link to another site on a sign-in page (a privacy policy, a help page) opens in Safari, like every other link. The app's first-run check does not pass a login wall: let the wall bypass `/api/v1/health` and `/healthz` (the [Android guide](android-app.md#bypassing-the-wall-instead) lists the paths). The hourly background refresh never follows the wall's redirect; while its session has expired, the refresh waits until you next open the app. A wall that signs in with a provider that refuses apps (Google answers "Error 403: disallowed_useragent") needs a password, a passkey or a bypass for the app's paths. An app built for one server with app-bound domains (see [Building it](#building-it)) can only show the pages of the hosts it declares, so add the provider's host to `OPENTODO_APP_BOUND_HOST` too.

## Reminders

Your server's reminders arrive as notifications with the task's name, without setting anything up; iOS asks to allow notifications when your first reminder is there, never at launch. They are scheduled on the phone from the web app's own data: the next seven days, with **Done**, **Snooze 10 min** and **Dismiss** on the notification. Each opens the app, which then completes the task or moves the reminder, because a local notification cannot change your tasks by itself. No push service is involved and nothing leaves the phone. **Settings → Notifications** in the app turns them off, and turns the task names off.

Two limits come from iOS. A WKWebView cannot receive web push, so unlike the [installed web app](push-notifications.md) the app has no immediate push; it refreshes the schedule whenever you open it, and iOS lets it refresh in the background about hourly when it decides to. Reminders that change while the app is closed can therefore arrive late, and notifications further away than seven days are not scheduled at all. If you want push per reminder, use the installed web app on iOS 16.4 or later; both can be on the same phone, and they share the same account.

### Urgent reminders

A reminder marked **Urgent** (in its menu in the task panel, on any device) rings as an alarm on iOS 26 and later: it sounds over silent mode and Focus, fills the lock screen with the task's name (or **OpenTodo reminder** for an encrypted account or with task names off) and keeps ringing until you tap **Stop** or **Snooze 10 min**. Snooze opens the app, which moves the reminder ten minutes for every device; Stop only silences it, and the reminder can still be dismissed in the app. iOS asks to allow alarms the first time the app is handed an urgent reminder while it is open; if you don't allow them, or change it later in iOS **Settings → OpenTodo**, urgent reminders arrive as ordinary notifications. They do too on iOS 18 and earlier, and for a reminder that reaches the phone only at its time. Turning reminders off in **Settings → Notifications**, signing out and **Change server** remove the alarms set for later; an alarm already ringing rings until you stop it, except after **Change server**.

## Location reminders

[Location reminders](location-reminders.md) do not fire in the iPhone app yet: it does not offer **Location reminders on this phone**, and the reminders say **Fires on your phone**. Watching places with iOS region monitoring (When In Use, then Always) comes in a later version of the app; until then they fire in the [Android app](android-app.md#location-reminders).

## Opening the app

The app opens on its background colour, light or dark with the phone, and shows the page once it has loaded, so no white screen comes between them. A server that takes longer than five seconds gets the page as far as it has loaded; one that can't be reached gets the usual message.

Long-press the app icon for **Add task** (quick add), **Today** or [**Change server**](#connect-to-your-server).

## Links to tasks

A task's link in a calendar event, from the [calendar feed](calendar-feeds.md) or [calendar sync](calendar-sync.md), opens Safari. On a task's page Safari shows a banner with **Open**, which opens the task in the app. The app only opens links to the server it is connected to. Once you close the banner, Safari stops showing it on that site. iOS can't open these links in the app straight away, because a self-hosted server's address can't be built into the app.

## Offline

The app from TestFlight or the App Store opens any server, and iOS gives such an app no service worker. When the server is unreachable at launch, the app opens from its last copy in the web view's cache and reads the tasks it already holds, and syncs once the server answers again; the first launch, before the app has loaded once, still needs the network, and says so when there is none. For a full offline start with the precache, use the [installed web app](install-phone.md#iphone-and-ipad), or build the app for your one server: set `OPENTODO_APP_BOUND_HOST=todo.example.com` when you build, and it gets the whole installed-web-app treatment, the service worker, the precache and an offline start.

## Sharing into OpenTodo

The app appears in the share sheet of other apps. A link, some text or files open the capture screen, ready to save: up to ten files, 20 MB each and 25 MB together — check your server's own limit per file. A share that arrives before you have entered a server waits until you have.

## Siri and Shortcuts

Ask Siri **"What's on today in OpenTodo"**: it answers with today's count, the overdue count and up to five tasks with their times, from the list the app last published, without opening the app or asking the server. While your phone is locked, or for an encrypted account that was locked at the time, it gives the counts only. A list from an earlier day comes with its date. **"Open Today in OpenTodo"** and **"Open quick add in OpenTodo"** open the app there.

All three are in the Shortcuts app, ready to use in your own shortcuts, and any of them can go on the Action Button (**Settings → Action Button → Shortcut**). Siri knows the phrases in each of the app's languages that it speaks itself.

## Widgets

**Today**, in the medium size, shows the tasks due today and the overdue ones, with the time and priority, from the last thing the web app published. Tap a task to open it. On iOS 17 and later, tap the circle beside a task to complete it: it leaves the widget at once, and the app records the completion the next time it runs (when you open it, or at its background refresh), as if you had ticked it in the app (a repeating task moves to its next date). A widget cannot start the app, so until then the task stays hidden. If the completion could not be recorded (an older server, an expired session), the task comes back half an hour later; tick it in the app. For an encrypted account the widget shows counts only, without circles, until you unlock.

Version 1.2.0 of the app never filled the widget, never scheduled reminders and offered browser push in **Settings → Notifications**. Update the app from the App Store or TestFlight and open it once; the widget fills and reminders are scheduled.

## Theme colours

The area behind the page (under the status bar, and when you pull past the top or the bottom) takes the bar colour of your [theme](themes.md), and the app remembers it for the next launch. The status bar's icons turn light or dark with the theme, so they stay readable when the app's theme differs from the phone's appearance.

## Pull to sync

Pulling a page down from its top [syncs now](offline-and-sync.md#the-sync-status) and keeps what you had open. With a server that does not have pull to sync yet, the pull reloads the page instead, as it did before.

## Saving files

An image or a PDF attached to a task opens in the system's preview: the share button saves it to Photos or Files, or sends it. Everything else the app saves opens the system's save dialog, where you choose a place in Files: the recovery key and recovery codes, an export, a theme, any other attachment. Cancel and nothing is saved.

## Focus on the lock screen

While a [Focus](focus.md#outside-the-app) session runs or is paused, a Live Activity on the lock screen and in the Dynamic Island shows the task, the phase (**Work · 2 of 4**, **Short break**, **Paused**) and a clock that iOS keeps running by itself. A tap opens the Focus screen; **Pause** and **Resume** open the app and pause or resume the session there. When the planned end passes it reads **Session done** or **Break over**, and a notification arrives at that moment if notifications are allowed. With **Start breaks automatically** on, the break starts once you next open the app. The task's name follows the task names switch in **Settings → Notifications**, and an encrypted account shows **Focus session**. Turn it off in iOS **Settings → OpenTodo → Live Activities**. Signing out and **Change server** remove it.

## Haptic feedback

Completing a task gives the phone's success tap, and adding a task or picking up a row a light one. Flipping a switch or choosing a segment with your finger gives a selection click, and a failure message the error tap. Turn it off in **Settings → Appearance → Haptic feedback**.

**Task completion sound** beside it is off by default. When enabled, it plays a short cue after completing a task in the foreground. The iPhone stays quiet in Silent mode.

## Touch

Tapping does not flash, holding a button or a tab does not select its label, and holding a link does not lift a preview of it. Text in tasks, notes and comments is selected and copied the usual way: hold a word. Pulling a list past its top no longer drags or reloads the app. Pinch to zoom works everywhere, unless you turn it off for this device in **Settings → Appearance → Allow pinch zoom**. The app's text follows Dynamic Type (**Settings → Accessibility → Display & Text Size → Larger Text** on the iPhone); **Settings → Appearance → Text size** in the app overrides it. Tap the status bar to scroll back to the top of a list, a note or the calendar, or of an open sheet or panel.

## Face ID unlock

On a phone with Face ID or Touch ID, the [encrypted account](e2ee.md) offers **Unlock with Face ID next time**. After you unlock with the passphrase, the app keeps a copy of the account key encrypted by the Secure Enclave under a key that opens only with your face or finger, and the unlock screen offers that from then on; the passphrase still works.

The copy never leaves the phone. It is deleted when you sign out, reset the passphrase, turn encryption off, change servers, or when the account key changes, and iOS makes it unusable when faces or fingers are added or removed to the device.

## Voice notes and photos

The web app records voice notes and can attach a photo taken with the camera. iOS ends an app that asks for either without declaring it first, so the app declares both and the system's question comes from the app; as everywhere else, only your server is ever loaded, so no other page can ask. The Android app declares the microphone and asks the first time you dictate. It does not declare the camera, so taking a photo from the page stays iOS-only.

## Building it

Instead of installing it, you can build the app yourself and sign it for your own devices, for example to get the offline start above. Needs a Mac with Xcode 16 or newer and an iOS simulator runtime:

```sh
make ios                             # unit tests on a simulator, an unsigned device build, the dependency check
open mobile/ios/OpenTodo.xcodeproj   # then Run, with your team selected for signing
```

Running it in the simulator needs nothing more than Xcode. For your own iPhone you need a team in Xcode, and that is where the one paid part sits.

### On your own iPhone

**Everything but the widget and the share sheet: a free Apple ID is enough.** Those two are app extensions, and they share their data with the app through an App Group, which is a paid capability, so a personal team cannot sign them. Remove them for a local build — these edits stay on your Mac, do not commit them:

1. Select the `OpenTodo` target ▸ **General** ▸ *Frameworks, Libraries, and Embedded Content*, select `OpenTodoWidget.appex` and `OpenTodoShare.appex` and remove them with −.
2. Delete the `OpenTodoWidget` and `OpenTodoShare` targets in the project navigator.
3. On `OpenTodo` ▸ **Signing & Capabilities**, remove **App Groups** with −, then pick your personal team.

Reminders, Face ID, the certificate and local-network behaviour and the background refresh all work in that build. A free build stops launching after seven days; run it again from Xcode to renew it.

**Widget and share sheet included: a paid Apple Developer Program membership.** Add your account in Xcode ▸ Settings ▸ Accounts, select the team on all three targets, and keep **App Groups** on each of them with one group name — `group.app.open-todo`, or your own if the name is taken. Xcode registers it in the developer portal on the first signing attempt.

Either way the first run on a device needs **Developer Mode** on (iPhone ▸ Settings ▸ Privacy & Security) and, for a free team, trusting the developer under Settings ▸ General ▸ VPN & Device Management. If Xcode reports that the bundle identifier is taken, change the `app.open-todo.ios` prefix in `mobile/ios/project.yml` for every target and run `xcodegen generate`.

### Walkthrough

To look at the app on several iPhones without a Mac, run **Actions → iPhone walkthrough** (`gh workflow run ios-walkthrough.yml --ref <branch>`). On a macOS runner it builds the server, seeds an account and walks the app through first run, sign-in, the lists, a project, a task, quick add, completing, swiping and dragging, search, the calendar and Settings (`mobile/ios/OpenTodoUITests/WalkthroughTests.swift`), on an iPhone SE (3rd generation), an iPhone 16, an iPhone 16 Pro Max and an iPhone 16 in dark mode with the largest text. The `ios-walkthrough` artifact holds one PNG per step and device and `summary.txt`, with what the accessibility audit found and the steps it could not reach. It reports and never fails; `scripts/ios-walkthrough.sh` runs the same on a Mac.

`mobile/README.md` describes the files, the bridge and the build settings; `openspec/changes/ios-shell` records the decisions and what was measured on the platform.
