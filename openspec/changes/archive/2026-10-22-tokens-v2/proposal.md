# Proposal

## Why

The token system is sound but its values are hand-picked hexes: eight accent themes each carry fourteen tuned colours, the twelve palette hues carry three each per mode, and the slate neutrals are the stock cold ramp with a near-black dark canvas, so every screen reads the same weight and the dark theme reads like every other dark SaaS. The interface analysis of 21 October 2026 ("a quiet desk, not a dashboard") makes this the first move of the design refresh because every later screen change (rows, page rhythm, motion, sidebar, phone) inherits its colour, type and motion from here.

## What Changes

- **Colour authored in OKLCH, tints derived.** Every `--ot-*` colour token is written as `oklch(...)` or as `color-mix(in oklch, ...)` over another token. An accent theme declares three values (its accent, its bright dark-mode text and its on-accent colour); hover, soft, soft text, focus and the chart base are derived from them with fixed mix ratios. A palette hue declares one solid per mode; its soft and text steps are derived. The mix ratios are named constants in the stylesheet and the contrast check reads them back.
- **Warmer, calmer neutrals.** The slate ramp keeps its family and its light-white-cards, dark-near-black identity, but with lower chroma (less blue) and a dark canvas lifted off pure black, so surfaces separate by lightness instead of by borders. Dark borders become translucent white (two steps: the border and a softer divider), light borders a hairline of the same family. Neutrals stay the same in every accent theme.
- **A tone scale.** The four text tokens (strong, default, muted, faint) become the one way to make text and icons quieter; opacity utilities and ad-hoc colours on text are refused by the lint. A second, softer border token joins them for dividers.
- **A display type step** above h1 (28 px, tight tracking, weight 600) for page titles and the large clocks; headings gain tracking rules and weight 600; tabular figures become the rule for every time, count and duration. Optical sizing is enabled: the bundled Inter keeps its `opsz` axis if the file stays within the stated budget.
- **Two motion tokens** for the moments later changes build: `--ease-spring` (a light overshoot, no library) and `--duration-moment` (400 ms), with reduced motion and the no-motion attribute unchanged in effect.
- **Tooling follows.** The contrast check resolves OKLCH, mixes and translucency over the real surface (no new dependency); the token lint refuses hex, rgb and hsl literals inside the token blocks; the foundations stories show the ramp, the tones, the display step and the spring; every visual baseline is regenerated once.
- **No op, API, data or route changes.** No new dependency. The font file may grow by the optical-size axis (measured in the design); the stylesheet shrinks because the accent and hue blocks lose their hand-tuned steps.

Out of scope: any screen layout change (rows, headers, sidebar, phone, calendar and board surfaces are their own changes: `rows-v2`, `page-rhythm`, `motion-v2`, `sidebar-v2`, `phone-v2`, `surfaces-v2`, `moments-and-onboarding`); an accent-tinted dark canvas (rejected, see design D3); new accent themes; a second typeface; a user-facing density or contrast change; the high-contrast override's values beyond re-expressing them in OKLCH at the same ratios.

ROADMAP: advances "Next: Design refresh" (the `design-language` row, tokens and typeface) and is the foundation for the 21 October 2026 interface analysis.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: "Semantic design tokens" (OKLCH authoring, derived tints, the softer border, the lint on literals), "OpenTodo identity is preserved" (the warmer slate family and the lifted dark canvas, neutrals still fixed across themes), "Accessible contrast in both themes" (resolved and composited values, derived steps per accent and hue), "Bundled typeface without network access" (optical sizing within a size budget), "Comfortable reading scale" (the display step and heading tracking), "Secondary text is one size" (tabular figures everywhere a number is shown), "Reduced motion" (the 400 ms moment and its reduced form), "Design workbench" (foundations show tones, the display step and the spring); ADDED "Tone scale", "Derived accent and palette steps", "Moment motion tokens".

`appearance-preferences` is not modified: a theme still changes only the accent, the neutrals stay fixed, and the bar colour rule is unchanged. `display-mode` is not modified: the high-contrast override keeps its pure surfaces and 7:1 minimums.

## Impact

- `web/src/index.css`: every token block, the accent blocks (fourteen values become three per accent), the hue table (three values become one per hue and mode), the chart ramp, the motion tokens, the type scale, the `@font-face` rule.
- `web/src/ui/tokens/`: `contrast.ts` and `css.ts` gain a resolver for `oklch()`, `color-mix()` and alpha over a background; `pairs.ts` gains the softer border and the tone pairs; `lint.test.ts` gains the token-block rule; `theme.test.ts` checks the bar colour against the resolved accent; `web/src/lib/chartRamp.test.ts` reuses the resolver.
- `web/src/ui/foundations/*.stories.tsx` and every visual baseline under `web/src/ui/__screenshots__/` (one full regeneration).
- `web/src/assets/fonts/InterVariable-latin.woff2` and the subset command in `docs/design-system.md`.
- `docs/design-system.md`: the token tables, the tone rule, the type scale, the motion tokens.
- Bundle: CSS smaller by about 2 KB gzipped; JS unchanged; the font grows only if the optical-size axis is kept (design D7 states the budget and the measured size).
