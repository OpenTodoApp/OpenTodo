---
title: The native app (in testing)
summary: The new OpenTodo phone app, drawn with the system's own views: what it does today, how it signs in to your server, and what still needs the web app.
audience: user
section: Reference
specs: []
screens: []
order: 24
---
# The native app (in testing)

OpenTodo is getting a new phone app. The apps in the stores today ([iPhone and iPad](ios-app.md), [Android](android-app.md)) show the web app inside an app window. The new one draws its screens with the phone's own lists, sheets and menus, keeps your tasks in a database on the phone, and runs the same sync and encryption code as the web app, so the two always agree.

It is in testing. The first builds go to the project's own testers through TestFlight, as version 2.0.0 of the same app: installing one replaces the App Store version on that device, and installing OpenTodo from the App Store again brings it back. There is no public test yet, and nothing changes for the apps in the stores until the new app can do what they do.

## What it does today

- **Your server.** The app asks for your server's address and checks it. The server needs OpenTodo 1.4 or later; an older one is named, with a link to the update guide. Plain `http` is accepted only for an address on your own network.
- **Sign in.** The app opens your server's own sign-in page in the system's sign-in sheet, so everything your server offers works: password, second factor, passkey, single sign-on. If the phone's browser is signed in already, you only confirm. The app never sees your password.
- **Today.** Today's tasks, in the same order as on the web. Tap the circle to complete a task.
- **Sync.** Changes from your other devices appear while the app is open, without pulling to refresh.
- **Offline.** The app works without a connection. What you change waits on the phone and is sent when the connection is back; the screen says when it is offline and when it last synced.
- **Sign out.** Tap your initial, then **Sign out**. The app deletes its copy of your data and its access to the server.

Everything else (adding and editing tasks, projects, search, reminders, widgets, encrypted accounts) is still to come. Use the web app or the app from the store for those.

## The app in your sessions

The app appears in **Settings → Security → Sessions** as **OpenTodo app**, with the device's name and when it was last used. Revoke it there, or choose **Sign out everywhere**, and the app returns to its first screen and deletes its copy of your data at its next request.

## What the app stores on the phone

- A copy of your tasks, in the app's own database. It is deleted when you sign out.
- Its access to your server, in the phone's Keychain (iPhone) or Keystore (Android). It is a token for this device only, never your password.

The app talks to your server and to nothing else.
