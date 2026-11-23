# Proposal

## Why

Home Assistant users install the add-on, open `http://192.168.1.10:8080` and enter that address in the Android app. It works at home and stops working as soon as they leave, and nothing told them why. They then ask how to use OpenTodo away from home.

## What Changes

- **A notice under the address field** on the Android app's first-run screen when the address only works on the home network: this device, a private or link-local address, or a `.local` name. It reads "This address only works on your home network." with a link, "Use OpenTodo away from home", to the guide "Reach OpenTodo from outside your home". It never blocks connecting.
- Tailscale and CGNAT addresses (`100.64.0.0/10`), names without a dot (Tailscale MagicDNS) and public hosts get no notice.

Out of scope: the iPhone app, and the address rules themselves.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the Android first-run screen says when an address only works at home.

## Impact

- `mobile/android/app/src/main/java/app/opentodo/ServerAddress.kt` (`homeOnly`), `SetupActivity.kt`, `res/layout/activity_setup.xml`, the strings in every language.
- `mobile/android/app/src/test/java/app/opentodo/ServerAddressTest.kt`.
- No server, web or bridge change.
