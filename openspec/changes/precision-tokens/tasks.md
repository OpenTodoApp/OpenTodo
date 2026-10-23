## 1. Tokens

- [x] 1.1 Colour (D1): the Precision values for canvas, surface, raised, sunken, the text tones, the hairlines and the status tones in the light block and both dark blocks of `web/src/index.css`; the new `pop`, `hover`, `selected`, `selected-row` and `line-strong` tokens with `@theme` utilities (`bg-pop`, `bg-hover`, `bg-selected`, `bg-selected-row`, `border-strong`), also in the high-contrast override; the sidebar tint retired in every mode and accent block; verify `npx vitest run src/ui/tokens` passes
- [x] 1.2 Contrast pairs for the new tokens in `web/src/ui/tokens/pairs.ts`, with the faint tone kept off `selected`; nudge the values that miss a minimum (dark faint, the light hairlines, the light yellow and green label hues) and record them in D1; verify the contrast test passes in light, dark, high contrast and all eight accents
- [x] 1.3 Type (D2): `--ot-text-list` behind `text-body` (13 px), `text-prose` (15 px) for the notes editor, help prose and the display route, and the new meta, hint, h3, h1 and display steps; verify `npx vitest run src/ui/tokens` and the reading-scale tests
- [x] 1.4 Radius and elevation (D3, D4): the new radius steps and `--radius-surface` / `--radius-popover`, `shadow-1` as no shadow, `surface-overlay` on `pop` with the strong edge, and the popover, tooltip and menu components on the popover surface; ghost and secondary buttons hover on `hover`
- [x] 1.5 Rows and density (D5): `--size-row` 36 px (44 px coarse), compact rows 32 px; verify the density tests
- [x] 1.6 The dark browser bar colour (D6) in `accents.ts`, `appearance.js` and the appearance tests

## 2. Docs, tests and baselines

- [ ] 2.1 Update `docs/design-system.md` (colour, type, radius, elevation, the new tokens) and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [ ] 2.2 Regenerate the visual baselines in the pinned Playwright image; verify `make ui-check` in CI
- [ ] 2.3 Render Today, a project and Settings from the real app at 1440×900 in dark next to the round-2 mock-ups and attach the side-by-side to the pull request
- [ ] 2.4 Run `make check` with TZ=UTC, open the pull request and get CI green
