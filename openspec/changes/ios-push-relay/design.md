# Design

## Context

- **Today on iOS.** The web app hands the shell the next 7 days of reminders. The shell schedules up to 64 local notifications (`Reminders.swift`). `BackgroundRefresh` asks iOS for a `BGAppRefreshTask` every hour, and a hidden web view then syncs and hands the reminders over again (`HiddenRun`, ends on `backgroundDone`). iOS treats the hour as a hint and runs nothing after a force quit.
- **On Android (`shell-push`, #1358).** The app is a Web Push subscriber through UnifiedPush. That works because the user picks the push service. On iOS the only push service is APNs, and APNs accepts a push for `app.open-todo.ios` only with a JWT signed by the project's Apple key (token-based APNs auth: ES256, Key ID, Team ID). A self-hosted server cannot hold that key.
- **Server push today.** `internal/push` sends Web Push (VAPID, RFC 8291) to `push_subscriptions` from the reminders job, through the SSRF-safe client of `internal/outbound`. `OPENTODO_PUSH=off` turns push off. Owner switches are `settings.Switch` values (`internal/tenant/services/wire.go`), shown in Settings with the server scope.
- **The owner's decision.** The owner decided on 2026-11-24 for a relay run by the project: open source, opt-in next to the other notification providers, forwarding content-free wake-ups, with the app refreshing from the user's server. The #1377 thread adds requirements: stateless, safe, cheap and easy to maintain, with per-instance rate limits like the Home Assistant Companion app, and an open statement of what the relay's host sees.
- **Names.** `internal/relay` already exists (the device relay of the assistant). The new code is `internal/pushrelay` (the relay) and `internal/push/apple.go` (the server's client of it).

## Goals / Non-Goals

**Goals:**
- A reminder set elsewhere reaches a closed iPhone app on time, even after a force quit.
- Nothing about tasks or accounts reaches the relay or Apple.
- The relay stores nothing and is small enough to read in one sitting.
- The whole feature is off until the owner and then the user turn it on.
- No new mandatory configuration.

**Non-Goals:**
- Push for anything but reminders.
- A general-purpose push gateway.
- Per-server app builds.
- Replacing the phone's own schedule, which stays the primary path.

## Decisions

### D1. Who sees what

| Party | Sees | Never sees |
| --- | --- | --- |
| User's server | the APNs token, but only for the length of one registration request; the handle, the wake key, the due-token hash, the schedule cursor | — |
| Relay | the server's IP address. At registration: the APNs token, its environment and the wake key. At each wake: a handle (which it can open to those), a kind (`refresh` or `due`), a time and a signature | users, accounts, tasks, titles, the server's name or version, any reminder id |
| Apple (APNs) | the device token, the time, a fixed payload | anything about OpenTodo beyond "this app got a push" |
| Phone | everything, from the user's own server | — |

The relay learns which handles one server address wakes and when. `due` times approximate the device's reminder times, and `refresh` times approximate when the user edits. The owner accepted this ("a device token and a time"), and the docs say it in those words. The server sends `User-Agent: OpenTodo`, with no version.

### D2. Two keys, each minted by the party that uses it

- **The due token is minted on the phone.** When the user turns push on, the shell creates `dueToken`, 32 random bytes. It keeps the token in the Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, shared with the notification extension through the App Group keychain, so it is never in a backup.
  - It is the extension's bearer credential at the user's server (D8).
  - It crosses the bridge once, to the web app, which posts it to the server over the session and keeps no copy.
  - The server stores only its SHA-256. The relay never sees it.
- **The wake key is minted by the server.** At registration the server creates `wakeKey`, 32 random bytes, sends it to the relay, which seals it into the handle (D3), and stores it beside the handle.
  - It never reaches the phone.
  - It is replaced whenever the device re-registers.

Nothing is derived from anything else, so there is no key-derivation scheme to keep in step between Go and Swift.

**What the wake signature protects, and what it does not.**
- *It does protect:*
  - against a handle seen without its key (in a log line, an error report, a proxy, a partial copy of a backup), which cannot be used to wake the device;
  - against changing the kind of a wake in transit;
  - against replaying a wake more than 300 seconds later.
- *It does not protect against a leaked server database.* The database holds the handle and the wake key side by side, and whoever has both can send content-free wakes to that server's iPhones. That case is bounded by the fixed payloads (D5), the per-handle limits (D6) and handle expiry (D3, at most 30 days after the device last registered). It is not prevented. D13 says so.

Alternatives considered:
- **A secret minted on the phone, with both keys derived from it.** Rejected: it sends the phone's master secret to the server in any case, needs the same key derivation in Go and Swift with shared vectors, and buys nothing the two random keys do not.
- **A relay account per server.** Rejected: the relay would then know servers as identities and need a database.

### D3. Sealed handles: the relay keeps no state

Registration returns `handle = "h1." + base64url(keyId ‖ nonce ‖ XChaCha20-Poly1305(sealKey[keyId], plaintext, aad))`.
- The AAD is `"opentodo-push-relay/handle/1" ‖ keyId`, so a handle cannot be relabelled with another key id.
- The plaintext is `environment (1 byte) ‖ issuedAt (8) ‖ wakeKey (32) ‖ tokenLength (1) ‖ apnsToken`, about 200 characters encoded.
- Only the relay can open a handle. A server holding one cannot read the token.
- A handle expires 30 days after `issuedAt`. The relay answers `410 expired` after that.
- **Rotation of the sealing key:** the relay holds up to 4 keys by id. New handles use the newest, and an old key is removed only after 30 days, once no live handle uses it.
- **Revocation** without state: a handle dies when it expires, when Apple answers `410 Unregistered` or `BadDeviceToken` (app deleted, token changed), or when the key it was sealed with is removed. Removing a key is an emergency stop for every handle sealed with it, and devices re-register at their next run.

Alternatives considered:
- **A relay database of tokens.** Rejected: it would be a store to protect, back up and delete from, against the "stateless" requirement.
- **Handles that never expire.** Rejected: a handle leaked with a server's database would work for ever.
- **Renewal by the server alone.** Rejected for the same reason: a leaked handle could be renewed for ever. Renewal needs the device's current APNs token, which the server does not keep (D7).

### D4. The relay's API

HTTPS only. JSON bodies of at most 4 KB, and unknown fields are refused. No cookies, no CORS headers: no browser calls it. Errors are `{"error": "<code>"}` with the status below.

| Route | Body | Auth | Answers |
| --- | --- | --- | --- |
| `POST /v1/register` | `{token (hex, 64–200), environment ("production" \| "development"), wakeKey (base64url 32 B)}` | none: anyone can register a token they know (D6 says why that is acceptable). Nothing is stored. | `200 {handle, expiresAt}`; `400 invalid`; `429` with `Retry-After` |
| `POST /v1/wake` | `{handle, kind ("refresh" \| "due"), ts (unix seconds), sig}`; `sig = base64url(HMAC-SHA256(wakeKey, "opentodo-push-relay/1\n" + kind + "\n" + ts + "\n" + handle))` | the signature with the handle's own `wakeKey`; `ts` within ±300 s | `202`; `400 invalid`; `401 signature` (bad signature, unknown key id, skew); `410 expired` / `410 gone` (Apple says the token is dead); `429` with `Retry-After`; `502 apns` (transient) |
| `GET /v1/health` | — | public | `200 {"protocol": 1}` |

There are no other routes, and nothing lists, reads or deletes devices. `401` carries the same body for a bad signature, a forged handle and an unknown key, so the relay offers no oracle. A replayed wake within the 300 s window re-sends the same content-free push, within the per-handle limits of D6.

The relay talks to APNs over HTTP/2 (`api.push.apple.com`, or `api.sandbox.push.apple.com` for `development`), with a provider JWT renewed every 40 minutes, `apns-topic: app.open-todo.ios`, and the payloads of D5. It makes no other outbound request.

### D5. Payloads

The relay builds the payload. The server cannot choose any text, sound, URL or topic, so the relay is not a general notification gateway.

- **`refresh`** (`apns-push-type: background`, `apns-priority: 5`, `apns-collapse-id: refresh`, expires in 1 h): `{"aps":{"content-available":1},"v":1}`.
- **`due`** (`apns-push-type: alert`, `apns-priority: 10`, expires in 10 min): `{"aps":{"alert":{"title-loc-key":"PUSH_DUE_TITLE","loc-key":"PUSH_DUE_BODY"},"mutable-content":1,"sound":"default","category":"opentodo.reminder"},"v":1}`.
  - The localized fallback text ("Reminder" / "Open OpenTodo to see it") lives in the app. The notification extension replaces it (D9).
  - The interruption level is the default (`active`). Time-sensitive delivery is not used: it would let a wake break through Focus, which a generic, possibly abusive alert should not do, and it would need another entitlement.

`v` is the payload version. The app ignores a version it does not know, apart from running a refresh.

Alternative: a `due` that carries the reminder id. Rejected: it gives the relay and Apple a stable identifier per reminder, and the notification extension can ask the user's server instead.

### D6. Rate limits and abuse resistance

The counters live in memory, in fixed windows, inside an LRU of at most 200,000 keys. Per-handle keys are `HMAC(dailySalt, token)`, so the counters follow the device and not the handle, and cannot be linked from one day to the next. **A restart resets every limit.** The reference deployment is one long-running instance (D11), so the limits are those of that process.

| Key | Limit |
| --- | --- |
| per device, `refresh` | 3 an hour (Apple's guidance for background pushes) |
| per device, `due` | 4 an hour, 24 a day |
| per source address (IPv4, IPv6 per /56), `wake` | 3,000 an hour (a server with hundreds of iPhones) |
| per source address, `register` | 30 an hour |
| whole instance | 50 wakes a second, queued briefly and then answered with `429`, so one abuser cannot get the project's APNs key throttled by Apple |

The `due` cap is low on purpose. It is the most a stranger can send to one phone, and a user who has more than four reminders an hour on a stale schedule gets the rest from the phone's own schedule, or from the next refresh, as today.

Registration carries no proof of a genuine app. DeviceCheck was considered and dropped: its token is not bound to the APNs token or to the request, so it proves only that some Apple device ran the app once, and it adds a call to Apple per registration. Instead, what a registration can do is bounded:
- **Registering a token** only works for a token the caller already knows, and APNs tokens are known to the device, Apple, and the device's own server.
- **Registering garbage** costs Apple one rejected push per wake and is bounded by the per-address limit.
- **A stranger who knows a phone's token** can register it and send it content-free wakes: at most 3 silent ones and 4 generic alerts an hour, and 24 a day. That is the worst case, and the docs name it.
- **Sending content through the relay** is impossible: the payloads are fixed (D5).
- **Exhausting the APNs key** is bounded by the per-address and instance limits.
- **Learning from responses** gets nothing: no answer distinguishes a forged handle from a wrong key.
- **Waking a stranger's phone through its existing registration** needs that handle and its wake key, which only its server holds.
- **A leaked server database** gives the same power as knowing the tokens: content-free wakes within the caps, until the handles expire (D2).

### D7. Registration, rotation and unregistering

Registration goes **through the user's server**. The phone only ever talks to its server, as `native-shells` requires, and the relay never sees a phone's IP address.

1. The user turns on the switch on the iPhone. The shell asks for notification permission, calls `registerForRemoteNotifications`, and mints `dueToken` (D2).
2. The web app posts `{deviceId, token, environment, dueToken, includeContent}` to `POST /api/v1/push/apple`.
3. The server mints `wakeKey`, calls the relay's `/v1/register` through `internal/outbound`, and stores the handle, the wake key and the hash of `dueToken`. It forgets the APNs token and `dueToken` itself.

How a registration changes over time:
- **Renewal:** the server's answer to a schedule report (D8) carries `renew: true` once the handle expires within 7 days. The web app asks the shell for the current token (`applePushRenew`, which returns the token and environment, never `dueToken`), and the server registers again with a new wake key and replaces the handle. A device that stops running, because it was signed out, wiped or abandoned, stops renewing, and its handle dies within 30 days.
- **Token rotation:** when iOS hands the app a new APNs token (a restore, a reinstall, or Apple rotating it), the shell reports `tokenChanged` and the web app renews at once.
- **Unregistering:** turning the switch off, signing out, changing servers, locking an encrypted account, or the server revoking the session all delete the server's row. The shell deletes `dueToken`. The relay needs no call: the server no longer holds the handle, and the handle expires. A wake that still arrives finds no token in the Keychain. The notification extension then shows the generic text, or nothing with the filtering entitlement (D9).
- **Apple's 410** reaches the server as `410 gone`. The server deletes the row, and the web app re-registers at its next run if the switch is still on.

### D8. The server

**Settings.**
- `push.apple_relay` is an owner switch, off by default, in Settings → Notifications with the server scope, next to Delivery channels. Its label is "iPhone push through the OpenTodo relay". Only the owner's switch turns the relay on.
- `push.apple_relay_url` defaults to the project's relay (owner item 3), shown under the switch only while it is on. Another address is for people who run their own relay with their own signed build, and for tests.
- `OPENTODO_APPLE_RELAY=<url>` is optional and **only overrides the address**. It never turns the relay on, and while the switch is off it has no effect. It is documented in `docs/self-hosting/configuration.md`.
- With `OPENTODO_PUSH=off` the switch is not offered. On a demo instance it is fixed off. In host mode it is the host operator's setting.
- **While the switch is off, nothing reaches the relay:** no registration, no wake, and no health probe from the delivery check. Every request goes through `internal/outbound`, and a private-address relay is refused unless the owner allowed private targets.

**Table `apple_devices`** (one migration), one row per device and session:
- `id`, `user_id`, `session_id`, `device_id`;
- `handle`, `handle_expires_at`, `wake_key`;
- `due_token_hash`, `include_content`;
- `schedule_cursor` (the op-log sequence the device's schedule reflects) and `scheduled_until`;
- `last_refresh_at`, `pending_refresh_at`, `last_due_at`;
- `failures`, `created_at`.

A row is deleted with its session and on a revoked device. There are at most 10 rows per user (the bound of `push_subscriptions`). The rows are not ops and are never synced: a device registration is device state, like a push subscription.

**Routes.** All are `.demoDenied()`, and each has an authentication and an error scenario in the spec:
- `POST /api/v1/push/apple` (session): register or replace this device's registration.
- `PUT /api/v1/push/apple/{id}/schedule` (session) `{cursor, until}`: "this device's local schedule reflects the op log up to `cursor`, through `until`." It answers `{renew}`, or `404` when the row is gone, and the web app then re-registers.
- `DELETE /api/v1/push/apple/{id}` (session).
- `GET /api/v1/push/apple/due`: authenticated by `Authorization: Bearer <dueToken>`, registered as `public("notification extension: its own device due token")` as other routes with their own credential are.
  - It answers the reminders of that device's user firing in `[now − 5 min, now + 1 min]`: `id`, `taskId`, `fireAt`, and `title` only when `include_content` is set and the account is not end-to-end encrypted.
  - A title is plain text, with Markdown marks removed, truncated to 120 characters.
  - It is limited to 30 requests an hour per device and answers `401` to an unknown token.
- `POST /api/v1/push/test` also sends a `due` wake to the calling device's Apple registration.

**When it wakes.**
- **`refresh`:** after `NotifyApplied`, for an op that adds, moves, snoozes, dismisses or deletes a reminder of user U firing within 8 days, or that changes such a reminder's task. Each of U's devices whose `schedule_cursor` is behind gets one, except the device the op came from. Wakes are coalesced to at most one every 20 minutes per device: within the window `pending_refresh_at` holds the next send, and the reminders job sends it.
- **`due`:** in the reminders job, at the tick that sends Web Push. A reminder gets a `due` wake for a device when its last change is newer than that device's `schedule_cursor`, or when it fires after `scheduled_until`, which means the device cannot have it scheduled.
  - A device whose schedule is current gets nothing, so a reminder rings once from the phone's own schedule.
  - Reminders due in the same minute share one wake, and the server keeps under the relay's caps (4 an hour, 24 a day) and sends nothing beyond them.
- **Results:** `410` deletes the row. `429` waits `Retry-After`. `5xx` and timeouts retry `due` until 5 minutes past the reminder's time, then give up, and retry nothing for `refresh` (the next change wakes again). After 3 days of failures the delivery check shows "relay unreachable". While the switch is on, the delivery check may call `/v1/health`.

**Offline and convergence.** Wake-ups write no data. A device that missed a wake converges at its next background run or start, exactly as today. Done and Snooze from a pushed notification run the web app's own reminder operations, which apply offline and converge like any op.

### D9. The iPhone app

- **Entitlements:** `aps-environment`. A new target, `OpenTodoNotify` (a notification service extension, bundle ID `app.open-todo.ios.notify`, in the App Group), which the CI bundle-ID script registers.
- **Bridge capability `apple-push`** (visible app only for registering), modelled on Android's `push`:
  - `applePushRegister() → {token, environment, dueToken} | {error: "denied" | "unavailable" | "failed"}`;
  - `applePushRenew() → {token, environment} | {error}`;
  - `applePushState() → {available, authorized, registered, tokenChanged}`;
  - `applePushForget()`, which deletes `dueToken`.
  - The capability is listed only in builds with the entitlement, so a build from source without a key does not show the row.
- **Silent push (`refresh`):** `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` starts the same `HiddenRun` that `BackgroundRefresh` uses, with a 25-second budget, and calls the completion handler when `backgroundDone` arrives. **Its limits, stated in the docs:**
  - iOS may delay or drop background pushes (Apple advises no more than two or three an hour);
  - none arrive after a force quit, with Background App Refresh off, or in Low Power Mode;
  - they are best effort.
  This is why `due` exists.
- **Alert push (`due`) and the notification extension.** On a `due`, the extension:
  1. reads the server origin from the App Group and `dueToken` from the shared Keychain;
  2. calls `GET /api/v1/push/apple/due` with an 8-second timeout;
  3. for the first due reminder, sets the title (plain text, as the server sent it) or the generic text, the category with Done, Snooze 10 min and Dismiss, and `userInfo {reminderId, taskId}`, so a tap and the actions work as for a local notification;
  4. removes a pending or delivered local notification `opentodo.reminder.<id>` so the reminder shows once;
  5. if more than one reminder is due, sets the body to the count and opens Today on tap;
  6. on any failure keeps the generic text. That includes an unreachable server, a token that is gone, and a login wall in front of the server (Authelia, Cloudflare Access, basic auth) that does not let `/api/v1/push/apple/due` through. The extension writes nothing else and logs nothing about the content.

  The extension runs even after a force quit, which is the point. The docs tell people behind a login wall to bypass the wall for that one path, as they already do for `/api/` tokens and CalDAV.
- **Filtering (optional, owner item 1).** With `com.apple.developer.usernotifications.filtering`, which Apple grants on request, the extension drops a `due` for which the server says nothing is due: a reminder completed seconds ago, a signed-out device, an abusive wake. Without it, the extension must show something and shows the generic text. The design works either way, and the entitlement only removes the stray generic alert.
- **The row:** Settings → Notifications in the iPhone app gets "Deliver on time through the OpenTodo relay", a switch, shown when the owner's switch is on, the server offers push and the shell lists `apple-push`. It is off until turned on. With notifications through the app off, it is off too. `include task titles` decides `includeContent`.

### D10. When the relay is unreachable

Nothing gets worse than today:
- The phone keeps its local schedule and the hourly `BackgroundRefresh`.
- On the server, a failed wake retries as D8 says and never delays Web Push or delivery channels.
- Registration fails with `502 relay-unreachable`, and the row says the relay could not be reached and stays off.
- The delivery check lists the relay's state (reached, its protocol, the last failure), only while the switch is on.
- If the project's relay goes away, the owner can point `push.apple_relay_url` at another relay that holds the same key, or turn the switch off.

### D11. Where the relay lives, and how it ships

- **In this repository:** `cmd/opentodo-push-relay` and `internal/pushrelay`.
  - The protocol, the client and the relay are tested together: server tests run the real relay handler in-process against a fake APNs.
  - The relay has the same CI, `gosec`, signing, SBOM and provenance as the server, and sits next to the code it serves, where reviewers already look.
  - A separate repository was rejected: two release pipelines, and drift between the protocol and its client.
- **No dependencies.** It uses the Go standard library (HTTP/2, `crypto/ecdsa` for ES256, HMAC) and `golang.org/x/crypto/chacha20poly1305`, which the module already has. It is about 500 lines plus tests. The relay's configuration is its own environment: the key file, Key ID, Team ID, topic, the sealing-keys file and the listen address. These are the relay's variables, not the OpenTodo server's, so the server gains no mandatory variable.
- **Release:** the release workflow builds a second image, `ghcr.io/opentodoapp/opentodo-push-relay`, from the same `v*` tag. It is distroless, nonroot, signed with cosign and carries an SBOM. That workflow change is a task (6.1) for the implementation pull request, not this one. The relay's protocol is `v1` in the path and moves independently of app versions: a new protocol version adds a path and keeps the old one for at least a year.
- **Deploy:** the reference deployment is **one long-running instance**: a small VPS with Caddy in front, TLS, access logs off (D12), the image pinned by digest. It does not scale to zero and runs no second replica, so the in-memory limits of D6 hold for the whole relay. They reset when it restarts, which the docs say. Updating means pulling the new digest; it needs no migration.
- **Cloudflare Workers** (suggested in #1377) was considered and rejected as the reference deployment:
  - it means a second implementation in JavaScript with its own tests;
  - the Worker's platform terminates TLS and sees tokens and IP addresses in its logs and analytics by default;
  - its free tier's rate-limiting still needs a store.
  The protocol does not forbid it.
- **Load and cost:** a wake is one small HTTPS request in, and one HTTP/2 stream to Apple out. 10,000 active iPhones at a few wakes each a day is well under 100,000 requests a day, which one small instance handles at a fraction of a CPU. Apple charges nothing for APNs. The expected cost is the smallest VPS tier, a few euros a month.

### D12. Privacy: what the relay logs, and for how long

- **Per request:** nothing. No address, handle, token, kind or timing is written anywhere. Errors are logged by class (`apns 410`) without the request's data.
- **Counters:** every hour, the relay writes one line to stdout: registrations, wakes by kind and outcome, `429`s by limit, and APNs errors by reason. There is no metrics endpoint. The counters live in memory and are gone on restart.
- **The rate-limit LRU** holds salted, daily-rotated keys in memory only.
- **The host:** the deployment turns off the proxy's access logs, and the deployment notes say so. The hosting provider can still see connection metadata at the network level. `docs/push-relay.md` says that openly, names the host the project uses, and says that the relay operator together with Apple could link a server's address to the Apple devices it wakes.
- **The server** keeps no APNs token after registration, and the relay keeps nothing at all.
- **The App Store answers:** "Data Not Collected" stays. The relay is opt-in, keeps nothing, and the device token is used only to deliver the push the user turned on.

### D13. The threat model update

`docs/security/threat-model.md` gains the following.

**Trust boundary 2, "Server to the outside":** add "the push relay, while the owner turned it on".

**Profile "Malicious or compromised push relay".**
- *Defended:*
  - reading tasks, titles, reminder ids, accounts or the server's users: none of them is sent (D1, D5);
  - calling the user's server as the device: the relay never holds `dueToken`;
  - making a tap open another site: the app ignores any URL in a payload and opens only its configured server.
- *Not defended:*
  - a relay holding the APNs key can push any alert to any registered token, including text that phishes under OpenTodo's name. The notification extension rewrites `mutable-content` alerts, but a push without that flag shows as sent. The recovery is revoking the key at Apple; every device then stops receiving pushes until a new key is deployed;
  - it learns the server's address, how many iPhones it wakes, and their reminder and activity times (D1);
  - it can stop delivering, which leaves the phone on its local schedule (D10).
- *Mechanism:* fixed payloads, no content, a due token the relay never sees, the extension's own fetch.
- *Verified by:* `TestRelayPayloadsAreFixed`, `TestWakeCarriesNoContent` (server client), and the extension's unit test that ignores a payload URL.

**Profile "Relay abuser" (anyone on the internet).**
- *Defended:*
  - sending text, sounds or links through the relay;
  - waking a device through its existing registration without the handle and its wake key;
  - more than 3 silent wakes and 4 generic alerts an hour, and 24 alerts a day, to any phone;
  - exhausting the key (D6).
- *Mechanism:* fixed payloads, sealed handles, HMAC signatures, per-device and per-address limits.
- *Verified by:* `TestRelayPayloadsAreFixed`, `TestWakeNeedsSignature`, `TestForgedHandleLooksLikeBadSignature`, `TestHandleKeyIdInAAD`, `TestLimits` (`internal/pushrelay`).
- *Not defended:*
  - someone who knows a phone's APNs token can register it and send those capped, content-free wakes;
  - someone who has a server's database can do the same for that server's iPhones until their handles expire. The wake signature does not help there, because the key sits beside the handle (D2);
  - a flood from many addresses below the per-address limit, beyond the instance cap;
  - a restart of the relay resets its limits;
  - someone holding a very large number of valid handles (about 100,000, each needing a registration, capped at 30 an hour per address) can fill the device counters: no cap is reset, because device counters are never evicted, but phones without counters that day get `429` until the UTC day ends and keep their own schedule.

**Component "Push relay":**
- *Code:* `internal/pushrelay`, `cmd/opentodo-push-relay`, `internal/push/apple.go`, `mobile/ios/OpenTodoNotify`.
- *Controls:* D3 to D6 and D12.
- *Tests:* the tests named above, plus `TestNoRelayCallWhileOff`, `TestEnvOverrideNeverTurnsOn`, `TestDeliveryCheckNoProbeWhileOff` and `TestRelayThroughOutbound` (server).

**Profile "Stolen or unlocked device":** `dueToken` is `ThisDeviceOnly` and is deleted with the registration. A revoked session deletes its `apple_devices` row.

**Accepted risks:** add "the project's push relay and its APNs key are a single point that, if compromised, can send notifications to every registered iPhone".

### Data model

- One new table, `apple_devices` (D8). No op field or op schema change. No change to `push_subscriptions`.
- Two owner settings and one optional environment variable, which overrides only the address.

### Size and memory

- **OpenTodo server:** about 10 KB of code and no dependency. The image grows by that much.
- **Relay:** a separate image of about 10 MB distroless. It keeps two rate-limit LRUs of at most 200,000 keys each, one for source addresses and one for device tokens, and uses under 80 MB of memory with both full.
- **iOS:** the extension target adds about 200 KB.
- **Web:** `applePush.ts` is a lazy chunk, so the first load does not grow (`make bundle-budget`).

### Interface budget

- One row in the iPhone app's Settings → Notifications.
- One owner row in Settings → Notifications (a switch, with the address under it while on).
- No chrome above a list, no task property, no sidebar destination, no scroll region, no shortcut.

## Risks / Trade-offs

- **A project-run service is a commitment.** If it goes down, users lose only the speed-up (D10). If it is compromised, the risk is the notifications of D13. Both are written down, and the relay is opt-in twice: by the owner and by the user.
- **Open registration.** Without proof of a genuine app, anyone who knows a token can register it. The caps and fixed payloads make the worst case a few generic alerts a day.
- **The extension shows a generic alert when it cannot reach the server**, for example behind a login wall that does not bypass the due route, or on a dead network. Better a generic reminder on time than none. The docs say why and how to bypass.
- **Background pushes are best effort.** That is why `due` exists, and also why `due` is sent only when the device's schedule is stale. Otherwise Apple would see a push at every reminder time.
- **Low `due` caps.** More than 4 stale reminders an hour fall back to the phone's own schedule.
- **Duplicate alert races:** a local notification and a `due` at the same second can both sound once before the extension removes one. This is rare, because `due` is only sent for stale schedules.
- **App Review** needs to see it work: the review notes point at a test server with the relay on, since the public demo keeps it off.
- **Cannot be verified here.** There is no Mac, Apple key or iPhone in this environment. The relay and the server are covered by Go tests with fakes, and the device behaviour is the owner's checks (tasks 8.x).

## Settled questions

- **Time-sensitive interruption level:** off. Wakes use the default level (D5).
- **Proof of a genuine app at registration:** none. DeviceCheck was dropped (D6).

## Open Questions

- **Should the relay also accept wakes for the Android app over FCM** for people without a UnifiedPush distributor? That is out of scope here; F-Droid and the "no Google services" stance argue against it.
