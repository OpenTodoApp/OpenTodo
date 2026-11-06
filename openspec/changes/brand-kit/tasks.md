# Tasks

## 1. The wordmark source

- [x] 1.1 Add `web/src/ui/icons/wordmark.svg` (D1). Extend `scripts/brand-icons.test.mjs` first: the file exists, is a single path in a `0 0 123 24` viewBox, carries the licence note and Inter's OFL note, and has no `<text>`. Verify that the test fails without the file and passes with it (`node --test scripts/brand-icons.test.mjs`).

## 2. The kit

- [x] 2.1 Extend the test first: every kit file named in the proposal is an output; `brand/` holds exactly the outputs that live under it; the lockup SVGs contain the wordmark path and the mark's paths; the PNG icon sizes match their names. Verify that it fails.
- [x] 2.2 Add the kit outputs, the social-image renders and `brand/README.md` to `scripts/brand-icons.mjs` (D2, D3), and run `make brand-icons`. Verify that `node --test scripts/brand-icons.test.mjs` passes, then open the lockups, the avatar and both social images and check them by eye.
- [x] 2.3 Update the Brand section of `docs/design-system.md` (the wordmark source and the kit). Verify with `make docs-check`.

## 3. Checks

- [x] 3.1 Run `make check` and `make openspec-validate`. Verify both pass.
