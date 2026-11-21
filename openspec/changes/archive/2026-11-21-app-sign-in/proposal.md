# Proposal

## Why

The React Native app in `mobile/app` was removed: the owner chose to keep the web-view shells and invest in the web layer, because a second UI is not sustainable. Its changes (`native-app-foundation`, `native-app-everyday`, `native-app-handover`) were removed with it. One part of `native-app-foundation` had already shipped on the server and in the web app: app sign-in through the system browser and the signed-in apps in the sessions list. This change keeps that shipped behaviour under a live spec, unchanged.

## What Changes

- Nothing in the code. The account-access requirements that `native-app-foundation` added for app sign-in move into this change, which is archived at once, so `openspec/specs/account-access` describes what the server does.
- The requirements describe the server only: the app side they named (its server screen, signing out while offline) left with the app.

## Capabilities

### Modified Capabilities

- `account-access`: app sign-in through the system browser, and app sessions alongside other sessions.

## Impact

- Specs only. The routes (`/app/sign-in`, `/api/v1/me/app-sign-in`, `POST /api/v1/app/token`, `POST /api/v1/app/sign-out`, `/api/v1/me/apps`), the `app` token scope, migration `0065_app_sign_in.sql`, `docs/api.md` and the threat model's entry stay as they are.
