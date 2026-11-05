# Tasks

## 1. The mark in the brand source

- [x] 1.1 In `web/src/ui/icons/Brand.test.tsx`, first make the mono test assert the new contract: the tray path (`M6 11.5 4.5 13…`) uses `stroke="currentColor"`, the tick path (`m8 8 4 4 7.5-7.5`) uses `var(--ot-accent-text`, and the colour symbol draws the tray in `#ffffff` and the tick in `#34d399` at `translate(8 8) scale(2)`. Verify it fails against today's `brand.svg` (`cd web && npx vitest run src/ui/icons/Brand.test.tsx`).
- [x] 1.2 Replace both symbols in `web/src/ui/icons/brand.svg` with the D1/D2 geometry and colours, and update the comment to describe the tray mark. Verify that 1.1 passes and that the source stays under 2 KB (the existing size test).
- [x] 1.3 Update the `BrandMark` prop comment in `web/src/ui/icons/Brand.tsx` and the 16 px gate comment in `Brand.stories.tsx` (tray and tick, lips clear of the tick). Verify with `cd web && npm test -- src/ui/icons` and `npm run build`.

## 2. Every generated file, including the native shells

- [x] 2.1 In `scripts/brand-icons.test.mjs`, add tests first:
  - the iOS output exists at 1024 px, its PNG colour type is 2 (no alpha), and its corner pixel is the slate colour;
  - each Android output contains the tray and tick path data exactly as read from `brand.svg`, the notification icon uses only `#FFFFFFFF` strokes and no fill, and `ic_launcher.xml` is an `<adaptive-icon>` with background, foreground and monochrome layers.

  Verify they fail (`node --test scripts/brand-icons.test.mjs`).
- [x] 2.2 In `scripts/brand-icons.mjs`:
  - add the `opaque` option and the iOS `AppIcon.png` output (D3), with the RGB re-encoder if Chromium writes RGBA;
  - add the five Android vector-drawable text outputs (D4), generated from the symbol's path strings.

  Verify with `node --test scripts/brand-icons.test.mjs` after the next task.
- [x] 2.3 Run `make brand-icons` (it needs Playwright's Chromium; `CHROMIUM_PATH` can point at one). It regenerates the favicon, the PWA and Apple icons, the extension icons, the deploy-template logos and upstream copies, the iOS icon, the five Android drawables and the stamp. Verify that `node --test scripts/brand-icons.test.mjs` passes, then open the 16, 48, 128 and 512 px PNGs and the iOS icon and check the lips are clear of the tick.
- [x] 2.4 Raise the extension's version in `extension/manifest.src.json` (0.6.2 → 0.6.3), as `share-capture` "Extension icon" requires. Verify with `make test-extension`.
- [x] 2.5 Build the Android shell (`make android`, if a JDK and the Android SDK are available; otherwise CI's Android job). Verify that the adaptive icon resolves and lint reports no icon error.
- [x] 2.6 Regenerate the site bundle's `brand/` folder, and update its README text in `scripts/site-bundle.mjs` (the mono mark: the tray in `currentColor`, the tick in the accent). Verify with `node --test scripts/site-bundle.test.mjs`.

## 3. Documentation

- [x] 3.1 Rewrite the Brand section of `docs/design-system.md`: the tray geometry and the gap from D1, the variants from D2, and the native outputs. Also change the illustrations paragraph from "the brand mark's open loop" to "the illustrations' open loop". Verify that `make docs` and `make docs-check` pass.

## 4. Baselines and integration

- [x] 4.1 After the branch is pushed (ask the owner first), run the `UI baselines` workflow. Download the baselines and commit the changed images under `web/src/ui/__screenshots__/` after inspecting each one: the Brand story, the sidebar header, the sign-in and setup cards, the assistant welcome. Verify that no illustration baseline changed (`git diff --stat -- web/src/ui/__screenshots__ | grep -i illustration` is empty) and that CI's UI check passes.
- [x] 4.2 Run `make check` and `make openspec-validate`. Verify both pass; report any known local-only failure as such, with its output.
