# Design

## Decisions

- Keep product UI and connection behavior in `shared/src/commonMain`; future task screens, API flows, and domain logic also start there.
- Use platform adapters in `shared/src/androidMain` and `shared/src/iosMain` only for native browser authentication, HTTP, cryptography, and secure storage.
- Use the official app's system authentication flow with PKCE (`Custom Tabs` on Android, `ASWebAuthenticationSession` on iOS). Do not collect or handle an account password.
- Use platform HTTP and JSON facilities; do not add a networking or serialization dependency for this small API surface.
- Encrypt pending PKCE material and tokens with Android Keystore and iOS Keychain. Keep `androidApp` and `iosApp` as launch shells, with Android forwarding the custom-scheme callback into shared code.
- Normalize the server URL and reject credentials, query, fragment, or path components.

## Data model impact

No server data or synced entity changes. Device-local state consists of the server base URL and encrypted access/refresh tokens. Pending PKCE material is encrypted while the browser flow is outstanding and cleared after callback handling.

## Size and runtime impact

No new dependency, server image, or server runtime memory impact. Health checks and token exchange run off the main thread. Cleartext traffic is accepted only after shared address validation limits HTTP to loopback and private/local hosts.

## Interface budget

The first-run screen has a title, short explanation, one server URL field, one primary action, and inline connection status. It has one vertical scroll region and no task-list chrome.

