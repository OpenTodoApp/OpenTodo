# Tasks

## 1. Test tooling first

- [ ] 1.1 Add `web/src/ui/tokens/resolve.ts`: parse `oklch()` (with alpha), `color-mix(in oklch|oklab, A P%, B)`, `var()` chains and `transparent`; convert through OKLab to sRGB and composite alpha over a given background; export `resolveToken(tokens, name, bg?)`; verify with `resolve.test.ts` vectors (an OKLCH white, a 50 percent mix of two known hexes, alpha over black and over white) and `npm test`
- [ ] 1.2 Teach `css.ts` and `contrast.ts` to measure resolved, composited values and `chartRamp.test.ts` to use the resolver instead of its private mixer; verify `npm test` still passes against the current hex stylesheet (no token has moved yet)
- [ ] 1.3 Add the token-block rule to `lint.test.ts` (D10: only `oklch`, `color-mix` over tokens, `var`, `transparent`, lengths and times inside the token blocks), the tone rule (D6: no `opacity-` on text-bearing elements, no `/NN` alpha on text or border tokens, `tone-lint-allow` marker), and the override counter in `theme.test.ts` (D4); verify the new rules fail on a fixture and pass on the files once 2.x lands (`npm test`)

## 2. Colour

- [ ] 2.1 Rewrite the light and both dark neutral blocks in OKLCH with D3's values, add `--ot-border-soft` and the `@supports` fallback; verify `npm test` (contrast pairs including the new border-soft pair at 1.1:1 on every surface, the two dark blocks identical)
- [ ] 2.2 Collapse every `[data-accent]` block to its three declared values and derive the rest in the mapping blocks with the `--ot-mix-*` constants (D4); keep graphite's dark accent override with its comment; verify `npm test` (every accent pair in both modes, `theme.test.ts` accent and bar-colour checks, override count equals the one listed)
- [ ] 2.3 Rewrite the hue table to one solid per hue and mode with derived soft and text steps (D5), the chart ramp in OKLCH, the status and priority tokens and the high-contrast override in OKLCH at the same measured ratios; tune any failing derived step with a named override; verify `npm test` (all twelve chip pairs, the override pairs at 7:1 and 3:1, `palette.test.ts`)
- [ ] 2.4 Update `Colours.stories.tsx`: the ramp with resolved values and measured ratios, a Tones row, the border steps, the derived accent steps per theme; verify `npm run storybook` renders them and the a11y gate passes in both themes
- [ ] 2.5 Regenerate every visual baseline once (`make ui-baselines` with Docker, or CI's ui-check artifact) and review the contact sheet for any story where a derived tint reads wrong; verify `make ui-check` passes at 375 and 1280 px in light and dark

## 3. Type

- [ ] 3.1 Add `--text-display` with its line height and `-0.02em` tracking, the h1 and h2 tracking, weight 600 on the heading utilities, `font-optical-sizing: auto` on `html`, and make `.focus-clock` and `.display-clock` multiply the display step (D7); verify the Focus and Display stories render the clocks at the same size as before within 1 px (`make ui-check`)
- [ ] 3.2 Regenerate the font with both axes per the updated subset command in `docs/design-system.md`, record the measured size in design D7; if it exceeds 120 KB take the fallback path (weight-only file plus a weight-600 display instance) and record that instead; verify `npm run build` lists the font asset(s) and `make docs-check` passes
- [ ] 3.3 Update `Type.stories.tsx` with the display step, the tracking and the optical-size comparison; verify the story renders and the a11y gate passes
- [ ] 3.4 Apply `tabular-nums` in the number-printing primitives (D8: Chip, Count, row metadata, group header counts, StatTile, calendar rail and event times, sidebar counts, clocks) and add `tabular.test.ts` asserting it on each; verify `npm test`

## 4. Motion

- [ ] 4.1 Add `--ease-spring` and `--duration-moment`, zero the moment under `data-motion="none"`, and extend the Motion story with a spring and a moment demo; verify `npm test` (the no-motion test) and the story renders in both themes
- [ ] 4.2 Document the two tokens and the reduced-motion rule in `docs/design-system.md`; verify `make docs-check`

## 5. Documentation and checks

- [ ] 5.1 Update `docs/design-system.md`: the token tables in OKLCH with the derivation rules and mix ratios, the tone rule, the border steps, the display step and tracking, tabular figures, the subset command; verify `make docs-check`
- [ ] 5.2 Run `make check` (lint, contrast, token and tone lint, ui-lint, i18n, openspec validate) and `make ui-check`; add the CHANGELOG.md entry under Unreleased naming the warmer neutrals, the lifted dark canvas, optical sizing and the font size change; verify both commands pass
