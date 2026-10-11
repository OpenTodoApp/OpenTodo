# Tasks

## 1. Source and build

- [x] 1.1 Front matter on every existing page in `docs/` (title, summary, audience, specs, screens, order); fix headings so each page has one `h1` and no skipped levels; verify `npm run docs:check` reports no front matter errors
- [x] 1.2 `web/scripts/docs/build.mjs` with `marked` (devDependency): heading ids, link rewriting, image dimensions and lazy loading, allowed inline HTML only; emits `website/docs/**`, `website/docs/search.json` and `web/src/generated/help.json`; `make docs`; verify unit tests for link rewriting and HTML allow-list (`npm test`)
- [x] 1.3 `web/scripts/docs/check.mjs` (`npm run docs:check`, added to `make check`): front matter, links and anchors, images and alt text, spec coverage, help screen ids, keyboard guide in sync, generated files up to date; verify each failure case with a fixture test

## 2. User guide

- [x] 2.1 Move the shortcut rows to `web/src/lib/shortcuts.ts`; `ShortcutHelp` renders from it; the build writes the keyboard guide from it; verify the overlay tests and the docs check
- [x] 2.2 `scripts/docs-screenshots.mjs` and a manifest: seeded demo data, light and dark WebP at fixed sizes into `docs/images/`; `make docs-screenshots`; verify it produces every image the guides reference
- [x] 2.3 Write the user guides: getting started, tasks and projects, views, sections and boards, labels and filters (link the existing filter reference), recurring tasks and reminders, time blocking, sharing and comments, notifications, offline and sync, installing the app (iOS, Android, desktop), keyboard, account security, import and export, trash and history, settings, troubleshooting and FAQ; verify the spec coverage check passes and a reviewer can follow Getting started on the demo

## 3. Website

- [x] 3.1 Docs layout in `website/docs/`: header shared with the site, sidebar by audience, on-this-page list, version label, Edit on GitHub, `docs.css`; phone first; readable without JavaScript; "Docs" in the site navigation; verify in a browser at 360 and 1280 px with JavaScript off
- [x] 3.2 Search: `website/docs/search.js` (~2 KB scorer shared with the app), loaded on first focus, results in a live region; analytics counts use but never the text; verify a Playwright test searching "recurring"

## 4. In the app

- [x] 4.1 Help view: lazy `help.json` chunk, precached by the service worker, guide list, guide page with on-this-page, search, internal links in app and admin/developer links to the website; sidebar and Settings entries, link in the `?` overlay, `g` then `?`, `:help <topic>`; verify tests for routing, search and offline load (`npm test`, `npm run build`, check the main chunk size is unchanged)
- [x] 4.2 Contextual Help links in settings panels, share dialog, filter view, quick add and import, opening the section in a side panel or sheet without losing input; verify a test that typed text survives opening and closing help

## 5. Accessibility and CI

- [x] 5.1 axe-core (`@axe-core/playwright`, devDependency) in the layout job over sample docs pages and the Help view at 390 and 1280 px, light and dark; fails on serious or critical issues; verify the CI job is green and fails on a deliberately broken fixture
- [x] 5.2 `.gitattributes` marks generated docs; CONTRIBUTING (write docs in `docs/`, run `make docs`); ROADMAP row; CHANGELOG (Added); README links to the docs site; verify `make check`
