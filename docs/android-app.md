---
title: The Android app
summary: The OpenTodo app for Android: connect it to your server, reminders without a push service, sharing, widgets and fingerprint unlock.
audience: user
section: Reference
specs: []
screens: []
order: 22
---
# The Android app

The OpenTodo app for Android opens your own OpenTodo server, like the [installed web app](install-phone.md), and adds what only a phone app can do: reminders on time without a push service, sharing files from other apps, home-screen widgets and fingerprint unlock. It needs Android 8.0 or later and an OpenTodo server; it talks to nothing else.

## Connect to your server

On first start the app asks for your server's address, the one you open in the browser (for example `todo.example.com`). It checks the address and says what is wrong when it can't connect:

- **No connection**: the first start needs the network; the screen tries again when it's back.
- **Not an OpenTodo server**: the address answers, but not like OpenTodo. Check for typos.
- **Certificate not trusted**: the phone doesn't trust the server's certificate. If your server uses its own certificate authority, install it in Android's security settings; the app trusts certificates you installed there.
- **Address refused**: the app needs `https://`. Plain `http://` works only for addresses on your own network (such as `192.168.1.4:8080` or `nas.local`), after a warning.

Then sign in as usual. After the first start the app also opens offline, with your local copy.

To use another server, long-press the app icon and choose **Change server**. This removes the current server's data from the phone (the offline copy, scheduled reminders, widget data and fingerprint unlock); changes not yet synced are lost.

## Reminders

In **Settings → Notifications**, turn on **Notifications through the app**. The app schedules the next seven days of reminders on the phone itself and refreshes them about once an hour, so a reminder you add on your computer reaches the phone too. Details in [Notifications](push-notifications.md#in-the-android-app).

## Sharing

The app appears in Android's share menu for links, text, photos and files, also on phones without Google Play services. See [Capturing pages](capture.md#from-the-android-app).

## Widgets

Two home-screen widgets: **Today** shows your tasks for today with the time of the last update, and **Quick add** opens the app's quick add. The widgets show what the app last saw; open the app to refresh them. While an encrypted account is locked, the Today widget shows only counts.

## Fingerprint unlock

With [end-to-end encryption](e2ee.md#unlock-with-a-fingerprint), the unlock screen offers **Unlock with fingerprint or face next time**.

## Privacy

No trackers, no analytics, no advertising. The app stores the server address, the scheduled reminders, the widget data and, if you turned on fingerprint unlock, the encrypted account key, only in its private storage, excluded from Android backup.
