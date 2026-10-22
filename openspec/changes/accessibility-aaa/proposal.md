# Proposal

## Why

OpenTodo already meets WCAG 2.2 AA (design-system contrast and focus gates, reduced motion, keyboard-first screens, announced pages). Level AAA is where a task manager earns the trust of people who use it all day with low vision, motor impairments or cognitive load, and nobody in the subscription-app market claims it. We want AAA on one premise: **the look comes first**. Where an AAA criterion can be met without changing how the app looks, we meet it by default. Where meeting it would ruin the look (the emerald accent, the three text tones, the compact rows), the default keeps its look, the criterion is still reachable through a presentation the person chooses with one switch, and the exception is written down and measured so the claim stays honest.

## What Changes

- **A conformance rule and an exceptions register.** A new `accessibility` capability states the target (WCAG 2.2 AAA), the beauty rule, and the register of deliberate exceptions: each names the criterion, where it applies, the measured value, why the default keeps its look, and the AAA route. The register is one file in the repository; the accessibility statement in the user guide (`docs/accessibility.md`, also shown in Help) lists the same entries, and a check fails when they drift. Today the register holds three entries: the faint text tone (5.3:1 in light), the on-accent label of the emerald primary button (5.5:1), and pointer targets in the compact density.
- **Text contrast to 7:1 where it keeps the look.** The muted tone moves from 6.5:1 to 7:1 in light (a change in OKLCH lightness of about 0.02, invisible in use); every other text pair is already above 7:1. The faint tone stays a distinct third step and is registered. The token contrast check gains an AAA minimum of 7:1 for text pairs, with the register as the only way to keep a lower minimum. The high-contrast presentation reaches 7:1 on every text pair including the on-accent label.
- **High contrast and no motion become personal preferences**, not only display-mode options: `contrast` (`auto`, which follows the system's "more contrast" setting, or `high`) and `motion` (`system` or `none`), synced like the theme, applied before first paint. This is how a person gets AAA contrast on the whole app with one switch when the default's registered exceptions are not enough for them.
- **Pointer targets of 44 × 44 CSS px** (2.5.5 enhanced) through an invisible hit area around small and medium buttons, row controls and chips, so nothing changes visually. An automated pass in the UI check measures the hit area of every interactive element of the core-screen stories; the compact density is the registered exception.
- **Focus never obscured** (2.4.12 enhanced): the focus pass of the UI check also fails when a focused element is partly outside the viewport or under the phone tab bar, the add button or a toast.
- **Reading blocks** (1.4.8): notes, descriptions, project notes and Help get a line height of 1.5, paragraph spacing of 1.5 times that and a measure of at most 80 characters; rows are untouched. Text is never justified.
- **Location, link purpose and headings** (2.4.8, 2.4.9, 2.4.10): the lead line under a nested project's or a task page's title shows the path to it as links; a lint refuses bare link texts such as "here", "Learn more" or "more" in screens; every settings section already has a heading, now checked.
- **Authentication without a cognitive test** (3.3.9): password and one-time-code fields never block paste and carry the autocomplete hints; passkeys remain the route with no transcription.
- **No time limits** (2.2.3, 2.2.6): anything a disappearing message offers stays reachable elsewhere (Undo in Trash and history); no action requires a timed response; the statement documents session lifetime.
- **Glossary** (3.1.3, 3.1.4): a user-guide glossary expands every abbreviation and uncommon term the app uses (GTD, CalDAV, E2EE, MCP, OIDC, TOTP, PWA …), linked from Help; the i18n check reports UI strings with sentences over 25 words to keep the reading level low (3.1.5).
- **AAA in the automated gates.** The story audit and the docs audit run the WCAG 2.2 AAA rule set; an enhanced-contrast finding passes only when its colours resolve to a registered pair.
- **Site bundle** exports the high-contrast token blocks so the website can honour the system's contrast preference from the next release.

Out of scope: a text-size preference (browser zoom to 200 % already reflows without horizontal scroll, design-system "Comfortable reading scale"); sign language, extended audio description and other media criteria (the app has no audio or video); pronunciation (3.1.6, not applicable to the interface); a measured reading-level score for every language (editorial, covered by the translation guide); re-colouring the emerald accent or the palette hues; the native shells beyond what the web app brings them; the website (its own change, `website-accessibility-aaa` in the website repository).

Roadmap: advances "Next: Design refresh" (the accessibility checks of step 1 and the motion work of step 7) and adds its own row, step 9 "Accessibility to AAA where it keeps the look", to that table.

No new environment variable. No breaking change to the op log: the two new preference fields are additive (an older server refuses them as unknown fields, as with `haptics`; an upgrade note says to upgrade the server first).

## Capabilities

### New Capabilities
- `accessibility`: the WCAG 2.2 AAA conformance target, the beauty rule, the exceptions register and its statement, and the cross-cutting AAA requirements that belong to no single screen: pointer target size, focus never obscured, reading blocks, location, link purpose, no time limits, authentication without a cognitive test, glossary and reading level, and the AAA automated gate.

### Modified Capabilities
- `design-system`: "Accessible contrast in both themes" (text pairs at 7:1, the register as the only exception, the muted tone retuned); "High-contrast and no-motion presentation" (7:1 on every text pair including on-accent, driven by the preference or the system setting, not only the display options); "Accessibility gate on stories" (AAA rule set, enhanced-contrast findings checked against the register); "Focus visibility in the accessibility gate" (adds the not-obscured check).
- `appearance-preferences`: "Appearance preferences" gains `contrast` and `motion`.
- `documentation`: "Accessible documentation" moves from AA to AAA under the same rule, and the user guide gains the accessibility statement and the glossary.
- `site-bundle`: the tokens stylesheet includes the high-contrast blocks.

## Impact

- Web: `web/src/index.css` (muted tone, hit-area classes, prose rhythm), `web/src/ui/tokens/pairs.ts` and `contrast.test.ts` (7:1 minimums, register), a new `web/src/ui/a11y/exceptions.json`, `web/src/app/AppearanceSection.tsx` and the pre-paint appearance script (`contrast`, `motion`), the lead line of nested project and task pages, sign-in and second-factor fields, the link-text lint in the web lint, `web/src/lib/types.ts` and `ops.ts` defaults.
- Server: `internal/sync/ops.go` `Schema` (two additive `user_prefs` strings), `scripts/site-bundle.mjs` (high-contrast blocks).
- Checks: `scripts/ui-check/a11y.mjs` (AAA tags, register filter, target-size pass, not-obscured pass with its exemption list), `scripts/i18n-check.mjs` (long sentences), `web/scripts/docs` (docs audit at AAA), a repository check that the register and `docs/accessibility.md` agree.
- Docs: `docs/accessibility.md` (new), `docs/glossary.md` (new), `docs/settings-app.md`, `docs/design-system.md`, `docs/interface-guide.md`, `ROADMAP.md`, `CHANGELOG.md`.
- Dependencies: none. axe-core already ships the AAA rules.
