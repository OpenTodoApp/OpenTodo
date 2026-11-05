# Design: brand-mark-tray

## Context

See proposal.md for the motivation. Today:
- `web/src/ui/icons/brand.svg` holds two symbols, `mono` (24-unit viewBox) and `colour` (64-unit viewBox, the 24-unit drawing at `translate(8 6) scale(2)` on a slate square with `rx="14"`).
- `BrandMark` inlines either symbol. `scripts/brand-icons.mjs` writes every output listed in `OUTPUTS`: an SVG from `colourSvg()`, or a PNG screenshot in the Chromium that Playwright brings. It records hashes in `web/src/ui/icons/brand-icons.json`, and `scripts/brand-icons.test.mjs` checks them without a browser.
- `scripts/site-bundle.mjs` copies the source and both variants into the bundle's `brand/` folder.
- Two native files sit outside that pipeline. The iOS `AppIcon.png` is a 1024 px RGB image of the old mark, made by hand. The Android `ic_launcher.xml` is an unrelated blue square with a plain tick, used directly as `android:icon` (minSdk 26), and `ic_notification.xml` is a filled circle with a tick.

The mark was chosen from concept images and redrawn by hand. The draft and its preview sheet are in the owner's `~/Downloads/opentodo-logo/svg/` and aren't part of the repository.

## Goals / Non-Goals

**Goals:**
- One source still produces every brand file, now including the native shells' icons, so the native icons can't drift again.
- The 16 px mark keeps a visible gap between lips and tick in both variants.

**Non-Goals:**
- Changing the illustrations, the wordmark, the palette, or the icon paths.
- Refreshing `docs/images/*.webp`. The sidebar mark at 24 px appears in those screenshots. They refresh on the next `make docs-screenshots` run, which is not part of this change.

## Decisions

### D1. Geometry

The mono symbol, on the 24-unit grid with stroke 2 and round caps and joins:
- tray: `M6 11.5 4.5 13v4.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13L18 11.5`
- tick: `m8 8 4 4 7.5-7.5`

The bounding box is (4.5, 4.5)–(19.5, 19.5), centred on (12, 12). The shortest centre-line distance between the two strokes is 3.89 units, a visible gap of 1.89 at stroke 2. That is the same gap the plain tray had to the tick, and it is what "clear of the lips" in the spec means.

Alternatives considered:
- The concept's longer lips, `M6.5 10 4.5 12…`: they left a gap of 0.12 units, so lip and tick touched at 16 px.
- A plain tray without lips: legible, but the owner preferred the lips.

The colour symbol draws the same paths at `translate(8 8) scale(2)` with stroke 2.6. The offset moves from (8, 6) because the new drawing is centred on the grid, where the old loop sat low. That gives an 8-unit margin on every side of the 64-unit square, and the mark stays inside the maskable safe zone (the central 80 percent).

### D2. Colours

- **mono:** the tray in `currentColor` and the tick in `var(--ot-accent-text,#047857)`. This keeps the existing `Brand.test.tsx` contract ("text colour plus one accent stroke"), and the tick, the "done" part, is what carries the accent.
- **colour:** a white tray (`#ffffff`) and an emerald tick (`#34d399`) on slate `#0f172a`. White on slate is about 17:1 and emerald on slate about 10:1, both far above the 3:1 the spec asks for.

Alternative considered: an all-emerald colour mark. The two tones make the tick read as a separate part at small sizes, as the chosen concept showed.

### D3. iOS app icon from the script

New `OUTPUTS` entry: `{ path: 'mobile/ios/OpenTodo/Assets.xcassets/AppIcon.appiconset/AppIcon.png', size: 1024, full: true, opaque: true }`.

`opaque` renders without `omitBackground`, on the slate colour, so no pixel is transparent. The App Store rejects icons with an alpha channel, so the test also asserts the PNG's colour type is 2 (RGB, no alpha). If Chromium's screenshot is RGBA, the script re-encodes it as RGB with `node:zlib`: it inflates the IDAT data, drops every fourth byte per pixel per row (filter type 0), deflates it and writes new CRCs. That is standard library only, about 40 lines.

Alternatives considered:
- Exporting the icon by hand: the spec forbids it.
- `sharp`: a new dependency for one file.

### D4. Android icons from the script

The brand script gains text outputs that write vector drawables from the same path strings it reads from `brand.svg`. Android's `pathData` accepts SVG path syntax, arcs included. The files:
- `drawable/ic_launcher.xml` becomes an `<adaptive-icon>` with `background` = `drawable/ic_launcher_background.xml`, `foreground` = `drawable/ic_launcher_foreground.xml` and `monochrome` = `drawable/ic_launcher_monochrome.xml`, for themed icons on Android 13+. With minSdk 26 every device supports adaptive icons, so no legacy bitmap is needed and the manifest keeps `@drawable/ic_launcher`.
- `ic_launcher_background.xml`: the slate square, 108 dp.
- `ic_launcher_foreground.xml`: the colour strokes (white tray, emerald tick) in a `<group>` that scales the 24-unit drawing into the 66 dp safe zone of the 108 dp canvas. That is a scale of 2.75 and a translation of 21 dp, so the drawing with its strokes (about 17 units) stays inside the safe circle. The stroke is 2.6 in the group's units, like the colour icon.
- `ic_launcher_monochrome.xml`: the same group with both strokes in `#FFFFFFFF`.
- `ic_notification.xml`: 24 dp, both strokes `#FFFFFFFF` at stroke 2, transparent background. That is a silhouette, as Android requires for status-bar icons.

All five go into the stamp. The test also checks that each one contains the tray's and the tick's path data exactly as in `brand.svg`, so a hand edit or a stale copy fails without a browser.

Alternatives considered:
- Drawing the drawables by hand: that is how the launcher drifted to a blue square.
- Keeping a plain non-adaptive drawable: modern launchers shrink it into a white circle.

### D5. Illustrations decoupled

The design-system "Illustrations" requirement now names the open loop as the illustrations' own motif. No file under `web/src/ui/illustrations/` changes, and their Storybook baselines must stay byte-identical. That is the check for the spec's "Unchanged by the brand mark" scenario.

### D6. Interface budget

The mark keeps its size (24 px in the sidebar, 32 px on the sign-in card). No chrome row, task property, sidebar destination, scroll region or shortcut changes, so the budget in `docs/interface-guide.md` is unaffected.

### D7. Data model, size, memory

- **Data model:** no impact. No op, field, route or environment variable changes.
- **Size:** `brand.svg` stays about 950 bytes, under the 2 KB limit. The PNGs keep their pixel sizes. The web app's first-load bundle grows by a few bytes at most (the inlined symbols), well inside `web/bundle-budget.json`.
- **Binary and image:** unchanged. No dependency is added.

## Risks / Trade-offs

- [Many Storybook baselines change at once (the Brand story, the sidebar header, the sign-in and setup cards, the assistant welcome)] → Regenerate them with the `UI baselines` workflow, then inspect every changed image before committing it. An illustration baseline that changes means D5 was broken.
- [The tray reads as "inbox", and the old loop rhymed with the Open Loops method] → This was accepted by the owner. The illustrations keep the loop, so the method's visual language stays in the app.
- [Chromium's PNG encoder output for the iOS icon is not known in advance (RGB or RGBA)] → D3's re-encoder handles both, and the colour-type test pins the result.
- [Installed PWAs and extensions keep the old icon until the platform refreshes it] → This is unavoidable and already accepted by the `web-app` "Installed icon updates" scenario. The paths are unchanged, so no reinstall is needed.
- [The deploy catalogues upstream still show the old logo] → The regenerated upstream copies are ready in `deploy/*/upstream/`. Submitting them is a manual follow-up after release.

## Migration Plan

Ship with the next release; nothing to migrate. Rollback is a revert of the commit and a rerun of the brand script.
