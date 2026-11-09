# Proposal: bundle-brand-kit

## Why

The website is getting a press kit page, starting with the brand assets. The website may only show what the pinned release bundle carries, and the bundle's `brand/` folder has only the mark's source, two variants, a text wordmark and one 512 px icon. The full kit (`brand/` in this repository, change `brand-kit`) has to travel in the bundle for the page to offer it.

## What Changes

- The site bundle's `brand/` folder gains `kit/`: every file of the repository's brand kit (`README.md`, `svg/`, `png/`), byte for byte.
- The existing `brand/` files and their names don't change, so the website keeps working while it is pinned to an older release.
- The bundle README's table names `brand/kit/`.

Not **BREAKING**: an addition to the bundle layout.

## Out of scope

- The press kit page itself (website change `press-kit`).
- Changes to the kit's contents.

ROADMAP: no new item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-bundle`: "Brand assets in the bundle" adds `brand/kit/`.

## Impact

`scripts/site-bundle.mjs` and its test. The bundle grows by about 430 KB, about 4 percent of today's 10.6 MB.
