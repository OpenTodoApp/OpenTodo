# Tasks

## 1. Setting

- [x] 1.1 `web/src/lib/textSize.ts`: the device-local value (Default, Large, Larger, Largest), the scale, the system scale (iOS probe, Android `textScale`, clamped) and a hook in `App` that writes `--ot-text-scale` on the root. Verified: `web/src/lib/textSize.test.tsx`.
- [x] 1.2 `public/appearance.js` applies the stored size and the system scale before the first frame. Verified: `web/src/lib/appearanceBoot.test.ts`.
- [x] 1.3 `index.css`: the root font size from `--ot-text-scale`, `-webkit-text-size-adjust: 100%`, and touch fields at `max(16px, token)`. Verified: `npm test` and `npm run build` in web/.
- [x] 1.4 Settings → Appearance **Text size** row (a select), its copy and translations. Verified: `web/src/app/appearance.test.tsx`, `settingsCopy.test.ts`, `make i18n-check`.

## 2. Shells

- [x] 2.1 Android: `textZoom = 100` and `textScale` in the page script. Verified: `BridgeFixtureTest.thePageScriptHandsTheFontScale`.

## 3. Layout

- [x] 3.1 Phone-width probes at Largest at 360 px: task rows, the tab bar, a bottom sheet and the Appearance settings keep their controls inside the viewport without overlap, and the tab names and page title are whole. Verified: `scripts/ui-check/text-size.spec.ts` in `make ui-check`.
- [x] 3.2 Media queries measure rem against the browser's size, not the root's, so the phone bar is a size container and its Process button drops to its icon from its own width in the root's rem (`@max-[21rem]`); the story Screens/Shell LargestText has a visual baseline. Verified: `text-size.spec.ts` (page title whole), `make ui-check`.

## 4. Release

- [x] 4.1 Changelog fragment `changelog.d/Added/text-size.md`; the docs name the setting (`docs/settings-you.md`, `docs/ios-app.md`, `docs/android-app.md`). Verified: `make docs-check` and `make check`.
