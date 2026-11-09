---
title: The iOS app
summary: The OpenTodo app for iPhone and iPad, from TestFlight or built from source: connect it to your server, reminders without push, sharing, widgets and Face ID unlock.
audience: user
section: Reference
specs: []
screens: []
order: 23
---
# The iOS app

The OpenTodo app for iPhone and iPad opens your own OpenTodo server, like the [installed web app](install-phone.md#iphone-and-ipad), and adds what only an app can do: the share sheet, a Today widget and Face ID unlock of an encrypted account. It needs iOS 16.4 or later and an OpenTodo server; it talks to nothing else.

## Install it

The official app comes through TestFlight, Apple's app for testing new apps, and later from the App Store. Install **TestFlight** from the App Store, then open the OpenTodo invitation link; the link will be on this page once the first build is out. TestFlight updates the app with every release.

As the copyright holder, the author of OpenTodo allows distributing its iOS app through Apple's App Store and TestFlight. You can still build the app yourself from source ([Building it](#building-it)).

## Connect to your server

On first start the app asks for your server's address, the one you open in the browser (for example `todo.example.com`). Plain `http` is only accepted for addresses on your own network; everything else must be `https`. The screen says what is wrong when it can't connect:

- **No answer**: the first start needs the network. Check the address and the connection.
- **Not an OpenTodo server**: the address answers, but not like OpenTodo. Check for typos.
- **Certificate not trusted**: the phone doesn't trust the server's certificate. The app uses iOS's own check and does not offer to skip it; a private authority you installed on the phone is fine.
- **Must be reached over https**: the app suggests the `https` address; tap it and try again.

To point the app at another server later, long-press its icon and choose **Change server**. It asks first, because it also forgets the cached web app and its data, including changes that have not reached the server yet.

## Reminders

Your server's reminders arrive as notifications, scheduled on the phone from the web app's own data: the next seven days, with **Snooze 10 min** and **Dismiss** on the notification. Both open the app, which then moves the reminder, because a local notification cannot change your tasks by itself. No push service is involved and nothing leaves the phone.

Two limits come from iOS. A WKWebView cannot receive web push, so unlike the [installed web app](push-notifications.md) the app has no immediate push; it refreshes the schedule whenever you open it, and iOS lets it refresh in the background about hourly when it decides to. Reminders that change while the app is closed can therefore arrive late, and notifications further away than seven days are not scheduled at all. If you want push per reminder, use the installed web app on iOS 16.4 or later; both can be on the same phone, and they share the same account.

## Location reminders

[Location reminders](location-reminders.md) do not fire in the iPhone app yet: it does not offer **Location reminders on this phone**, and the reminders say **Fires on your phone**. Watching places with iOS region monitoring (When In Use, then Always) comes in a later version of the app; until then they fire in the [Android app](android-app.md#location-reminders).

## Offline

The app from TestFlight or the App Store opens any server, and iOS gives such an app no service worker, so it needs the network to start and says so when there is none. For an offline start, use the [installed web app](install-phone.md#iphone-and-ipad), or build the app for your one server: set `OPENTODO_APP_BOUND_HOST=todo.example.com` when you build, and it gets the whole installed-web-app treatment, the service worker, the precache and an offline start.

## Sharing into OpenTodo

The app appears in the share sheet of other apps. A link, some text or files open the capture screen, ready to save: up to ten files, 20 MB each and 25 MB together — check your server's own limit per file. A share that arrives before you have entered a server waits until you have.

## Widgets

**Today**, in the medium size, shows the tasks due today and the overdue ones, with the time and priority, from the last thing the web app published. Tap a task to open it. For an encrypted account the widget shows counts only until you unlock.

Version 1.2.0 of the app never filled the widget, never scheduled reminders and offered browser push in **Settings → Notifications**. Update the app from the App Store or TestFlight and open it once; the widget fills and reminders are scheduled.

## Theme colours

The area behind the page (under the status bar before the page draws, and when you pull past the top or the bottom) takes the bar colour of your [theme](themes.md), and the app remembers it for the next launch. The status bar's icons follow the phone's light or dark appearance.

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
