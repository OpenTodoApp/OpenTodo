# Proposal

## Why

The Android app shows a reminder only if the web app handed it to the phone beforehand. With the app closed, the phone refreshes that list about once an hour. A reminder set on another device shortly before it is due does not arrive in time, and one that was snoozed elsewhere can still ring (GitHub issue #1344, `mobile/AUDIT.md`).

The server already solves this for browsers: at a reminder's time it sends an encrypted Web Push to every device that subscribed. A web view cannot receive Web Push. [UnifiedPush](https://unifiedpush.org) can: an app the user chooses (ntfy and others) keeps one connection open and hands messages to other apps, with no Google services. What it delivers is exactly the encrypted Web Push message the server already sends.

So the Android app can subscribe like a browser does, and the server needs no new way of sending.

The owner decided on 2026-11-14 to do Android this way first and leave the iPhone on its background refresh: an iPhone only takes pushes signed with the app's own key, which a self-hosted server cannot do without a relay the project would have to run.

## What Changes

- **The Android app can receive reminders by push**, through the UnifiedPush app on the phone.
  - In **Settings → Notifications** a switch, "Deliver at once through UnifiedPush", appears when the app can do it. Turning it on lets the user choose the UnifiedPush app, as that app's own screen asks.
  - The Android app registers with it, makes its own encryption keys, and the web app subscribes the device on the server the way a browser is subscribed.
  - At a reminder's time the server pushes; the app decrypts the message on the phone and shows the same notification, with Done, Snooze and Dismiss, that a reminder scheduled on the phone shows. One reminder never rings twice.
  - After a push the app refreshes in the background, so the phone's own schedule and the widget are current too.
- **Off until turned on**, because it puts a second app and its server in the path. The reminders scheduled on the phone keep working exactly as today, with or without it.
- **What the push service sees:** an encrypted message, its size and its time. Never a task. The message's content is the reminder's and task's ids and, when task names in notifications are on and the account is not end-to-end encrypted, the task's name: the same as for a browser.
- **Without a UnifiedPush app** the setting says that one is needed and nothing else changes.

Out of scope: push to the iPhone app; Firebase; pushing changes that are not a due reminder (a reminder moved or dismissed elsewhere is picked up by the next background refresh, as today); the installed web app, which already has Web Push.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: a shell may receive reminders by push through UnifiedPush.
- `reminders`: Notification settings gains the push switch in the Android app.

## Impact

- `mobile/android`: a UnifiedPush connector written against the specification (AND_3.1.0) with broadcasts, no library; Web Push decryption (RFC 8291) with the platform's crypto; one receiver in the manifest. No new dependency, no new permission.
- `web/src/lib`: two bridge methods and a capability (`push`), the subscription through the existing `/api/v1/push/subscriptions`; `web/src/app/ShellNotifications.tsx`: one row.
- Server: no new route, no schema change. The app's subscription is a row in `push_subscriptions` like a browser's. A fixture written by the server's own encryption pins the app's decryption.
- Bridge version stays 1. An older app does not list the capability and nothing changes; a newer app on an older server finds the push routes it needs already there.
- Owner settings apply as they do today: with push turned off on the server, the switch is not offered; a UnifiedPush server on a private address needs the owner's existing "allow private network targets" setting.
