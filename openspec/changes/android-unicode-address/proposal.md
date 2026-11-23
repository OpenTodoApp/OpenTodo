# Proposal

## Why

The two shells read the address typed on the first-run screen with the same rules, written twice: `ServerAddress.kt` and `ServerAddress.swift`. Their tests were written twice too, and they have drifted. The Android app refuses a host typed in Unicode (`bücher.example`): `java.net.URI` reads no host in it. The iPhone app sends it in its ASCII (Punycode) form, as the requirement "The iOS first-run screen shows the address it uses" asks of iOS only. Android also accepts a port of 0 or above 65535, which iOS refuses.

## What Changes

- **One fixture of address cases**, `mobile/android/app/src/test/resources/server-address/cases.json`, read by both shells' unit tests: the input, and the origin it gives (and whether it is plain `http`), the `https` address offered instead, or a refusal. Also the hosts counted as local and the ones that are not. It holds every case both suites had.
- **The Android app sends a Unicode host in its ASCII form** (`java.net.IDN`), as the iPhone app does, and refuses a port outside 1 to 65535.

Out of scope: the screen itself, and the health check that follows.

Advances the ROADMAP item "Shells that feel native" (consolidation of the shells).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: both shells read an address by the same rules, kept in one shared fixture; a Unicode host works on Android too.

## Impact

- `mobile/android/app/src/main/java/app/opentodo/ServerAddress.kt`
- `mobile/android/app/src/test/java/app/opentodo/ServerAddressTest.kt`, `mobile/ios/OpenTodoTests/ShellTests.swift` (`ServerAddressTests`)
- The new fixture. No server, web or bridge change.
