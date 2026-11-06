# Tasks

## 1. The generator

- [x] 1.1 Extend `scripts/brand-icons.test.mjs` first: the Runtipi logos are JPEG outputs, the add-on's icon is 128 × 128 and its logo 250 × 100, the Claude plugin's icon 192 × 192, the Play feature graphic 1024 × 500 RGB; a stray icon or logo under the app and deploy folders fails. Verify they fail.
- [x] 1.2 Add the outputs, `jpeg`, `opaque` pages, `bannerPage` and the feature graphic (D1, D2), and run `make brand-icons`. Verify the test passes, that a `deploy/zz/logo.png` makes the guard fail, and look at each new file.

## 2. The docs pages' social card

- [x] 2.1 Point `og:image` in `web/scripts/docs/site.mjs` at the kit's default card with its size (D4), with a test in `scripts/site-bundle.test.mjs` that the bundle ships the named file. Verify with `node --test scripts/site-bundle.test.mjs`.

## 3. Screenshots

- [x] 3.1 Capture the user guide's, the website's and the README's screenshots again with their scripts, re-cut the CasaOS, Cosmos and Easypanel screenshots with the recipe in `deploy/casaos/README.md`, and remove the unused `docs/screenshots/social-preview.png`. Verify the sidebar shows the tray mark.

## 4. Docs and checks

- [x] 4.1 Update `docs/design-system.md`, `deploy/runtipi/README.md` and `deploy/homeassistant/README.md`. Run `make docs-check`, `make repo-check`, `make deploy-check` and `make openspec-validate`.
