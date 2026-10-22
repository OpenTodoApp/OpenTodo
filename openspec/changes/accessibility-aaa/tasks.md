# Tasks

## 1. Register and statement

- [x] 1.1 Add `web/src/ui/a11y/exceptions.json` with the three initial entries (`faint-tone`, `accent-label`, `compact-density`: criterion, where, pairs, measured values, reason, route) and a schema test in `web/src/ui/a11y/exceptions.test.ts` that every entry has every field and every pair names tokens that exist; verify with `npm test` in web/.
- [x] 1.2 Write `docs/accessibility.md` (target, the beauty rule, one section per register entry carrying its `<!-- exception: id -->` marker and its route, what is not covered, session lifetime, how to report, review date) and link it from `docs/README.md` and the Help index; verify it renders in Help and is found by a Help search for "accessibility" (`npm run docs:check` in web/).
- [x] 1.3 Add the repository check that every register `id` has a marker in `docs/accessibility.md` and every marker has an entry, wired into `make check` beside the existing repo checks, with a test for both drift directions; verify `node --test scripts/repo-checks.test.mjs` passes and a deliberately removed marker fails the check.

## 2. Text contrast at 7:1

- [x] 2.1 Retune the light muted token to the smallest lightness that gives 7:1 on canvas and surface, keep ΔL ≥ 0.04 to faint and to text, and add the tone-distance assertion to `contrast.test.ts`; verify `npm test` and the Colours story shows the new ratios.
- [x] 2.2 Raise `min` to 7 for every `text` and `chip` pair in `pairs.ts`, add the optional `exception` id, and make the test refuse a `min` below 7 without a matching register entry; verify `npm test` fails on an unregistered lowered pair and passes with the three entries.
- [x] 2.3 Measure the twelve chip pairs at 7:1, retune the hue text steps that can reach it inside the gamut, and register the hues that cannot (with their measured values) in the register and the statement; verify `npm test` and `make ui-check` (chip stories keep their baselines or are updated once with a note in the task).
- [x] 2.4 Make the high-contrast override reach 7:1 on the on-accent label of every accent and on every palette soft step, and add those pairs to `OVERRIDE_PAIRS` at `min: 7`; verify `npm test` and the primary button story under `data-contrast="high"` in light and dark.
- [ ] 2.5 Update `docs/design-system.md` (the 7:1 rule, the register, how to lower a minimum) and refresh visual baselines only where the muted retune moved them; verify `make ui-check` passes and the diff images show only the tone change.

## 3. Contrast and motion preferences

- [x] 3.1 Add `contrast` and `motion` as additive string fields to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`, with unknown values read as the defaults; verify `go test ./...` and `npm test` (a sync test with an unknown value keeps the stored value and applies the default).
- [x] 3.2 Extend the pre-paint appearance script and the appearance hook to set `data-contrast` (from the preference, or from `prefers-contrast: more` when `auto`, listening for changes) and `data-motion`, with the display route options still winning on display routes; verify `web/src/app/appearance.test.tsx` covers first paint, a system change and a display route leaving, and `npm run build`.
- [ ] 3.3 Add the Contrast and Motion rows to `AppearanceSection.tsx` after Mode and Theme as segmented controls with their stories and strings in every language; verify `npm test`, `make i18n-check` and `make ui-check` (the settings story baseline updated once).
- [x] 3.4 Document both rows in `docs/settings-app.md`, add the upgrade note to `CHANGELOG.md` under Unreleased ("Contrast and motion preferences are two additive sync fields; upgrade the server first"), and verify `npm run docs:check`.

## 4. Pointer targets

- [x] 4.1 Add the `.ui-hit` component class (`::after` inset to 44 px) and apply it in the Button primitive for `sm`, `md` and icon buttons, the row check box, row controls and action chips; verify a unit test that the computed `::after` box is at least 44 × 44 for a 32 px button and that every story baseline is unchanged (`make ui-check`).
- [ ] 4.2 Add the target-size pass to `scripts/ui-check/a11y.mjs` (comfortable density, four points at 22 px from the centre through `elementFromPoint`) with `scripts/ux-audit/target-exempt.json` holding only the first run's elements with a dated reason, and a test in `scripts/ui-check.test.mjs` for the pass and for a shrinking-only list; verify `make ui-check` passes and a story with a bare 28 px chip fails naming it.
- [ ] 4.3 Fix the elements the first run listed where a fix keeps the look (apply `.ui-hit`, pad a chip's hit area) and remove them from the list; verify `make ui-check` with the shorter list.

## 5. Focus never obscured

- [ ] 5.1 Extend the focus pass in `a11y.mjs` with viewport containment and the `elementsFromPoint` check at the corners and centre (allowing descendants and `data-opened-by` overlays), with `scripts/ux-audit/focus-obscured-exempt.json` and its test; verify `make ui-check` and a story that focuses a row under the phone tab bar fails naming it.
- [ ] 5.2 Set `scroll-padding` on the phone list for the tab bar and the add button, on the content column for the sticky header, and lift the toast column by `--toast-lift` when a focused control is under it; verify the shell story at 375 px passes the pass and `npm test` covers the scroll padding values.
- [x] 5.3 Document the pass in `docs/interface-guide.md` (focus is never under chrome) and verify the guide's checks (`make docs-check`).

## 6. Reading blocks, location and links

- [x] 6.1 Give the `prose` class line height 1.5, paragraph spacing 1.5 × line height, `max-inline-size: 80ch` and `text-align: start`, and make the token lint refuse justified text in screens; verify a stylesheet test of the computed values, `make ui-lint` failing on a `text-align: justify` fixture, and the notes stories updated once.
- [x] 6.2 Turn the lead line of nested project pages and task pages into a trail of ancestor links inside a "You are here" navigation landmark without adding a row; verify `pageRhythm.test.tsx` asserts the trail and the chrome row count, and the project story baselines.
- [x] 6.3 Add the bare-link-text rule to the web lint beside the `aria-label` rule, fix the screens it reports, and verify `npm run lint` fails on a fixture with "Learn more" as the only link text and passes on the repository.
- [x] 6.4 Add a story check that every settings section and every group of the long pages has a heading, and verify `make ui-lint`.

## 7. Authentication and time limits

- [x] 7.1 Audit the sign-in, second-factor, recovery and confirm-recent forms for paste blocking and autocomplete hints, fix what is missing, and offer the passkey button on the second-factor step when the account has a passkey; verify tests that fake a paste event into the code field and assert the autocomplete attributes and the passkey button (`npm test`).
- [x] 7.2 Add a test that reopening from Completed and undoing from task history work after the undo toast's timer has elapsed, and verify `npm test`.
- [x] 7.3 Write the session lifetime and the "no timed actions" paragraph into `docs/accessibility.md` from the constant in `internal/auth`, with a test that the documented value matches; verify `go test ./...`.

## 8. Glossary, reading level and the AAA gates

- [x] 8.1 Write `docs/glossary.md` with every listed term, link it from Help and the statement, and make the docs check fail on a listed abbreviation whose first use on a page is not linked to the glossary; verify `npm run docs:check` fails on a fixture page and passes on the guide.
- [x] 8.2 Add the location trail to docs pages below the guide's start in the docs renderer; verify the docs check and the docs accessibility audit.
- [x] 8.3 Make `scripts/i18n-check.mjs` report English strings with a sentence over 25 words, with a test; verify `make i18n-check` prints the report and still exits zero.
- [x] 8.4 Add the AAA tags to the story audit and the docs audit and filter `color-contrast-enhanced` nodes through the register (resolved colours within ΔE 2 of a registered pair in that theme); verify `make ui-check` and the docs audit pass, and an unregistered 5:1 caption story fails naming the ratio.
- [x] 8.5 Export the high-contrast blocks in `scripts/site-bundle.mjs` `tokensCss` and bump the bundle layout version; verify `node --test scripts/site-bundle.test.mjs` asserts the selectors and fails when a block is missing.

## 9. Integration

- [ ] 9.1 Add row 9 "Accessibility to AAA where it keeps the look" (`accessibility-aaa`) to the Design refresh table in `ROADMAP.md`, the CHANGELOG entry under Unreleased, and the statement's review date; verify `make check` passes end to end.
- [ ] 9.2 Run the manual AAA walk-through on the core screens with a screen reader, keyboard only, 200 % zoom, high contrast and no motion, record the result and date in `docs/accessibility.md`, and verify every finding is either fixed in this change or a register entry.
