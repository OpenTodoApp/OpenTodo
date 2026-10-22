# Tasks

## 1. Server

- [x] 1.1 `web.Brand` and `web.BrandManifest`; verify `TestBrand` in `go test ./internal/web/...` — done
- [x] 1.2 Routes, the setting, rendering with `imgfit`, serving, the page and manifest wrapper and `branding` in `auth/status`; verify `TestBranding` (unbranded pass-through, name validation and rewrite, logo refusals, every rendered size, cache headers, removal, a new version per upload, audit, anonymous access) and the policy tests in `go test ./internal/httpapi/...` — done

## 2. Client

- [x] 2.1 `lib/branding.ts` store fed from `auth/status`; `InstanceMark`, `InstanceWordmark`, `useInstanceName`, `PoweredBy`; the screens that showed the brand use them; the tab title names the instance; verify `branding.test.ts`, `pageFocus.test.tsx`, `sidebar.test.tsx` (`npm test`) — done
- [x] 2.2 `BrandingPanel` on Settings → Server with its copy, index entry and Learn more; verify `brandingSettings.test.tsx`, `settingsCardIcons.test.tsx`, `settingsSearch.test.tsx`, `settingsCopy.test.ts`; translations in the five catalogs (`make i18n-check`, `make ui-lint`) — done

## 3. Documentation

- [x] 3.1 `docs/settings-server.md` (the card), `docs/api.md` (Instance branding), `CHANGELOG.md` Added entry; verify `make docs-check` — done
