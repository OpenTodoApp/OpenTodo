# Proposal

## Why

The iPhone app shows a reminder only if the web app handed it to the phone beforehand. With the app closed, iOS refreshes that list when it chooses (an hour is a hint, not a promise) and never after a force quit. A reminder set on another device shortly before it is due does not arrive, and one dismissed elsewhere can still ring (issue #1377, the iOS half of #1344).

Android solved this in `shell-push` (#1358) with UnifiedPush: the server pushes to a service the user chose. iOS has no such door. An iPhone only accepts pushes from Apple's push service (APNs), and APNs only accepts pushes signed with the key of the app's own Apple developer account. A self-hosted server does not have that key and must not.

The owner decided (issue #1377, 2026-11): **a relay run by the project**. It holds the app's APNs key, is open source, is opt-in in Settings next to the other notification providers, and forwards **content-free wake-ups**: it sees an opaque device handle and a time, never a task, an account or a server's user. The app then refreshes its reminder schedule from the user's own server, or asks that server what is due. Signing the app per server was rejected as unrealistic for most people (#1377, comments of 2026-11).

## What Changes

- **A push relay, `cmd/opentodo-push-relay`, in this repository.** A small Go binary with no database. It has three routes: register a device, wake a device, health. It holds the APNs key and a sealing key, and it keeps nothing but in-memory counters.
  - **Registration** turns an APNs device token into a **sealed handle**, which only the relay can open. The handle carries the token, a per-device wake key and an issue date, and expires after 30 days.
  - **A wake** names the handle and a kind (`refresh` or `due`), signed with the device's wake key. The relay sends Apple a payload with no content: a version number and, for `due`, a generic localized alert.
- **The device secret is minted on the phone.** The app creates a random 32-byte secret and keeps it in the Keychain. Two keys are derived from it: one for the relay, so only the holder of the device's secret can wake the device, and one for the user's server, so the notification extension can ask what is due. The relay never learns who the user or the server is.
- **The server, off by default.**
  - An owner switch, **iPhone push through the OpenTodo relay** (`push.apple_relay`), in Settings → Notifications, scoped to the server. It is off by default.
  - A relay address (`push.apple_relay_url`) defaults to the project's relay. `OPENTODO_APPLE_RELAY` (`off` or a URL) is an optional override.
  - Every call goes through `internal/outbound`. While the switch is off, the server never contacts the relay.
  - New routes under `/api/v1/push/apple` register, report and remove a device.
- **Two wake-ups.**
  - A **refresh** is a silent push. It is sent when a change touches the user's reminders in the next 8 days, at most once every 20 minutes per device. The app runs its background refresh, as it does today.
  - A **due** is an alert push with `mutable-content`. It is sent at a reminder's time, but only when the device's last reported schedule may be missing that reminder. The app's notification extension asks the user's server what is due, then shows the title (or the generic text) with Done and Snooze, and removes a local notification for the same reminder so it rings once.
- **The iPhone app, off by default.** Settings → Notifications in the iPhone app gets one switch, shown when the owner turned the relay on. Turning the switch on asks for notification permission, registers, and subscribes the device. Turning it off, signing out or changing servers removes the registration. Reminders scheduled on the phone keep working with or without the relay.
- **Privacy, stated in the docs.**
  - The relay sees the server's address, an opaque handle, a kind and a time.
  - Apple sees the device token, the time and an empty payload.
  - The relay logs no address, token or handle. It keeps hourly counters only, in memory.
- **The threat model** gains a profile for a malicious or compromised relay, a profile for a relay abuser, and a component entry for the relay.
- **Release.** The relay is released as its own signed container image (`ghcr.io/opentodoapp/opentodo-push-relay`) from the same tags as the app. The project deploys it at an address the owner chooses.

Not **BREAKING**: no op field changes, no environment variable becomes mandatory, and no existing route changes. Without the owner switch, nothing changes.

## Out of scope

- Signing the app per server (rejected by the owner), Firebase, and any push provider other than APNs.
- Pushing anything but reminders: assignment and status pushes, and widget refreshes, which follow from the background run.
- Live Activity push updates (`focus-live-activity`) and location reminders on iOS.
- The installed web app on iPhone, which already has Web Push through Safari.
- A relay that other projects can use, or one per tenant in host mode. A host operator can turn it on for the whole host, and every tenant shares the switch.
- Implementing it. This change is the design. The tasks are the implementation plan, and the items in **Needs the owner** must be settled before tasks 6 and 8.

Advances the ROADMAP rows `ios-shell` and `ios-distribution` ("Push to the iPhone app needs a relay … not planned" becomes this change) and the milestone 0.20 "Everywhere".

## Needs the owner

1. **The Apple key.** Create an APNs authentication key (`.p8`, its Key ID, the Team ID) with DeviceCheck enabled in the Apple developer account. Turn on the Push Notifications capability for `app.open-todo.ios`. Allow CI to register a fourth bundle ID, `app.open-todo.ios.notify`, for the notification extension. Optionally, ask Apple for the notification filtering entitlement (design D9). Then store the key as a relay deployment secret, never in CI.
2. **Hosting and its cost.** Choose a host for one stateless container: a small VPS or a container platform. The design rejects Cloudflare Workers (D11). Choose who has access to its secrets and logs, and who answers when it is down. Expected load and cost are in design D11: about one small instance, a few euros a month at most.
3. **The domain.** Choose a subdomain such as `push.open-todo.app`, with DNS and TLS. It becomes the default `push.apple_relay_url`, which the app and the docs name.
4. **The sealing key.** Generate the relay's 32-byte sealing key and keep it with the APNs key. Rotating it later is supported (D3).
5. **App Store answers.** Update the App Privacy answers and the review notes for push. Since the relay is opt-in, confirm whether "Data Not Collected" still holds.
6. **On a phone.** Run the device checks of tasks 8.1 to 8.4. Nothing here can run without a signed build and a real iPhone.

## Capabilities

### New Capabilities

- `push-relay`: the relay service, its API, its limits and what it keeps.

### Modified Capabilities

- `native-shells`: the iPhone shell may receive wake-ups through the relay, and renders due reminders in a notification extension.
- `reminders`: the owner switch and the relay address, the per-device setting in the iPhone app, the server's wake-ups and the routes under `/api/v1/push/apple`. The Android setting's scenario for iPhone changes.
- `self-hosting`: the push relay is an outbound destination, but only once the owner turns it on.

## Impact

- **New:** `cmd/opentodo-push-relay` and `internal/pushrelay` (the relay), plus a target in the `Dockerfile`. It needs no dependency: HTTP/2, ES256 and the AEAD come from the Go standard library and `golang.org/x/crypto`, which the server already uses.
- **Server:** `internal/push/apple.go` (the client), one migration adding the table `apple_devices`, routes under `/api/v1/push/apple`, two owner settings and an optional environment variable. No op field changes.
- **iOS:**
  - The `aps-environment` entitlement.
  - Remote notification handling in `AppDelegate`.
  - A notification service extension, `OpenTodoNotify`.
  - A Keychain item shared through the App Group.
  - The bridge capability `apple-push`.
- **Web:** `web/src/lib/applePush.ts` (lazy), one row in `ShellNotifications`, and one owner row in Settings → Notifications.
- **Docs:**
  - A new `docs/push-relay.md`.
  - Updates to `docs/push-notifications.md`, `docs/ios-app.md`, `docs/self-hosting/configuration.md` and `docs/security/threat-model.md`.
  - Updates to `mobile/README.md` and `RELEASING.md`.
