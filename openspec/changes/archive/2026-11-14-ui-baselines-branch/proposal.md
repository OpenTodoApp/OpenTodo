## Why

The visual baselines of the UI check (about 3,000 PNGs, 92 MB) are committed to main, and every refresh stores a full new copy of each changed image, so the repository's history has grown by about 700 MB (#1332). Clones get slower for every contributor and fork, and the growth continues with each refresh.

## What Changes

- The baselines move to a `ui-baselines` branch holding one parentless commit that is replaced, not appended to, on every change. Main no longer carries them.
- The UI check (CI and `make ui-check`) assembles its baselines from that branch and lays the PNGs a pull request adds or changes, kept in `web/src/ui/__screenshots__`, over them.
- The UI baselines workflow folds a merged pull request's PNGs into the branch and removes them from main; run on main it regenerates every baseline and replaces the branch; run on another branch it returns only the new or changed baselines.
- The first fold creates the branch from main's PNGs, so no manual bootstrap is needed.

Out of scope: rewriting the existing history to recover the 700 MB already in it (a separate, announced step, #1332), fewer screenshots per story, Git LFS. Advances no ROADMAP.md item; it is contributor tooling.

## Capabilities

### New Capabilities

### Modified Capabilities
- `design-system`: the visual regression gate's baselines live on their own branch instead of being committed to main.

## Impact

- `.github/workflows/ci.yml` (UI check visual regression), `.github/workflows/ui-baselines.yml`, `scripts/ui-check/baselines.mjs`, `scripts/ui-check/playwright.config.ts`, `Makefile` (`ui-check`, `ui-baselines`), `.gitignore`, `docs/design-system.md`.
- No change to the app, its image or its dependencies. No new environment variable.
