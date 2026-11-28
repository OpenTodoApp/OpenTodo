---
title: The Android app
summary: "The OpenTodo app for Android: connect it to your server, reminders without a push service, sharing, widgets and fingerprint unlock."
audience: user
section: Reference
specs: []
screens: [android-app]
order: 22
---
# The Android app

The OpenTodo app for Android opens your own OpenTodo server, like the [installed web app](install-phone.md), and adds what only a phone app can do: reminders on time without a push service, sharing files from other apps, home-screen widgets and fingerprint unlock. It needs Android 8.0 or later with Android System WebView 111 or later, and an OpenTodo server; it talks to nothing else. The app shows your server through the phone's system WebView; on a phone whose WebView is older and cannot be updated (some devices without Google Play services), the app says so, and a browser with its own engine, such as Firefox, works instead.

## Install the app

The app comes from Google Play or GitHub, and soon from F-Droid. Pick the one you already use:

- **Google Play**: search for **OpenTodo** in the Play Store, or open [play.google.com/store/apps/details?id=app.opentodo](https://play.google.com/store/apps/details?id=app.opentodo). Play updates it by itself.
- **F-Droid** (coming: the app is waiting for its first F-Droid build): search for **OpenTodo** in the F-Droid app, or open [f-droid.org/packages/app.opentodo](https://f-droid.org/packages/app.opentodo/). F-Droid builds every version from the source code and publishes it only when its build matches the project's (see [below](#check-what-you-installed)), so a new version appears there a few days after the release.
- **GitHub**: download `opentodo-android-<version>.apk` from the [latest release](https://github.com/OpenTodoApp/OpenTodo/releases/latest) and open it on the phone (Android asks you to allow installing from your browser or file manager once). You update it the same way; tools such as Obtainium can follow the releases for you.

Release candidates (`-rc` versions) are only on GitHub, never in the stores.

### Switching between Google Play, F-Droid and GitHub

**Between GitHub and F-Droid** you can switch without uninstalling: both carry the same certificate, so install the app from the other source over the one you have, and Android treats it as an update. The server, your offline copy, reminders, widgets and fingerprint unlock stay. Install a version at least as new as the one on the phone; Android refuses to go back to an older one. Afterwards, updates come from where you installed last (in F-Droid you may need to tap **Update** once).

**Between Google Play and GitHub or F-Droid** you have to uninstall first: Google Play signs the app with its own key, so Android won't install one over the other. Uninstalling deletes the app's data on the phone, including changes not yet synced and the fingerprint unlock key. So open the app with a connection first and let it sync, save any shared files you haven't saved yet, and turn off **Deliver instantly through UnifiedPush** if you use it. Then uninstall, install from the other source, enter your server's address and sign in again. Your tasks and reminders are on the server and come back. Unlock with your passphrase if your account is encrypted, allow notifications again, turn fingerprint unlock, UnifiedPush and location reminders back on, and add your widgets again.

### Check what you installed

The APK from GitHub and F-Droid is signed with the project's release certificate, whose SHA-256 fingerprint is:

```
ff2eacdf7e79712e44fdd9d2e3110891e712c170ea516bd3fbbecc291072befa
```

The app from Google Play is signed by Google Play's app signing key for OpenTodo, whose SHA-256 fingerprint is:

```
e2669a539e03370b3bcae306fecf0633ac37592d83bd60c880ca50aeccc83932
```

On a computer with the Android SDK's build tools, check a downloaded APK, or one copied from the phone with `adb shell pm path app.opentodo` and `adb pull`:

```sh
apksigner verify --print-certs opentodo-android-0.20.0.apk
# Signer #1 certificate SHA-256 digest: ff2eacdf7e79712e44fdd9d2e3110891e712c170ea516bd3fbbecc291072befa
```

The app from Google Play gives the `e2669a53…` digest instead. Pulled from the phone it comes as several APKs; check `base.apk`.

Any other fingerprint means the APK was not signed for the OpenTodo project: don't install it.

The build is also **reproducible**: building a release's tag from the source gives the same APK apart from the signature, so you can check that the APK is exactly the published code. With a clone of the repository, JDK 17 and the Android SDK:

```sh
python3 -m pip install --require-hashes -r scripts/release/requirements-repro.txt
scripts/android-repro.sh v0.20.0 opentodo-android-0.20.0.apk
# match: opentodo-android-0.20.0.apk is the build of v0.20.0 (…), apart from its signature
```

The script builds the tag in a temporary directory and compares. A mismatch names the files that differ. `mobile/README.md` lists the exact tool versions. F-Droid runs the same check for every version before it publishes one.

## Connect to your server

On first start the app asks for your server's address, the one you open in the browser (for example `todo.example.com`). It checks the address and says what is wrong when it can't connect:

- **No connection**: the first start needs the network; the screen tries again when it's back.
- **Not an OpenTodo server**: the address answers, but not like OpenTodo. Check for typos.
- **Behind a login page**: the server sits behind a login wall (see [below](#behind-a-login-page-pangolin-authelia-and-others)). Tap **Sign in here**, sign in to the wall, and the app connects by itself.
- **Certificate not trusted**: the phone doesn't trust the server's certificate. If your server uses its own certificate authority, install it in Android's security settings; the app trusts certificates you installed there.
- **Address refused**: the app needs `https://`. Plain `http://` works only for addresses on your own network (such as `192.168.1.4:8080` or `nas.local`), after a warning.

An address on your own network also shows **This address only works on your home network**, with a link to [reaching OpenTodo from outside your home](self-hosting/home-assistant-addon.md#reach-opentodo-from-outside-your-home). It is only a notice: the app still connects.

Then sign in as usual. After that first successful open the app keeps a copy of itself on the phone and opens it offline, with the server switched off or the phone in flight mode. That includes a server at a plain http address on your own network.

To use another server, long-press the app icon and choose **Change server**. This removes the current server's data from the phone (the offline copy, scheduled reminders, widget data and fingerprint unlock); changes not yet synced are lost.

## Behind a login page (Pangolin, Authelia and others)

If your server sits behind a login wall, such as Pangolin (with Pocket ID or its own users), Authelia, Authentik's proxy, Cloudflare Access or oauth2-proxy, the app signs in to the wall inside the app:

- **First start**: when the check meets the wall, the screen says the server is behind a login page. Tap **Sign in here**, sign in on the wall's page, and the app connects as soon as you're through. If the screen instead says the address answers with a web page, the wall may show its page directly; **Sign in here** works the same way.
- **Later**: when the wall asks again (its session expired), its sign-in page opens inside the app. A bar above it names the site you are signing in on, since the app has no address bar; the **×** in the bar, or back, returns to your server. If a sign-in can't continue in the app (for example a page left open for a long time), the app says so and offers **Sign in here** to start again.
- **Single sign-on**: OpenTodo's own **Sign in with …** button (see [Single sign-on](self-hosting/sso.md)) opens the provider's page in a Custom Tab of your browser, asks you to confirm with **Continue**, and brings you back to the app signed in, so providers that refuse sign-in inside apps, such as Google, work too. Close the tab to cancel. With a server older than this, the provider's page opens inside the app instead.

Only pages the sign-in leads through stay in the app; a link to another site on a sign-in page (a privacy policy, a help page) opens in your browser, like every other link. The wall's session cookie is kept, so you sign in again only when the wall's session ends. Give the wall a long session (a "remember me" option, or a longer session lifetime) so that happens rarely: while the session has expired, the app's hourly background refresh of reminders and widgets doesn't get through and simply waits until you next open the app.

**Walls whose provider refuses apps.** A login wall's sign-in page stays inside the app, and some identity providers refuse to sign in inside an app's web view; Google, for example, shows "Error 403: disallowed_useragent". The app can't work around this for a wall (OpenTodo's own single sign-on uses the browser instead, above). Sign in to OpenTodo with a password or a passkey instead (set a password in **Settings → Account → Security** if your account is SSO-only), or use a provider that allows it in front of the wall, or let the wall bypass the app's paths (next section).

### Bypassing the wall instead

If you'd rather the app not meet the wall at all, let it bypass these paths for your OpenTodo resource; OpenTodo still asks for its own sign-in (password, passkeys, two-factor) on every one of them:

| Path | Used by |
| --- | --- |
| `/api/v1/health`, `/healthz` | the app's first-run check (`/api/v1/health` first; `/healthz` for servers before 1.0.1) |
| `/api/*` | everything the web app loads or saves, including sync and sign-in |
| `/sw.js`, `/registerSW.js`, `/app-manifest.json` | service worker updates (offline use, push) |
| `/manifest.webmanifest`, `/branding/*` | the app's name and icons |
| `/share` | sharing into the app (a form post) |

The page itself (`/` and the app's files under `/assets/`) still goes through the wall unless you bypass everything; with the paths above bypassed the app works whether or not you are signed in to the wall, and the background refresh needs the page, so it only runs while the wall's session lasts. Other clients have their own paths: calendar apps `/dav/` and `/.well-known/caldav`, AI assistants `/mcp`, calendar feeds `/feeds/*`, public links `/public/*` and `/t/*`.

## Reminders

Reminders arrive as notifications with the task's name, without setting anything up. Android asks to allow notifications when your first reminder is there, not when the app starts; answer no and the switch in **Settings → Notifications** (**Notifications through the app**) goes off, where you can turn it on again and turn task names off. The app schedules the next seven days of reminders on the phone itself and refreshes them about once an hour, so a reminder you add on your computer reaches the phone too.

On Android 14 and later a new app may not set exact alarms. The app then says once that reminders can be a few minutes late, with **Allow**, which opens Android's **Alarms & reminders** page for OpenTodo; the same notice stays in **Settings → Notifications** until you allow it. Details in [Notifications](push-notifications.md#in-the-android-app).

A reminder's notification offers **Done**, **Snooze 10 min** and **Dismiss**. **Done** completes the task without opening the app, the same as ticking it off (a repeating task moves to its next date), and works offline: the change goes out with the next sync.

### Urgent reminders

A reminder marked **Urgent** (in its menu in the task panel, on any device) rings as an alarm: at its time the screen turns on over the lock screen with the task's name (or **Reminder** for an encrypted account, with task names off, or on a lock screen set to hide sensitive content), and the phone's alarm sound plays at the alarm volume, also with the ringer silent, until you tap **Done**, **Snooze 10 min** or **Dismiss**. Swiping the notification away or opening the notifications only silences it. While you use the phone it rings as a notification at the top of the screen with the same buttons.

When you turn **Urgent** on in the app the first time, Android's **Alarms & reminders** page opens if exact alarms are not allowed, and on Android 14 and later then its **Full-screen notifications** page, each only once. Without exact alarms the alarm can ring a few minutes late; without full-screen notifications it rings as a notification instead of filling the screen. Change either later in Android's settings for OpenTodo. Do Not Disturb treats it as an alarm: it rings when your Do Not Disturb settings let alarms through, as they do unless you turned that off, and stays silent under **Total silence**. The **Urgent reminders** category in Android's notification settings for OpenTodo turns them off or lets them override Do Not Disturb. Urgent alarms are set again after a restart once you unlock the phone, so one due before that first unlock does not ring; signing out removes the ones set for later, and **Change server** also silences one that is ringing.

### On time through UnifiedPush

A reminder set on another device shortly before it is due can miss the hourly refresh. With a [UnifiedPush](https://unifiedpush.org) app such as ntfy on the phone, your server pushes each reminder to the app the moment it is due, the way it pushes to a browser, without Google services.

1. Install a UnifiedPush app, such as ntfy, and set it up.
2. In OpenTodo, open **Settings → Notifications** and turn on **Deliver instantly through UnifiedPush**.
3. Choose your UnifiedPush app when the phone asks.

It is off until you turn it on. The row appears only while [push notifications](push-notifications.md) are on on your server, and without a UnifiedPush app it says **Needs a UnifiedPush app such as ntfy**. The reminders scheduled on the phone keep working either way, and a reminder that arrives both ways alerts once. Turning it off, turning **Notifications through the app** off, or signing out removes the phone from your server and from the UnifiedPush app.

The UnifiedPush app and its server see an encrypted message, its size and its time, never a task. The message holds the reminder's and the task's ids and, with task names on and no [end-to-end encryption](e2ee.md), the task's name; the key that reads it is made on the phone and never leaves it. Your server must reach the UnifiedPush server at a public `https` address: one on a private network address is refused, as for every push.

## Location reminders

[Location reminders](location-reminders.md) ("when I arrive at the post office") fire on the phone. Turn on **Settings → Notifications → Location reminders → On this phone**: the app explains what the location is for, then Android asks twice, first for your location (**While using the app** or **Only this time**), then for **Allow all the time**, which on Android 11 and later is a choice on the app's location settings page. Without **Allow all the time** nothing is watched and the setting says so, with **Open settings**.

- The app uses Android's own proximity alerts, with no Google Play services, so it works on phones without Google.
- It watches at most 19 places, the nearest to where you are, plus one larger circle around that spot; leaving that circle makes it pick the nearest places again.
- Your position stays on the phone. A location reminder never sends it to your server or anyone else, never passes it to the app's pages and never logs it; the app keeps only the point it last picked the places from, in its private storage.
- A notification offers **Done** and **Dismiss**; a crossing fires at most once an hour per reminder.
- Sign-out, locking an encrypted account and **Change server** remove every watched place.
- **Only the app from GitHub has location reminders for now** (and F-Droid's, once it is there). The Google Play version leaves them out, and doesn't ask for your location at all, until Google has approved the background-location use; there the setting reads "Location reminders come to the Google Play version later". To use them now, uninstall the Play version and install the app from GitHub ([how](#switching-between-google-play-f-droid-and-github)).

## A task's location

**Use my location** in a task's [location](locations-and-places.md) asks Android for your location the first time (precise or approximate both work), and only your server's pages get the position, once per tap; the Google Play version doesn't ask and the editor says the position was not shared. **Open in maps** opens your maps app at the point, or the point on openstreetmap.org in the browser when no maps app is installed.

## Saving files

Whatever the app saves opens Android's save dialog, where you choose the folder: the recovery key and recovery codes, an export, a theme, an attachment. Close the dialog and nothing is saved. Files the app makes on the phone (the recovery key, recovery codes, themes, decrypted attachments) need a server on the same release as the app or newer; exports and attachments from the server save with any server.

## Opening the app

The app opens on its icon over the app's background colour, light or dark with the phone, and keeps that until the page is ready, so no blank screen comes between them. A server that takes longer than five seconds gets the page as far as it has loaded; one that can't be reached gets the usual message.

Long-press the app icon for **Add task** (quick add), **Today** or [**Change server**](#connect-to-your-server).

## Back

Back closes what is open (a dialog, a sheet, a task), then goes back through the app, and leaves the app only from the screen it started on.

## Focus in the notifications

While a [Focus](focus.md#outside-the-app) session runs or is paused, a quiet notification shows the task, the phase (**Work · 2 of 4**, **Short break**, **Paused**) and a clock that Android keeps running by itself. A tap opens the Focus screen; **Pause** and **Resume** open the app and pause or resume the session there, so its time entry stops and starts as on the screen. At the planned end the notification gives way to **Session done** or **Break over**, on time when the app may set exact alarms and up to a few minutes late otherwise. With **Start breaks automatically** on, the break starts once you next open the app. The task's name follows the task names switch in **Settings → Notifications**, and an encrypted account shows **Focus session**. Turn the notification off with the **Focus** category in Android's notification settings for OpenTodo. Signing out and **Change server** remove it.

## Haptic feedback

Completing a task gives a short tap, and adding a task or picking up a row a light one. Flipping a switch or choosing a segment with your finger gives a click, and a failure message a firmer buzz. It uses the phone's own touch feedback and needs no extra permission. Turn it off in **Settings → Appearance → Haptic feedback**, or for the whole phone in Android's sound and vibration settings.

**Task completion sound** beside it is off by default. To hear a short cue after completing a task in the app, enable it while the phone is in Normal mode. Silent and Vibrate modes stay quiet.

## Touch

Tapping does not flash, and holding a button or a tab does not select its label. Text in tasks, notes and comments is selected and copied the usual way: hold a word. Pulling a list past its top does not drag the app. Pinch to zoom works everywhere, unless you turn it off for this device in **Settings → Appearance → Allow pinch zoom**. The app's text follows the phone's font size, set in the phone's display or accessibility settings (the place varies by maker); **Settings → Appearance → Text size** in the app overrides it.

## Sharing

The app appears in Android's share menu for links, text, photos and files, also on phones without Google Play services. See [Capturing pages](capture.md#from-the-android-app).

## Widgets

Five home-screen widgets: **Today**, **Upcoming**, **Calendar**, **Completed** and **Quick add**. Long-press the home screen, choose **Widgets** and drag one from OpenTodo; each can be resized.

**Today** lists your tasks for [Today](today-and-upcoming.md) in a list that scrolls: overdue ones under **Earlier** with their date, the rest under **Today**, each with its time and project when it has them. Tap a task to open it, the circle beside it to complete it, and **+** to open quick add. A completed task leaves the widget at once; the app records the completion in the background, as if you had ticked it in the app (a repeating task moves to its next date), and syncs it when the phone is online. Without a connection the completion waits on the phone like any other change. If the completion could not be recorded (an older server, the app could not start in the background, or your session or a [login wall's](#behind-a-login-page-pangolin-authelia-and-others) session has expired), it is not applied and the task comes back after half an hour; open the app, sign in again if it asks, and tick it there. The header shows the number of tasks and when the list was last updated.

**Upcoming** lists what comes after today, as [Upcoming](today-and-upcoming.md) does, under a heading for each day (**Tomorrow**, then the weekday and date), each task with its time and project. Tap a task to open it, the circle to complete it (as in Today: a repeating task shows again under its next date), **+** for quick add, and the header to open Upcoming.

**Calendar** shows a month, starting on your first day of the week (**Settings → Language and region → Date and time**), with a dot under each day that has open tasks (a repeating task on its next date) and today ringed. Tap a day to open it in [Day](calendar-views.md), or the month's name to open Month; while the current workspace has [Calendar switched off](workspace-features.md), both open Upcoming instead. The arrows move to the next five months and back; each Calendar widget keeps its own month.

The widgets list the tasks the app's own lists show: open subtasks you [kept](keep-open-subtasks.md) when completing their parent stay out, and so do tasks of archived or trashed projects. They cover every workspace of your account.

**Completed** shows how many tasks you completed today and a bar for each of the last 7 days (counted as in [Statistics](statistics.md), which a tap opens), and **Quick add** opens the app's quick add.

The widgets follow the phone's light or dark mode, and show what the app last saw: it refreshes them while it is open and about once an hour in the background. While an encrypted account is locked, the Today and Upcoming widgets show only counts, without circles, the Calendar widget shows the month without dots, and the Completed widget only today's number.

## Quick add in the notifications

To add tasks from any app, turn on **Settings → Capture → Quick add → Quick add notification → On this phone**. It is off until you turn it on, and it is set per phone. On Android 13 and later, the app asks to send notifications the first time; if you refuse, the switch stays off until you allow notifications for OpenTodo in Android's settings. If you turn off the **Quick add** channel there, the switch reads off too.

A silent notification then stays in the notification shade, on its own **Quick add** channel:

- **Add task** opens a field right in the notification. Type a task and send it, and you stay in the app you were in. The app saves the task in the background, reading it as [quick add](quick-add.md) does: dates and times, `#project`, priority and existing labels. It goes to the Inbox unless you type a project. Without a connection, the task waits on the phone and syncs later, like any other change. If the app could not save it (you are signed out, or the app could not start in the background), a notification says so; tap it to open quick add with your words typed in.
- **A tap on the notification** opens the app's quick add with the keyboard up.

With [end-to-end encryption](e2ee.md), **Add task** opens quick add instead: the app cannot save to an encrypted account in the background.

The notification comes back after the phone restarts or the app updates. On Android 14 and later you can swipe it away; it returns the next time you open the app. It goes when you turn the switch off, sign out or change the server.

## Status and navigation bars

The phone's status and navigation bars take the colour of your [theme](themes.md) (the accent in light, the canvas in dark, or the theme's own bar colour), with light or dark icons so they stay readable, and they switch with it. The app remembers the colour, so the bars are right as soon as the page shows at the next launch.

## Voice input

Dictate in quick add the same way as in a browser (**Settings → Capture → Voice capture**). The first time, Android asks for the microphone. Allow it; there is no address bar to look at. If you refused, allow **Microphone** for OpenTodo in the phone's app settings and try again. The app keeps no recording.

## Fingerprint unlock

With [end-to-end encryption](e2ee.md#unlock-with-a-fingerprint), the unlock screen offers **Unlock with fingerprint or face next time**.

## Privacy

No trackers, no analytics, no advertising. The app stores the server address, the scheduled reminders, the watched places of your location reminders, the widget data and, if you turned on fingerprint unlock, the encrypted account key, only in its private storage, excluded from Android backup. With [delivery through UnifiedPush](#on-time-through-unifiedpush) turned on, it also keeps that registration and its key there, and your server sends encrypted reminders through the UnifiedPush server you chose; nothing else leaves the phone.
