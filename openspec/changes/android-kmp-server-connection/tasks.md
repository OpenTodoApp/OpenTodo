# Tasks

## 1. Shared flow

- [ ] 1.1 Move the get-started Compose screen, address validation, health check, PKCE state, callback verification, and token exchange into `shared/commonMain`; verify with the Android and iOS compile tasks.
- [ ] 1.2 Implement shared health fallback (`/api/v1/health`, then `/healthz`) and app-sign-in capability handling; verify with a server exposing each health path.

## 2. Platform adapters

- [ ] 2.1 Keep Android activity/manifest as a thin entry point; move browser, HTTP, and Keystore implementations into `shared/androidMain`.
- [ ] 2.2 Add iOS `ASWebAuthenticationSession`, HTTP, and Keychain implementations in `shared/iosMain`, and register the callback scheme in the iOS app.
- [ ] 2.3 Document the shared-first development boundary in the KMP README.

## 3. Review

- [ ] 3.1 Build Android and iOS simulator targets; verify callback and first-run behavior on devices.
