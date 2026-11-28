# Proposal

## Why

The KMP app is a starter scaffold and cannot yet connect to an OpenTodo server. The get-started experience and connection protocol belong in shared KMP code so Android and iOS use the same behavior.

## What Changes

- Put the get-started screen, server validation, health check, PKCE, callback validation, and token exchange in `shared/commonMain`.
- Add Android and iOS platform adapters in shared source sets for system authentication, secure storage, and HTTP.
- Keep `androidApp` and `iosApp` as launch shells that forward platform callbacks to shared code.

Out of scope: task views, sync, account switching, sign-out UI, and desktop product support.

Advances the ROADMAP item "Shells that feel native" by establishing a native Android entry point.

## Capabilities

### New Capabilities

- `android-app-connection`: first-run server validation and native app sign-in.

### Modified Capabilities

None.

## Impact

- `mobile/KMP/OpenTodo/shared`: common screen and connection flow plus Android/iOS platform implementations.
- `mobile/KMP/OpenTodo/androidApp` and `iosApp`: launch configuration and callback forwarding only.
- No server changes or new server routes. Uses the documented `/api/v1/health`, `/app/sign-in`, and `/api/v1/app/token` endpoints for the official app.
- No telemetry, third-party requests, or new dependencies.
