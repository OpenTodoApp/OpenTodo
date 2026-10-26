---
title: The iOS app
summary: The OpenTodo app for iPhone and iPad, built from source in Xcode: connect it to your server, reminders without push, sharing, widgets and Face ID unlock.
audience: user
section: Reference
specs: []
screens: []
order: 23
---
# The iOS app

The OpenTodo app for iPhone and iPad opens your own OpenTodo server, like the [installed web app](install-phone.md#iphone-and-ipad), and adds what only an app can do: the share sheet, a Today widget and Face ID unlock of an encrypted account. It needs iOS 16.4 or later and an OpenTodo server; it talks to nothing else.

There is no App Store listing. OpenTodo is under the AGPL, and the App Store's terms conflict with that licence; whoever wants the app builds it from the source in `mobile/ios` in Xcode and signs it for their own devices. That is also why the app is not on this website as a download.

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

## Offline

Whether the app starts without a network depends on how it was built. A build for one known server — set `OPENTODO_APP_BOUND_HOST=todo.example.com` when you build — gets the whole installed-web-app treatment: the service worker, the precache and an offline start. A build without that setting can open any server, which iOS does not allow a service worker for, so it needs the network and says so. Whoever builds the app decides; there is no switch inside it.

## Sharing into OpenTodo

The app appears in the share sheet of other apps. A link, some text or files open the capture screen, ready to save: up to ten files, 20 MB each and 25 MB together — check your server's own limit per file. A share that arrives before you have entered a server waits until you have.

## Widgets

**Today**, in the medium size, shows the tasks due today and the overdue ones, with the time and priority, from the last thing the web app published. Tap a task to open it. For an encrypted account the widget shows counts only until you unlock.

## Face ID unlock

On a phone with Face ID or Touch ID, the [encrypted account](e2ee.md) offers **Unlock with Face ID next time**. After you unlock with the passphrase, the app keeps a copy of the account key encrypted by the Secure Enclave under a key that opens only with your face or finger, and the unlock screen offers that from then on; the passphrase still works.

The copy never leaves the phone. It is deleted when you sign out, reset the passphrase, turn encryption off, change servers, or when the account key changes, and iOS makes it unusable when faces or fingers are added or removed to the device.

## Voice notes and photos

The web app records voice notes and can attach a photo taken with the camera. iOS ends an app that asks for either without declaring it first, so the app declares both and the system's question comes from the app; as everywhere else, only your server is ever loaded, so no other page can ask. The Android app declares neither, so those two are iOS-only for now — nothing else in the shell depends on them.

## Building it

The app is not in the App Store, because the store's terms and the licence do not fit. So you build and sign it yourself. Needs a Mac with Xcode 16 or newer and an iOS simulator runtime:

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

**Widget and share sheet included: a paid Apple Developer Program membership.** Add your account in Xcode ▸ Settings ▸ Accounts, select the team on all three targets, and keep **App Groups** on each of them with one group name — `group.app.opentodo`, or your own if the name is taken. Xcode registers it in the developer portal on the first signing attempt.

Either way the first run on a device needs **Developer Mode** on (iPhone ▸ Settings ▸ Privacy & Security) and, for a free team, trusting the developer under Settings ▸ General ▸ VPN & Device Management. If Xcode reports that the bundle identifier is taken, change the `app.opentodo` prefix in `mobile/ios/project.yml` for all three targets and run `xcodegen generate`.

`mobile/README.md` describes the files, the bridge and the build settings; `openspec/changes/ios-shell` records the decisions and what was measured on the platform.
