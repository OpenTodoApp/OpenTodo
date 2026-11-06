# Design: brand-assets-everywhere

## D1. One script, more outputs

The new files are entries in `OUTPUTS`, rendered the way the others are: a square icon at a size (`size`, `full` for edge-to-edge), or a `page` screenshotted at `width` × `height`. Two flags join `opaque`: `jpeg` writes a JPEG from Chromium's encoder (Runtipi requires `logo.jpg`), and `opaque` now also applies to pages, so the Play feature graphic has no alpha channel. No image library is added.

## D2. The Home Assistant logo

Home Assistant shows `logo.png` on the add-on page in light and dark themes and recommends about 250 × 100. The lockup on dark (white tray and wordmark, emerald tick) on the slate rounded rectangle reads on both, the same way the colour icon does. The lockup is 40 % of the height, centred.

## D3. Guarding against hand-made icons

A test walks the app and deploy folders and fails on a file whose name contains `icon`, `logo`, `favicon`, `apple-touch` or `pwa` with an image extension that is not an output. Screenshot folders of the stores are skipped (they are product screenshots, not marks); build and dependency folders too.

## D4. The docs pages' social card

The website serves the bundle's `brand/` at `/brand/` (press-kit D1), and from 0.23.0 the bundle carries `brand/kit/` (bundle-brand-kit). The docs pages name `/brand/kit/png/og-default-1200x630.png` with its size. Bundles before 0.23.0 do not have it, but their pages pointed at a missing file already.

## Size

The new rasters add about 60 KB to the repository; the screenshots are replaced in place. The app's bundle, binary and image are unchanged.
