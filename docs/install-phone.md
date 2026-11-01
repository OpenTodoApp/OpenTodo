---
title: Install on your phone
summary: Add OpenTodo to the home screen of an iPhone, iPad or Android phone, step by step, so it opens full screen and can show reminders.
audience: user
section: Get started
specs: [native-shells]
screens: []
order: 21
---
# Install on your phone

<picture><source srcset="images/mobile-today-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/mobile-today-light.webp" alt="OpenTodo installed on a phone, showing the Today list full screen without browser bars."></picture>

Sign in once in the browser first, at your server's `https://` address; then add the app to your home screen. The general picture, and the steps for computers, are in [Installing the app](install-app.md).

Once installed, the round **+** at the bottom right adds a task, and the menu button at the top left opens a drawer with your projects, labels and views.

On Settings the round **+** is hidden, because that page has no quick-add action and the button would cover the rows; it returns on the next list. The installed app opens on a splash in the light page colour, and its status bar uses the same colour as the app's bar from the first frame.

## iPhone and iPad

1. Open your OpenTodo address in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.

OpenTodo now has an icon on your home screen. Open it from there from now on. On iOS 16.4 and later, push notifications for reminders work only in the installed app, not in a Safari tab; turn them on in **Settings → Notifications** inside the app. See [Notifications](notifications.md). With notifications allowed, the icon also shows how many of today's tasks are open ([App icon badge](app-icon-badge.md)).

Recent iOS versions also offer **Add to Home Screen** from the share menu of other browsers. If you don't see it, use Safari.

Typing doesn't zoom the screen: on a phone or tablet every text field uses text of at least 16 px, the size below which Safari zooms in on a field you tap. Pinch to zoom still works everywhere, and pinching back out returns to the normal size.

## Android

1. Open your OpenTodo address in **Chrome** (Edge and Samsung Internet work the same way).
2. Open the browser menu (⋮).
3. Tap **Install app**. On some versions it's called **Add to Home screen**.

Chrome sometimes shows an install banner at the bottom of the screen on its own; tapping it does the same thing.

After installing, OpenTodo also appears in Android's share menu, so you can send a link or some text from another app straight into a new task. See [Capturing pages](capture.md).

## The Android app

Instead of installing from the browser, you can install the **OpenTodo** app from [Google Play](https://play.google.com/store/apps/details?id=app.opentodo), [F-Droid](https://f-droid.org/packages/app.opentodo/) or the [GitHub release](https://github.com/OpenTodoApp/OpenTodo/releases/latest) and enter your server's address on its first screen. All three are the same app with the same signature, so you can switch between them later without losing anything ([how](android-app.md#switching-between-google-play-f-droid-and-github)); until the store listings open, install from GitHub. It works the same and adds reminders without a push service, sharing on phones without Google Play services, home-screen widgets and fingerprint unlock. See [The Android app](android-app.md).

## The iOS app

There is no OpenTodo app in the App Store: the licence and the store's terms conflict, so the app is built from source. With a Mac and Xcode you can build it, sign it for your own iPhone or iPad and open your server from it; it then appears in the share sheet and adds a Today widget, Face ID unlock of an encrypted account and reminders scheduled on the phone. See [The iOS app](ios-app.md).
