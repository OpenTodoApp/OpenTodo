# Proposal

## Why

Issue #233 asks for profile pictures by upload or synced from the single sign-on provider. Uploading exists since `settings-refresh` (Settings → Account → Profile). What is missing is the provider's picture: an OpenID Connect provider with the `profile` scope sends a `picture` claim, and people who sign in through it expect the same picture here without uploading it again.

## What Changes

- A new owner switch in the single sign-on settings, **Use profile pictures from the provider** (`syncPictures`, off by default): at every provider sign-in or link, the server fetches the address in the `picture` claim through the outbound policy, crops and scales it to the profile picture's 256×256, re-encodes it as JPEG (no metadata survives) and stores it as the account's picture.
- A picture the person uploaded is never replaced. A provider picture the person removed is not fetched again until the provider names another address. An unchanged address is not fetched twice. The fetch is bounded (5 seconds, 2 MB, PNG, JPEG or GIF, at most 4096 px a side) and a failure never fails the sign-in.
- The picture's provenance is recorded with the profile (two nullable columns on `user_profiles`, added at startup when missing).
- No new dependency: the scaling is a small standard-library package (`internal/imgfit`), shared with the owner's logo (`instance-branding`).

Out of scope: pictures in WebP or SVG from the provider (left as they are: no picture); refreshing a provider picture outside a sign-in; a per-user opt-out beyond uploading or removing the picture.

Outbound requests (AGENTS.md rule 5): the fetched address is named by the provider the owner configured and is fetched only after the owner turns the switch on; it goes through `internal/outbound` (http(s) only, no private network targets unless the owner allows them in the webhooks setting, the connection pinned to the checked address).

ROADMAP: extends the shipped `oidc-login` item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `oidc-login`: "Provider configuration" (the switch); ADDED "Profile picture from the provider".
- `account-profile`: "Profile picture" (an uploaded picture is never replaced by the provider's; removal and provenance).

## Impact

- `internal/oidc` (`Claims.Picture`, `Config.SyncPictures`, `KeySyncPictures`), `internal/httpapi/oidc.go` (settings JSON, the call at sign-in and link), `oidc_avatar.go` (fetch, fit, store), `internal/auth/profile.go` (`AvatarSource`, `SetAvatar`), `internal/store/profile.go` (columns), `internal/imgfit`, `internal/oidc/oidctest` (the claim).
- `web/src/app/SsoPanel.tsx` (the switch), `web/src/lib/types.ts`, catalogs.
- `docs/self-hosting/sso.md`, `docs/settings-you.md`, `docs/api.md`, `CHANGELOG.md`.
