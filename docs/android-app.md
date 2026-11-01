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

## Install the app

The same app comes from three places. Pick the one you already use; all three are signed with the same certificate, so updates from one install over the others.

- **Google Play**: search for **OpenTodo** in the Play Store, or open [play.google.com/store/apps/details?id=app.opentodo](https://play.google.com/store/apps/details?id=app.opentodo). Play updates it by itself.
- **F-Droid**: search for **OpenTodo** in the F-Droid app, or open [f-droid.org/packages/app.opentodo](https://f-droid.org/packages/app.opentodo/). F-Droid builds every version from the source code and publishes it only when its build matches the project's (see [below](#check-what-you-installed)), so a new version appears there a few days after the release.
- **GitHub**: download `opentodo-android-<version>.apk` from the [latest release](https://github.com/OpenTodoApp/OpenTodo/releases/latest) and open it on the phone (Android asks you to allow installing from your browser or file manager once). You update it the same way; tools such as Obtainium can follow the releases for you.

Release candidates (`-rc` versions) are only on GitHub, never in the stores.

While the app is in Google Play's closed testing and waiting for its first F-Droid build, the two store links above don't open yet: install from GitHub meanwhile, and switch to a store later (next section).

### Switching between Google Play, F-Droid and GitHub

Because all three carry the same certificate, you can switch without uninstalling: install the app from the other source over the one you have, and Android treats it as an update. The server, your offline copy, reminders, widgets and fingerprint unlock stay. Install a version at least as new as the one on the phone; Android refuses to go back to an older one. Afterwards, updates come from where you installed last (in the Play Store or F-Droid you may need to tap **Update** once).

Don't uninstall to switch: uninstalling deletes the app's data on the phone, including changes not yet synced and the fingerprint unlock key.

### Check what you installed

Every APK from Google Play, F-Droid and GitHub is signed with the certificate whose SHA-256 fingerprint is:

```
ff2eacdf7e79712e44fdd9d2e3110891e712c170ea516bd3fbbecc291072befa
```

On a computer with the Android SDK's build tools, check a downloaded APK, or one copied from the phone with `adb shell pm path app.opentodo` and `adb pull`:

```sh
apksigner verify --print-certs opentodo-android-0.20.0.apk
# Signer #1 certificate SHA-256 digest: ff2eacdf7e79712e44fdd9d2e3110891e712c170ea516bd3fbbecc291072befa
```

Any other fingerprint means the APK was not signed by the OpenTodo project: don't install it.

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

Then sign in as usual. After the first start the app also opens offline, with your local copy.

To use another server, long-press the app icon and choose **Change server**. This removes the current server's data from the phone (the offline copy, scheduled reminders, widget data and fingerprint unlock); changes not yet synced are lost.

## Behind a login page (Pangolin, Authelia and others)

If your server sits behind a login wall, such as Pangolin (with Pocket ID or its own users), Authelia, Authentik's proxy, Cloudflare Access or oauth2-proxy, the app signs in to the wall inside the app:

- **First start**: when the check meets the wall, the screen says the server is behind a login page. Tap **Sign in here**, sign in on the wall's page, and the app connects as soon as you're through. If the screen instead says the address answers with a web page, the wall may show its page directly; **Sign in here** works the same way.
- **Later**: when the wall asks again (its session expired), its sign-in page opens inside the app. A bar above it names the site you are signing in on, since the app has no address bar; the **×** in the bar, or back, returns to your server. If a sign-in can't continue in the app (for example a page left open for a long time), the app says so and offers **Sign in here** to start again.
- **Single sign-on**: OpenTodo's own **Sign in with …** button (see [Single sign-on](self-hosting/sso.md)) works the same way: the provider's page opens in the app and sends you back signed in.

Only pages the sign-in leads through stay in the app; a link to another site on a sign-in page (a privacy policy, a help page) opens in your browser, like every other link. The wall's session cookie is kept, so you sign in again only when the wall's session ends. Give the wall a long session (a "remember me" option, or a longer session lifetime) so that happens rarely: while the session has expired, the app's hourly background refresh of reminders and widgets doesn't get through and simply waits until you next open the app.

**Providers that refuse apps.** Some identity providers refuse to sign in inside an app's web view; Google, for example, shows "Error 403: disallowed_useragent". The app can't work around this yet. Sign in to OpenTodo with a password or a passkey instead (set a password in **Settings → Account** if your account is SSO-only), or use a provider that allows it in front of the wall, or let the wall bypass the app's paths (next section).

### Bypassing the wall instead

If you'd rather the app not meet the wall at all, let it bypass these paths for your OpenTodo resource; OpenTodo still asks for its own sign-in (password, passkeys, two-factor) on every one of them:

| Path | Used by |
| --- | --- |
| `/healthz` | the app's first-run check |
| `/api/*` | everything the web app loads or saves, including sync and sign-in |
| `/sw.js`, `/registerSW.js`, `/push-sw.js` | service worker updates (offline use, push) |
| `/manifest.webmanifest`, `/branding/*` | the app's name and icons |
| `/share` | sharing into the app (a form post) |

The page itself (`/` and the app's files under `/assets/`) still goes through the wall unless you bypass everything; with the paths above bypassed the app works whether or not you are signed in to the wall, and the background refresh needs the page, so it only runs while the wall's session lasts. Other clients have their own paths: calendar apps `/dav/` and `/.well-known/caldav`, AI assistants `/mcp`, calendar feeds `/feeds/*`, public links `/public/*` and `/t/*`.

## Reminders

In **Settings → Notifications**, turn on **Notifications through the app**. The app schedules the next seven days of reminders on the phone itself and refreshes them about once an hour, so a reminder you add on your computer reaches the phone too. Details in [Notifications](push-notifications.md#in-the-android-app).

## Sharing

The app appears in Android's share menu for links, text, photos and files, also on phones without Google Play services. See [Capturing pages](capture.md#from-the-android-app).

## Widgets

Two home-screen widgets: **Today** shows your tasks for today with the time of the last update, and **Quick add** opens the app's quick add. The widgets show what the app last saw; open the app to refresh them. While an encrypted account is locked, the Today widget shows only counts.

## Status and navigation bars

The phone's status and navigation bars take the colour of your [theme](themes.md) (the accent in light, the canvas in dark, or the theme's own bar colour), with light or dark icons so they stay readable, and they switch with it. The app remembers the colour, so the bars are right from the first frame of the next launch.

## Fingerprint unlock

With [end-to-end encryption](e2ee.md#unlock-with-a-fingerprint), the unlock screen offers **Unlock with fingerprint or face next time**.

## Privacy

No trackers, no analytics, no advertising. The app stores the server address, the scheduled reminders, the widget data and, if you turned on fingerprint unlock, the encrypted account key, only in its private storage, excluded from Android backup.
