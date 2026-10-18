# Tasks

## 1. Header and footer

- [ ] 1.1 Add `WEBSITE_NAV` and the demo URL to `web/scripts/docs/lib.mjs` and render the new header (brand, six links with Docs current, GitHub icon link, "Try the demo") and the phone `<details>` menu in `site.mjs`; verify `cd web && npm run docs:check` and a `lib.test.mjs` case for the link order
- [ ] 1.2 Align the footer with the website's licence, security, specification and release-list links; verify the built footer of `/docs/reminders/` lists them in that order
- [ ] 1.3 Extend `scripts/e2e-docs.mjs` to open the menu at 360 px without JavaScript and to compare header link labels with `WEBSITE_NAV`; verify `make docs-site-check`

## 2. Tokens and fonts

- [ ] 2.1 Inline the generated `--ot-*` tokens into `docs.css` and turn the docs palette into aliases; remove the navy header; verify `make docs-site-check` passes axe in light and dark
- [ ] 2.2 Copy `InterVariable-latin.woff2` into the docs output with an `@font-face` rule, use a system monospace stack, and remove the Google Fonts links; verify a recorded page load in `scripts/e2e-docs.mjs` has no request to another origin for fonts or stylesheets
- [ ] 2.3 Add the external-asset rule to `web/scripts/docs/check.mjs` with a test in `check.test.mjs`; verify `cd web && npm test`

## 3. Planning references in user guides

- [ ] 3.1 Add the rule that pages with `audience: user` or `admin` must not name an OpenSpec change, with tests for a user page failing and a developer page passing; verify `cd web && npm test`
- [ ] 3.2 Remove the references from `docs/reminders.md`, `docs/e2ee.md` and `docs/caldav.md`, keeping the behaviour they describe, and regenerate in-app help; verify `make docs-check`

## 4. Integration

- [ ] 4.1 Build the site bundle (`make site-bundle`), serve it in the website with `BUNDLE_DIR=… npm run build` and run the website's `npm run check:dist`; verify the docs header links resolve and the docs look continuous with `/self-host/` in light and dark
- [ ] 4.2 Run `make check`; all pass. Add a CHANGELOG.md entry under Unreleased at archive time
