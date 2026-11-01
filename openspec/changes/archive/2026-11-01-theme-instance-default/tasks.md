# Tasks: theme-instance-default

Depends on `theme-engine`; the file import and the custom themes of `theme-editor`.

## 1. Server

- [x] 1.1 Add the settings `themes.default` and `themes.instance` (design D1) with `MaxInstanceThemes = 20`, validation by `internal/themes.Validate`, kind checks of the default, fresh ids on add; verify `go test ./internal/settings/...`
- [x] 1.2 Register the four routes of design D2 through `routes.handle` with their policies (`signedIn`; `ownerOnly(...).DemoDenied()`), add the write routes to the demo deny list, and record `settings.changed` with ids only; verify `go test ./internal/httpapi/...` with cases for the owner, a member (403), anonymous (401), the demo instance, `invalid_input`, `too_large`, `limit_reached`, `not_found`, removing a default clearing it, and `policy_test.go` and the demo test passing
- [x] 1.3 Add `themes: {version}` to `GET /api/v1/auth/status`, the version growing on every change; verify the auth status test
- [x] 1.4 Document the routes in `docs/api.md`; verify the docs check

## 2. Device

- [x] 2.1 Fetch and cache the instance themes (`ot.instanceThemes`) after sign-in and when the reported version changes, in `web/src/lib/api.ts` and `web/src/lib/theme/instance.ts`; verify `instanceThemes.test.ts` (offline use of the cache, refetch on a newer version, no fetch on the same version)
- [x] 2.2 Resolve `""` through the instance default (else OpenTodo's) and `instance:<id>` through the cache, and cache the resolution for the first frame; verify `appearance.test.ts` and `appearanceBoot.test.ts` (offline start in the house theme)
- [x] 2.3 Show "From this server" in the Light and Dark lists, the "Server default" mark and "Default (Server default: <name>)", choosing and customising instance themes but not editing them; verify `appearance.test.tsx`

## 3. Owner's controls

- [x] 3.1 Add the default theme pickers and the server themes cards (Add from file, Offer one of my themes, Remove) to the Branding card, with contrast warnings and the confirmation for a default with warnings, read-only offline; verify `branding.test.tsx` and stories in light and dark at 375 and 1280 px with `make ui-check`
- [x] 3.2 Add the strings (Default theme, Server themes, From this server, Server default, Default (Server default: {name}), Add from file, Offer one of my themes, the confirmation, the limit message) to the six catalogs; verify `node scripts/i18n-check.mjs`

## 4. Docs and integration

- [x] 4.1 Document the instance default and instance themes in `docs/themes.md` and `docs/settings-server.md`; verify `make docs` and the docs check
- [x] 4.2 Report the bundle impact with `node scripts/bundle-budget.mjs` (under 0.5 KB on first load)
- [x] 4.3 Run `make check` before marking the change done; add a CHANGELOG.md entry under Unreleased at archive time
