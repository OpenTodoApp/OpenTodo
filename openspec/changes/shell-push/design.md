# Design

## Context

- **The server already pushes.** `internal/push` sends a due reminder to every row of `push_subscriptions` as Web Push: VAPID, `aes128gcm` (RFC 8291) with the subscription's `p256dh` and `auth`, one 4096-byte record, a `Topic` per reminder. The payload is `{type:"reminder", reminderId, taskId, fireAt, title?}`; `title` only when the subscription has `include_content`. Routes: `GET /api/v1/push/vapid-key`, `POST` and `DELETE /api/v1/push/subscriptions`, `POST /api/v1/push/test`, registered only while push is enabled. Sends go through the SSRF-safe client; an endpoint must be `https`.
- **The web app subscribes browsers** in `web/src/lib/push.ts` (`enablePush`: the browser's `PushManager`, then the POST with the device id). In a shell `NotificationsSettings` shows `ShellNotifications` instead, and no subscription exists.
- **The Android shell** shows reminders from its own schedule (`Reminders.kt`: alarms, `AlarmReceiver`, a notification per reminder with Done, Snooze, Dismiss; actions run a hidden run of the web app at `/?reminder=<id>&action=`). `HiddenRun.enqueueOnce` and the hourly run exist; a run ends on `backgroundDone()`.
- **UnifiedPush** (specification AND_3.1.0): the app sends the broadcast `org.unifiedpush.android.distributor.REGISTER` to the distributor's package with a random `token`, its identity (`FLAG_SHARE_IDENTITY` on API 34+, a `pi` PendingIntent below) and the server's VAPID public key (`vapid`). The distributor answers `…connector.NEW_ENDPOINT` (`token`, `endpoint`), `REGISTRATION_FAILED` (`reason`), `TEMP_UNAVAILABLE` or `UNREGISTERED`, and delivers `…connector.MESSAGE` (`token`, `bytesMessage`, `id`), which the app acknowledges with `…distributor.MESSAGE_ACK`. The user's distributor is found through the activity `unifiedpush://link`, which answers `RESULT_OK` with a `pi` whose creator is the distributor. Messages must be RFC 8291 content; the keys are the app's.

## Goals / Non-Goals

**Goals:** a due reminder reaches a closed Android app at its time, with no Google service, no new server feature, no new dependency, and nothing in the path the user did not choose.

**Non-Goals:** iPhone; Firebase; pushing edits; replacing the phone's own schedule.

## Decisions

### D1. The app is a Web Push subscriber

The shell produces what a browser's `PushManager` produces: `{endpoint, keys: {p256dh, auth}}`. The web app posts it to the existing route with `includeContent` from the device's titles option. The server cannot tell it from a browser, so the scheduler, retries, the 4 h TTL, the failure counter and sign-out removal all apply unchanged.

Alternative: a new "wake" message type and route. Rejected: more server surface for a weaker result (the reminder would still need a sync before it could show).

### D2. The connector is written against the specification

About ten intents, so no library (the module is AndroidX-only): `UnifiedPush.kt` holds the pure parts (intent names, the token, the state machine: unregistered → linking → registering → registered, endpoint changes, the failure reasons) and `PushReceiver` the broadcasts. The receiver is exported, as the specification needs, and accepts only intents whose `token` equals the stored one.

### D3. Keys and decryption on the phone

- A P-256 key pair and a 16-byte secret are made at registration with the platform's `KeyPairGenerator`/`SecureRandom`, stored in the app's private preferences (the Keystore cannot do ECDH below API 31, and the key protects reminder ids and optional titles, not the account). Deleted with the registration.
- `WebPush.kt` decrypts `aes128gcm`: read salt, record size and the sender's key from the header, ECDH, the two HKDF steps of RFC 8291, AES-128-GCM, strip the padding delimiter. Platform crypto only (`KeyAgreement`, `Mac`, `Cipher`). It rejects anything else, including a record larger than 4096 bytes.
- **Pinned by the sender.** A Go test (`UPDATE_PUSH_FIXTURE=1`) writes `mobile/android/app/src/test/resources/bridge/push-message.json`: a fixed receiver key pair and secret, a fixed sender key and salt, the payload, and the bytes `internal/push`'s own `encrypt` produces. The Kotlin unit test decrypts them; RFC 8291's own example is a second vector.

### D4. One notification per reminder

`MESSAGE` → decrypt → for `type: "reminder"`, `Reminders.show(reminderId, taskId, title)`, the same code the alarm uses, with the same notification id derived from the reminder id and `setOnlyAlertOnce(true)`. Whichever arrives second replaces the first silently. The alarm for that reminder is cancelled when the push showed it. Then `MESSAGE_ACK`, and `HiddenRun.enqueueOnce("/")` to sync, re-schedule and refresh the widget (it ends on `backgroundDone`).

A reminder the push shows that the user already completed elsewhere seconds ago is the server's call, as for browsers.

### D5. Bridge

Capability `push`, visible app and background run alike for reading, the visible app only for registering:

- `pushSubscribe(vapidKey) → Promise<json>`: starts the link activity if no distributor is chosen (visible app only), registers, and answers `{endpoint, p256dh, auth}` or `{error: "no-distributor" | "cancelled" | "failed" | "action-required" | "network"}`.
- `pushState() → Promise<json>`: `{available: boolean, registered: boolean, endpoint?, p256dh?, auth?}` without asking anything; a background run uses it to notice a rotated endpoint.
- `pushUnsubscribe()`: unregisters and deletes the keys.

The private key never crosses the bridge. Fixtures: the subscription shape, the state shapes, the errors.

### D6. The web side

`web/src/lib/shellPush.ts`, loaded only in a shell that lists `push`:

- `enableShellPush()`: VAPID key from the server, `pushSubscribe`, POST the subscription, remember the subscription id and the endpoint in meta (`shell:push`).
- `syncShellPush()` on start and in background runs: when `pushState().endpoint` differs from the remembered one, POST the new and DELETE the old; when the shell says unregistered, DELETE and turn the setting off.
- `disableShellPush()`, and the same on sign-out (`unsubscribeOnSignOut` already deletes the device's subscription) and when notifications through the app are turned off.
- `ShellNotifications` gets one row, "Deliver at once through UnifiedPush", with the Switch, or the line "Needs a UnifiedPush app such as ntfy" when `available` is false. Not shown on iOS, without the capability, or while the server's push routes answer 404.

### D7. Privacy and the owner's rules

The distributor's server sees an encrypted body, its size and when it came; the endpoint URL identifies the device to that server only. It is the user's choice of app and server, off by default, and said in the docs. AGENTS.md rule 5 holds: the outbound request goes to a target a user configured (their distributor's endpoint), through `internal/outbound` like every push.

### Data model, size

No table, no column, no op field: a subscription row as today. Android grows by the connector and the decryption, a few KB, no dependency. The web app's first load does not grow: `shellPush.ts` is a lazy chunk.

### Interface budget

One row in Settings → Notifications in the Android app. No chrome, destination, scroll region or shortcut.

## Risks / Trade-offs

- **Needs a second app.** Without a distributor nothing changes; the row says what is missing. Most users will not have one; this is for people who chose to leave Google's push.
- **Decryption written by hand.** Mitigated by the sender's own fixture and the RFC's vector; a wrong implementation shows nothing rather than something wrong.
- **Distributors differ** (ntfy, NextPush, Sunup): the specification is the contract; only ntfy can be tried by the owner at first, named in the tasks.
- **Cannot be verified here.** No Android SDK and no phone: unit tests cover the state machine and the crypto, CI compiles, the owner checks with ntfy.
- **An exported receiver** is attack surface: it ignores every intent without the stored token and never shows undecryptable content.
