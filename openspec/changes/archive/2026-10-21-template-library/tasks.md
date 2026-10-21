## 1. Format, parser and validation

- [x] 1.1 Extend `scripts/deploy/yaml.mjs` with what template files need (block scalars for `description`, nested lists of objects), with tests in its existing test file; verify `node --test scripts/deploy/*.test.mjs` passes
- [x] 1.2 Write `scripts/templates-check.mjs`: field rules, categories, icons against `web/src/ui/icons/catalogue.json`, declared labels, limits (200 tasks, 64 KB), personal-data patterns, unique English titles, translation keys present in the English source; tests with one fixture per error in `scripts/templates-check.test.mjs`; verify each fixture fails with the template, file and path named
- [x] 1.3 Write the compiler (`scripts/templates-build.mjs`): merge translations over English, produce `web/src/generated/templates.json` (schema version, no ids); wire it into `make docs` and `make check` like the help bundle; verify `make check` fails when the generated file is stale
- [x] 1.4 Write `templates/README.md`: the format with a complete annotated example, offsets, translations, limits, how to try a template locally (`make templates`), the curation bar, CC BY 4.0; add a pointer and a PR checklist line in `CONTRIBUTING.md` and `.github/pull_request_template.md`; verify `make docs-check` passes

## 2. Initial library

- [x] 2.1 Convert the website's ten templates into `templates/<slug>/template.yaml` with a one-off script (not committed) following design D10, choose a catalogue icon for each; verify `node scripts/templates-check.mjs` reports ten valid templates
- [x] 2.2 Add Italian overlays for the ten templates (the maintainer's language) and leave the other languages to contributors; verify the compiled file holds `it` text and falls back to English elsewhere

## 3. Instantiation

- [x] 3.1 Resolve relative offsets from the start day (months clamp to the last day) in the template code path, with unit tests for `+0d`, `+2d`, `+1w`, `+1m` from 2026-01-31; verify `npm test` in web/
- [x] 3.2 Add `web/src/app/templates/library.test.ts`: instantiate every compiled template into fake-indexeddb through the dialog's create function on start day 2026-01-05 and check projects, sections, tasks, labels and every due date; verify `npm test` in web/ and that removing a declared label from a source makes it fail
- [x] 3.3 Accept section `color` and `icon` in sources once `icons-and-section-style` is merged; until then reject them naming that change; verify with a checker fixture

## 4. The library dialog

- [x] 4.1 Load the compiled library as a lazy chunk from the template dialog and precache it in the service worker; verify `npm run build` shows a separate chunk, the main bundle size is unchanged, and the dialog lists templates offline in the e2e smoke (`make e2e`). Done: the data is `templates-*.js` (11.6 KB gzipped) and the views `TemplateLibrary-*.js` (2.4 KB), both lazy; the entry chunk is 319.5 KB gzipped against 321.3 KB on main; the smoke test starts "Trip planning" with the network off and finds its 10 tasks on the server after reconnecting
- [x] 4.2 Build the library view: search (title, summary, category, label and task names, interface language and English), category headings, cards with icon, title and summary, the match count announced; stories in Storybook (`make ui-check` passes a11y). Done: `web/src/app/templates/templateLibrary.stories.tsx` (Library, Search, NoMatch, Detail, DetailBoard), a11y gate clean in light and dark, baselines generated in the pinned Playwright image; the layout check covers the dialog and its detail (`template-detail`)
- [x] 4.3 Build the detail view: description, steps, preview with offsets ("day 3", "week 2"), counts and new labels, start day and parent, Create; **Upload a file…** keeps the existing file flow; interaction tests with happy-dom for keyboard (search focus, arrows, Enter, Escape back, Escape close) and for the preview not writing anything; verify `npm test` in web/
- [x] 4.4 Add the "New project from a template" command to the palette and translate the dialog's strings in all catalogues; verify `node scripts/i18n-check.mjs`
- [x] 4.5 Update `docs/templates.md` (the library, starting one, contributing) and regenerate help; verify `make docs-check`

## 5. Site bundle

- [x] 5.1 Write `templates/index.json` and `templates/<slug>.json` into the site bundle from the compiled library with a schema version, add the `templates` fact to the manifest, document the paths in the bundle layout; verify `node --test scripts/site-bundle.test.mjs` with a new test for the files and the fact, and that an invalid template fails the bundle build
- [x] 5.2 Note the website follow-up (read templates from the bundle, drop its copies) in `ROADMAP.md` under item 7; verify `make docs-check`

## 6. Integration

- [x] 6.1 Run `make check` and `make e2e`; start "Trip planning" from the library offline in the built app and confirm the project syncs after reconnecting. Done: `make check` passes except three web tests that fail only under full parallel load (`dashboardDrop`, `taskDetail` entity pickers) or outside UTC (`planView`), all passing on their own and in UTC; `make e2e` passes with the offline library step
