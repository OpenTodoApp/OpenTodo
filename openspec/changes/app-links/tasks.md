# Tasks

## 1. Grammar and list

- [ ] 1.1 `origin.AppLink` (Go) and `appLink` (TS), the deny list, shared vectors `internal/origin/testdata/app_links.vectors.json`.
- [ ] 1.2 `user_prefs.app_link_schemes` in `Schema` (content), regenerated outputs; Settings → **Links to other apps** with add, remove and the refusal messages.
- [ ] 1.3 Check 1.0.0's handling of a `url` origin with another scheme (`compat-older-clients`) and record it in design.md.

## 2. Rendering and opening

- [ ] 2.1 Markdown and the editor keep app links; the renderer makes them clickable against the viewer's list; tests.
- [ ] 2.2 The per-device confirmation dialog; tests.
- [ ] 2.3 Origin: validation on both sides, the chip, `ot add --origin-url`; vectors.

## 3. CalDAV and shells

- [ ] 3.1 VTODO `URL` app link → origin; fixtures.
- [ ] 3.2 Shell capability `app-links` on Android and iOS with the shared vectors.

## 4. Docs

- [ ] 4.1 docs: the setting, the deny list, what older clients show; changelog.
