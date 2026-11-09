# Design: brand-kit

## Context

See proposal.md. `scripts/brand-icons.mjs` already renders every brand output from `web/src/ui/icons/brand.svg` in Playwright's Chromium, with no image dependency, and records SHA-256 hashes in `brand-icons.json`, which `scripts/brand-icons.test.mjs` checks without a browser. The repository has no root `package.json`: scripts use Node's standard library, plus Playwright where they render.

## Decisions

### D1. The wordmark as a checked-in source

`web/src/ui/icons/wordmark.svg` holds "OpenTodo" as one outlined path: Inter 4.0 SemiBold at 24 units, baseline 18, `viewBox="0 0 123 24"`. That is the same 24-unit height as the mark, so a lockup places both on one grid. It was produced once with opentype.js from Inter's SemiBold, and carries the project's licence note and Inter's (SIL OFL 1.1).

Like `brand.svg`, it is a source: the script reads it and never writes it.

Alternatives considered:
- A font library as a dependency of the brand script: the repository has no root `package.json`, and a font parser for one word is a poor trade.
- Live text in the lockup SVGs: they then look wrong wherever Inter isn't installed, which defeats a kit.

### D2. Kit outputs in the same pipeline

The kit's files are ordinary entries in `OUTPUTS`, hashed in the stamp:
- **SVGs** are text written from the two sources.
- **PNGs** are Chromium screenshots with a transparent background (`omitBackground`), except the icons, avatar and social images, which have their own.
- **The social images** set the tagline "A to-do app that runs on your own server." (the README's) in the app's bundled `InterVariable-latin.woff2`, loaded into the page as a data URL, so the render is the same on every machine. They are PNG only, because that is the only form those images are uploaded in.
- **`brand/README.md`** is written by the script too.

The test also checks that the files under `brand/` are exactly the kit's outputs, so a hand-added file fails.

### D3. Colours

The kit uses the brand colours, not the theme accent:
- mark on light: slate `#0f172a` tray, emerald `#047857` tick;
- mark on dark: white tray, emerald `#34d399` tick;
- colour icon: as `brand.svg`;
- one-colour versions: pure black and pure white.

Contrast: the light mark's tick is 5.5:1 on white, and every other pairing is higher.

## Risks / Trade-offs

- [About 450 KB of PNGs in the repository, and each future mark change rewrites them] → This was accepted by the owner. The files are small and change rarely.
- [Chromium's text rendering of the tagline can differ by a pixel between Chromium versions] → The stamp pins the committed render. Rerunning the script after a Playwright upgrade may rewrite the two social PNGs, which is expected. The test checks hashes against the stamp, never against a fresh render.

## Size

The app's bundle, the binary and the container image are unchanged: `brand/` is neither built nor embedded. The repository grows by about 450 KB.
