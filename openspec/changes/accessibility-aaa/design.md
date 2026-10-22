# Design

## Context

See proposal.md for why. What is in place today (measured from `web/src/index.css` with the token resolver, light / dark):

| Pair | Light | Dark | AAA text minimum |
| --- | --- | --- | --- |
| text on canvas / surface | 15.8 / 16.5 | 16.5 / 15.0 | 7:1 |
| muted on canvas / surface | 6.5 / 6.8 | 8.3 / 7.5 | 7:1 |
| faint on canvas / surface | 5.3 / 5.5 | 6.6 / 6.0 | 7:1 |
| on-accent (white) on the emerald accent | 5.5 | 5.5 | 7:1 |
| input border on surface (non-text) | 3.6 | 4.4 | 3:1 |

The high-contrast override (`data-contrast="high"`) already exists at 7:1 for every text pair and is only reachable from a display route's URL options. The no-motion attribute exists the same way. The UI check (`scripts/ui-check/a11y.mjs`) runs axe with the A and AA tags and a focus-ring pass over the core-screen stories with a shrinking exemption list (`scripts/ux-audit/focus-exempt.json`). Buttons are 32 / 40 / 48 px tall (`.ui-btn--sm/md/lg`); rows in the compact density are closer than 44 px. Body type is 15 px on a 22 px line (1.47). The site bundle's `tokens.css` carries the light and dark blocks only.

Constraints: no new dependency; colours stay OKLCH tokens checked by the token lint; the look of every story baseline must not change except where this design says so; the interface budget (two rows of chrome above the first row, six sidebar destinations, seven properties, three scroll regions) is untouched; preferences are additive op-log fields.

## Goals / Non-Goals

**Goals:**
- One place that decides and records every AAA trade-off, so the claim "AAA where it keeps the look" is checkable, not a slogan.
- Reach AAA by default wherever a story baseline cannot tell the difference.
- Make the two presentations that give full AAA (high contrast, no motion) a one-switch personal preference that syncs.
- Extend the existing gates (token contrast, story audit, focus pass, docs audit) rather than adding a new tool.

**Non-Goals:**
- Changing the accent colours, the palette hues or the row density by default.
- A text-size preference, media criteria, pronunciation, or a reading-level score (see proposal, out of scope).
- Making the register a runtime feature: it is a build-time file that never ships to the browser.

## Decisions

**D1. The register is one JSON file, consumed by three checks.** `web/src/ui/a11y/exceptions.json`: an array of `{ id, criterion, where, pairs?: [{fg, bg, min}], measured?: {light, dark}, reason, route }`. Consumers: `contrast.test.ts` (a text pair may have `min` below 7 only if an entry lists it), `scripts/ui-check/a11y.mjs` (an axe `color-contrast-enhanced` node passes only if its resolved foreground and background colours are within ΔE 2 of a registered pair's resolved values in that theme), and a repository check (`scripts/repo-checks`, run by `make check`) that every `id` appears as a `<!-- exception: id -->` marker in `docs/accessibility.md` and every marker has an entry. Alternative considered: comments in `pairs.ts` and prose in the doc — not checkable, drifts. Initial entries: `faint-tone` (1.4.6; faint on surfaces, 5.3:1 light; keeps three text tones; route: contrast `high`), `accent-label` (1.4.6; on-accent on accent and accent-hover, 5.5:1; the brand emerald; route: contrast `high`), `compact-density` (2.5.5; rows closer than 44 px by choice; route: comfortable density).

**D2. Text tones.** Muted moves from `oklch(0.47 …)` to about `oklch(0.455 …)` in light, the smallest lightness that gives 7:1 on the canvas and the surface; dark muted is already above 7:1. Faint stays a third step: at 7:1 it would be the same lightness as muted and the hierarchy of the rows (title, metadata, hint) would collapse into two tones, which changes the look, so it is registered. The test gains a tone-distance assertion (ΔL ≥ 0.04 between text, muted and faint) so a future retune cannot merge them silently. Pairs in `pairs.ts` get `min: 7` for `kind: 'text'` and `'chip'` by default; a pair may carry a lower `min` only with an `exception` id, checked against the register. The twelve chip pairs are measured at 7:1; a hue that cannot reach it with its soft step inside the gamut is a register entry (expected: yellow and lime in light; the measurement decides, not this document).

**D3. High contrast and no motion as preferences.** Two additive `user_prefs` strings in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`: `contrast` (`auto` | `high`) and `motion` (`system` | `none`). The pre-paint script that sets `data-theme` from the local copy (appearance-preferences "No flash of the wrong appearance") also sets `data-contrast` and `data-motion`; `auto` sets `data-contrast="high"` when `matchMedia('(prefers-contrast: more)')` matches and listens for changes. The display routes keep writing the same attributes from their URL options, which win while a display route is shown (`displayHooks.ts` already removes them on leave). Alternative: a media query only (`@media (prefers-contrast: more)` in CSS) — gives no per-account choice and would not sync; kept as the `auto` behaviour. Convergence: last writer wins like `theme_accent`. An older server refuses the unknown fields; the upgrade note tells operators to upgrade the server first, as for `haptics`.

**D4. Hit areas without a visual change.** A component class `.ui-hit` (applied by the Button primitive to `sm` and `md` and to icon buttons, and to row controls, chips with actions and the check box) adds `position: relative` and an `::after` pseudo-element with `inset: min(0px, calc((100% - 44px) / 2))` on each axis, so the hit area grows to 44 px only where the box is smaller. Pseudo-elements are hit-tested as their element, so no handler changes. Overlaps between neighbours are decided by paint order; inside a row the row's own target already covers the gap, so a tap between two chips opens the row, which is what happens today. The check in `a11y.mjs` focuses each interactive element of the core-screen stories in the comfortable density, takes its centre, and calls `elementFromPoint` 22 px up, down, left and right; a point whose topmost element is not the element or inside it is a failure, unless listed in `scripts/ux-audit/target-exempt.json` (first-run list, only shrinks, reason line like the focus list). Compact density is registered, and the pseudo-element still applies where it does not overlap. Alternative: making `md` 44 px tall — changes every row and header baseline, rejected by the premise.

**D5. Focus never obscured.** The existing focus pass gains, per focused element, a viewport containment check and an `elementsFromPoint` check at the four corners and the centre; the topmost hit must be the element, a descendant, or an element with `data-opened-by` pointing to it (tooltips and menus the control opened). Fixes expected from the first run: `scroll-padding-bottom` on the phone list equal to the tab bar plus the add button's footprint (the `--add-room` variable exists), `scroll-padding-top` for the sticky page header, and the toast column taking `--toast-lift` into account. Exemption list `focus-obscured-exempt.json`, same rules as the focus list.

**D6. Reading blocks only in prose.** The `prose` component class (notes, descriptions, comments, project notes, Help) sets `line-height: 1.5`, paragraph margin `1.5em × 1.5`, `max-inline-size: 80ch` for its paragraphs and `text-align: start`; the token lint refuses `text-justify` and `text-align: justify` in screens. Rows, chips and controls keep `text-body`'s 22 px line. Stylesheet tests assert the computed values. No baseline changes outside the stories that show prose; those are updated once.

**D7. Location in the lead line.** Nested projects and task pages already have a lead line under the title (page-rhythm). It becomes a trail: ancestors as links separated by "›", current page not repeated, wrapped as a `<nav aria-label="You are here">` so it is a landmark. No new row. Sections inside a project are not pages and get no trail.

**D8. Link-text lint.** A rule in the web lint (`web/eslint` custom rules, where the `aria-label` on `span` rule lives) flags a `Link` or `<a>` whose only text child is one of the bare phrases (case-insensitive, after translation call unwrapping of `t('…')` literals). The settings "Learn more" pattern already includes the subject in the line, so it passes.

**D9. Authentication.** Audit the sign-in, second-factor, recovery-code and confirm-recent forms: no `onPaste` prevention (a test fakes a paste event), `autocomplete="current-password"`, `"new-password"`, `"one-time-code"`, `"username"`; the passkey button present wherever a password or code is asked (passkey-auth already offers it on sign-in; the second-factor step gains it when the account has a passkey). No server change.

**D10. No time limits.** Nothing to build: toasts offer Undo, which stays available in Trash, Completed and task history; the session has no inactivity timeout. A test asserts the undo path after the toast's timer, and the statement documents session lifetime from `internal/auth`'s constant.

**D11. Glossary and reading level.** `docs/glossary.md` with one entry per term; the docs check (`web/scripts/docs`) fails on a listed abbreviation whose first use on a page is not a link to the glossary, and the docs renderer adds a trail (D7's pattern) to pages below the guide's start. `scripts/i18n-check.mjs` reports (not fails) English strings with a sentence over 25 words, so the output is a review aid; failing would block legitimate long legal texts.

**D12. AAA gate.** `TAGS` in `a11y.mjs` and in the docs audit gain `wcag2aaa`, `wcag21aaa`, `wcag22aaa`. The only AAA axe rule that fires on correct markup is `color-contrast-enhanced`; its nodes are filtered through the register (D1). Other AAA rules (for example `link-in-text-block` enhanced checks) fail as before.

**D13. Site bundle.** `tokensCss` in `scripts/site-bundle.mjs` appends the two high-contrast blocks (light and dark attribute forms) read from `index.css` with the existing `block()` helper; the bundle test asserts the selectors. Layout version of the bundle increments; the website consumes it from the next pin.

**Data model impact.** Two additive `user_prefs` fields, `contrast` and `motion`, both strings; no rename, no migration, no table.

**Size and memory.** No dependency. Shipped CSS grows by about 0.6 KB before compression (hit-area class, prose rhythm, media query). The glossary and the statement add two Markdown pages to the embedded docs (about 10 KB in the binary). The register, the exemption lists and the checks are development files. Runtime memory unchanged.

**Interface budget.** Chrome above a list's first item stays at two rows (the trail reuses the lead line). Sidebar destinations, visible task properties and scroll regions unchanged. Settings → Appearance gains two rows (Contrast, Motion) in the existing card. No new shortcut.

## Risks / Trade-offs

- [The muted retune shifts a few story baselines by a pixel-level colour difference] → The visual gate's threshold tolerates it; where it does not, baselines are updated once in the same task, after a side-by-side check that nothing else moved.
- [Hit areas overlap in dense headers and chips rows] → Paint order decides; the pass only asserts the four points at 22 px, and a legitimate overlap between two 32 px siblings (a tap exactly between them) hits the later sibling, which is today's behaviour. Compact density is registered rather than fought.
- [The first run of the two new passes lists many elements] → The lists are allowed to start long, carry a dated reason and only shrink, exactly like `focus-exempt.json`; a follow-up change empties them.
- [`prefers-contrast: more` reports true on Windows high-contrast mode where `forced-colors` already applies] → The high-contrast override and forced colours agree (pure white or black surfaces, outlines instead of tints); verified in a story under `forced-colors: active` emulation.
- [axe's `color-contrast-enhanced` cannot measure text over gradients or images] → Those nodes are "incomplete", not violations; the gate stays on violations, and the token test covers the pairs.
- [A hue's soft chip cannot reach 7:1 without a muddy text step] → It is a register entry, not a redesign; the route is high contrast, where chips are outlined.
- [Older server refuses the new fields] → Upgrade note; the device keeps its local value, as the appearance-preferences delta specifies.

## Migration Plan

Deploy as an ordinary release: server first (it accepts the two new fields), then devices. Rollback: a device from the previous version ignores unknown preference fields and shows the defaults; nothing in the database changes shape. The register can be edited without a release.

## Open Questions

- Which palette hues fall below 7:1 on their soft step in light after the measurement; the register lists whatever the test reports, with the same route.
- Whether the trail in a task page's lead line should include the section name when the task is in a section; the trail reads better without it on phones, and this can be decided in the story review without changing the spec.
