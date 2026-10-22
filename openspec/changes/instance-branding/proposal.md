# Proposal

## Why

Issue #234 asks for personal branding: a custom logo and favicon, with "powered by" left in the footer. People run OpenTodo for a family, a club or a company and want the tab, the installed app and the sign-in screen to carry their own name and mark rather than the project's.

## What Changes

- A new owner card **Settings → Server → Branding** with a **Name** (up to 40 characters) and a **Logo** (one square PNG or JPEG of at least 192 pixels, at most 2 MB).
- The name replaces "OpenTodo" in the browser tab title, the web app manifest (`name`, `short_name`), the sign-in and invitation cards, the share-capture screen, the sidebar's wordmark and the workspace control's label. The logo replaces the brand mark in the same places and becomes the favicon, the Apple touch icon and the installed app's icons (including a maskable one), rendered by the server in every size from the one upload and served from `/branding/` at versioned, cacheable addresses.
- The embedded web app's page and manifest are rewritten on the way out of the server for a branded instance, so the build stays one binary; an unbranded instance is byte-for-byte unchanged.
- The sign-in screen's licence line reads **Powered by OpenTodo <version> · AGPL-3.0 · no tracking, no telemetry** on a branded instance (the footer the issue asks to keep). Settings → About and the source link stay.
- `GET /api/v1/auth/status` carries `branding` for every visitor; routes `GET`/`PUT /api/v1/settings/branding`, `PUT`/`DELETE /api/v1/settings/branding/logo` (owner, refused on the demo), `GET /branding/{file}` (public). Changes are recorded as `settings.changed`.
- No new dependency: the rendering uses `internal/imgfit` (introduced by `oidc-profile-pictures`).

Out of scope: colours, fonts or a custom accent (appearance stays each person's choice); a custom app description or e-mail templates; the service worker's precached manifest (a stale copy is replaced on the next update as any asset); per-workspace branding; branding of the `ot` CLI, the Android shell's launcher icon or the documentation.

ROADMAP: a self-hosting quality item not yet listed; adds "Instance branding" under self-hosting.

## Capabilities

### New Capabilities

- `instance-branding`: the owner's name and logo, where they appear, how the logo is rendered and served, and the Powered-by line.

### Modified Capabilities

- `app-shell`: "Sidebar header row" (the instance's mark and name in place of the brand mark and "OpenTodo"), "Page changes are announced" (the tab title names the instance).

## Impact

- `internal/httpapi/branding.go` (routes, rendering, the page and manifest rewrite), `router.go`, `auth_handlers.go`, `server.go`; `internal/web/brand.go` (the rewrites), tests in both packages.
- `web/src/lib/branding.ts` (store), `web/src/app/InstanceBrand.tsx` (mark, wordmark, Powered by), `BrandingPanel.tsx` (the card), `SettingsView.tsx`, `settingsCopy.ts`, `settingsIndex.ts`, `pageFocus.tsx`, the screens that showed the brand (`AuthScreen`, `InviteScreen`, `ProjectInviteScreen`, `WorkspaceInviteScreen`, `ResetScreen`, `EmailScreens`, `ShareCapture`, `Sidebar`, `WorkspaceControl`); five catalogs.
- `docs/settings-server.md`, `docs/api.md`, `CHANGELOG.md`.
- Bundle: the store and components add under 1 KB gzipped; no new chunk. Binary: the rendering code and `imgfit`, a few KB.
