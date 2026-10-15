---
title: Installing the app
summary: Put OpenTodo on your home screen or desktop so it opens in its own window and works offline, on iPhone, Android, Windows, macOS and Linux.
audience: user
section: Get started
specs: [web-app]
screens: []
order: 20
card: mobile-today
---
# Installing the app

OpenTodo is a web app you can install. Once installed it has its own icon, opens in its own window without browser bars, starts without a connection, and on most platforms can show reminders while it's closed. There is no app store involved: you install it from your server's address, and updates arrive by themselves.

<picture><source srcset="images/mobile-today-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/mobile-today-light.webp" alt="OpenTodo on a phone, showing the Today list full screen."></picture>

Before you start, open your OpenTodo address in the browser and sign in once. Installing needs a secure address (one starting with `https://`); if your browser offers no install option at all, ask whoever runs your server to set that up.

## iPhone and iPad

1. Open your OpenTodo address in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.

OpenTodo now has an icon on your home screen. Open it from there from now on. On iOS 16.4 and later, push notifications for reminders work only in the installed app, not in a Safari tab; turn them on in **Settings → Notifications** inside the app. See [Notifications](notifications.md).

Recent iOS versions also offer **Add to Home Screen** from the share menu of other browsers. If you don't see it, use Safari.

## Android

1. Open your OpenTodo address in **Chrome** (Edge and Samsung Internet work the same way).
2. Open the browser menu (⋮).
3. Tap **Install app**. On some versions it's called **Add to Home screen**.

Chrome sometimes shows an install banner at the bottom of the screen on its own; tapping it does the same thing.

After installing, OpenTodo also appears in Android's share menu, so you can send a link or some text from another app straight into a new task. See [Capturing pages](capture.md).

## Windows, macOS, Linux and ChromeOS

In **Chrome** or **Edge**:

1. Open your OpenTodo address.
2. Click the install icon at the right end of the address bar (a small screen with a down arrow), or open the browser menu and choose **Install OpenTodo** (in Edge: **Apps → Install this site as an app**).
3. Confirm with **Install**.

OpenTodo opens in its own window and gets an entry in your Start menu, Dock or app launcher. You can pin it to the taskbar like any other app.

In **Safari on macOS** (Sonoma or later), choose **File → Add to Dock**.

Firefox on the desktop doesn't install web apps. You can still use OpenTodo in a Firefox tab with everything working, including offline use once the page has loaded.

## A screen for the household

An old tablet or an e-ink panel makes a good shared list on the fridge, using [display mode](views.md#display-mode).

1. **Create an account for the screen**, for example "Fridge", with an [invitation](sharing.md#invite-someone-new). Then share the projects it should show with that account as a **viewer**. The server refuses every change from a viewer, so nobody can edit tasks from the screen, and the screen shows no checkboxes. If the screen should tick items off, share as an editor instead.
2. **Sign in as that account** on the tablet and open the display, for example a project's **⋯ → Display mode**. Add `?eink=1` to the address on an e-ink screen, or `size=xl` to read it from across the room.
3. **Make it the start view**: on the display, use the **⋯** menu next to **Exit** and choose **Make this the start view on this device**. The display then opens whenever the app starts.
4. **Lock the device to the app** with its kiosk or guided-access mode (iPad: Guided Access; Android: screen pinning; a desktop browser: kiosk mode). Display mode hides the app's controls, but it does not lock the device, so the rest of the app is still one address away.

The screen stays signed in as long as the server's sessions last (90 days unless the server owner changed `OPENTODO_SESSION_DAYS`). After that, sign in again. Displays work in current versions of Safari, Chrome, Firefox and Edge, including the browsers of most e-ink tablets.

## Keep using it offline

The installed app keeps a full copy of your tasks on the device. You can open it on a plane, add and complete tasks, and it syncs when you're online again. The status at the top right tells you where things stand. More in [Offline and sync](offline-and-sync.md).

## Updates

When your server is updated, the app fetches the new version in the background and switches to it on its own, usually with one quick reload. If you think you're still on an old version, close the app completely and open it again.

## Remove it

Remove it the way you remove any app on that device: long-press the icon and choose **Remove App** (iPhone) or **Uninstall** (Android), or use **Uninstall** from the app window's menu on a computer. Your tasks stay on your server.

Signing out (**Settings → Account → Sign out of this device**) clears the copy of your tasks on that device. Changes that haven't reached the server yet are uploaded first when you're online.
