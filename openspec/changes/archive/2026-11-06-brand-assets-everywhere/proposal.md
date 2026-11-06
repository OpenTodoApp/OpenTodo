# Proposal: brand-assets-everywhere

## Why

The tray mark (brand-mark-tray) and the brand kit (brand-kit) reach the app's icons, the extension, the native shells and most deploy catalogues, but an audit for release 0.23.0 found the old marks still shipping:

- Runtipi's `logo.jpg` (both copies) is the plain tick from before sidebar-v2.
- The Home Assistant add-on's `icon.png` and `logo.png`, and the Claude plugin's `icon.png`, are the open-loop mark of sidebar-v2. The add-on's logo is square, where Home Assistant asks for about 250 × 100.
- The docs pages point their social image at `open-todo.app/assets/og.png`, a file the website removed (brand-from-bundle), so shared docs links have no card.
- The product screenshots (the user guide's `docs/images/`, the website's `docs/screenshots/site/`, the README's PNGs and demo GIF, and the store screenshots made from them) show the open-loop mark in the sidebar.
- `docs/screenshots/social-preview.png`, referenced nowhere, shows the plain tick.
- Google Play's listing needs a 1024 × 500 feature graphic, which the kit does not have.

Nothing stops the next hand-made icon either: the test only checks files the script lists.

## What Changes

- `scripts/brand-icons.mjs` also writes Runtipi's 512 px JPEG logo, the add-on's 128 px icon and a 250 × 100 logo (the lockup on the slate rounded rectangle, readable in light and dark themes), the Claude plugin's 192 px icon, and `brand/png/play-feature-graphic-1024x500.png` (opaque, as Play requires).
- A test fails on any file named like an icon or a logo under `web/public`, `extension`, `obsidian`, `mobile`, `deploy` or `docs/screenshots` that the script does not write.
- The docs pages' `og:image` is the kit's `og-default-1200x630.png`, served by the website from the bundle at `/brand/kit/png/`. A site-bundle test checks that the bundle ships the file it names.
- The screenshots are captured again with their scripts (`make docs-screenshots`, `scripts/screenshots.mjs`, `scripts/demo-gif.mjs`) and the store screenshots re-cut with their documented recipe; the stray social preview is removed.

## Out of scope

- Files outside this repository that need the owner's accounts (organisation avatar, social preview setting, Discord, Buy Me a Coffee, Play listing, X) and the stores' own copies (TrueNAS media, the CasaOS, Cosmos, CapRover, Umbrel and other upstream repositories): they are listed for the owner.
- The app's in-app mark, which already renders brand.svg.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: a new requirement, "Brand assets outside the app".

## Impact

`scripts/brand-icons.mjs`, `scripts/brand-kit.mjs`, their test, `web/src/ui/icons/brand-icons.json`, `web/scripts/docs/site.mjs`, `scripts/site-bundle.test.mjs`, the regenerated files under `deploy/`, `brand/`, `docs/images/`, `docs/screenshots/`, and the docs that describe them. No change to the app's bundle, binary or image.
