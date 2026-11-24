# Tasks

## 1. Setting and viewport

- [x] 1.1 A device-local stored value (`web/src/lib/touchZoom.ts`, default on, never synced), a viewport applier that writes `<meta name="viewport">`, and a hook that keeps the viewport in step with the setting, mounted in `App`. Verified: `web/src/lib/touchZoom.test.ts`.
- [x] 1.2 The Appearance toggle **Allow pinch zoom**, on by default, shown only on a touch device, with its settings copy and search. Verified: `appearance.test.tsx`, `settingsCopy.test.ts`.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Added/allow-pinch-zoom.md`.
- [x] 2.2 Docs: the apps' touch sections name the setting (`docs/ios-app.md`, `docs/android-app.md`).

## 3. Confirm on a device (post-merge, before archive)

- [ ] 3.1 On a real iPhone and Android, turning the switch off stops pinch zoom and a field still never zooms on focus; the switch is absent on desktop. Then archive the change.

---

Shipped in 1.6.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
