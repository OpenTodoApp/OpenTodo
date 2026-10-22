# Tasks

## 1. Server

- [x] 1.1 `internal/imgfit` (`Square`, `Scale`, `Pad`, `Flatten`); verify `TestSquareCropsAndScales`, `TestPadAndFlatten` in `go test ./internal/imgfit/...` — done
- [x] 1.2 `Claims.Picture`; `Config.SyncPictures` with `oidc.sync_pictures`, `Update.SyncPictures`, the settings JSON and `PUT` field; verify `TestOIDCProviderPicture` (the switch reads false by default) — done
- [x] 1.3 Provenance: `store.migrateProfileColumns`, `auth.AvatarSource`, `auth.SetAvatar` (uploads record `upload`; removal keeps the provider address); verify `TestOIDCProviderPicture` and the existing `TestProfilePicture` — done
- [x] 1.4 `syncProviderPicture` at sign-in and at link (fetch through `internal/outbound`, 5 s, 2 MB, PNG/JPEG/GIF, fit, JPEG, store, notify); verify `TestOIDCProviderPicture`: off by default, on → one fetch and a 256×256 JPEG, same address not fetched twice, a broken address leaves picture and sign-in alone, a new address is fetched, a removed picture is not fetched again, an uploaded picture is never replaced, linking syncs too — done

## 2. Client

- [x] 2.1 The **Use profile pictures from {name}** switch in `SsoPanel` with `syncPictures` in `OidcSettings`/`OidcSettingsInput`; translations in the five catalogs; verify `npm test -- SsoPanel` and `make i18n-check` — done

## 3. Documentation

- [x] 3.1 `docs/self-hosting/sso.md` (the switch, what is fetched, the rules), `docs/settings-you.md` (Profile: the provider's picture), `docs/api.md` (`syncPictures`), `CHANGELOG.md` Added entry; verify `make docs-check` — done
