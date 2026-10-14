# Tasks

## 1. Workbench feasibility and setup

- [x] 1.1 Pick the newest Storybook release whose Vite builder supports Vite 8.3.4. Add `storybook`, `@storybook/react-vite`, `@storybook/addon-a11y` and `@storybook/addon-docs` as exact-pinned devDependencies in `web/`. Verify with `npm ci` in `web/`. If no compatible release exists, switch to Ladle and record it in design.md, decision 6.
- [x] 1.2 Add `web/.storybook/main.ts` (stories from `src/**/*.stories.tsx`, `vite.config.ts` reused without the PWA plugin) and `preview.tsx` (imports `index.css`; theme global setting `data-theme`; width global 375/1280). Add the `storybook` and `build-storybook` scripts and gitignore `web/storybook-static/`. Verify that `npm run build-storybook` succeeds and that `storybook-static/index.json` lists a placeholder story.
- [x] 1.3 Add a vitest test asserting that the production build output (`internal/web/dist` after `npm run build`) contains no Storybook code. Verify that `npm test` and `npm run build` pass in `web/`.

## 2. Tokens

- [x] 2.1 Add the `--ot-*` light values on `:root`, and the dark values under both `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`. Cover surfaces, text, borders, accent, focus, priority, status, palette hues, type, radius, elevation and motion, with the values from design.md decision 3. Map them in `@theme` to semantic utilities. Verify that `npm run build` succeeds and that `bg-surface`, `text-muted`, `rounded-card` and `shadow-2` appear in the built CSS.
- [x] 2.2 Add `@custom-variant dark` matching both dark conditions. Verify by toggling the OS scheme in the running app (no visual change from today), and with a vitest DOM test that `data-theme="dark"` resolves `--ot-surface` to `#0f172a`.
- [x] 2.3 Add the global reduced-motion rule. Verify in the running app with emulated `prefers-reduced-motion: reduce` that completing a task has no movement or scale animation.
- [x] 2.4 Add `web/src/ui/tokens/pairs.ts` and `contrast.test.ts`. The test parses both theme blocks from `index.css` and checks text pairs ≥4.5:1, UI pairs ≥3:1 and all 12 chip pairs ≥4.5:1. Verify that `npm test` passes, and that temporarily setting dark `--ot-muted` to `#6b7a90` fails it with a message naming the pair, theme and ratio.
- [x] 2.5 Add `web/src/ui/tokens/lint.test.ts`, which fails on raw palette classes or hex literals in `web/src/ui/**/*.tsx`, reporting file:line. Verify that `npm test` passes, and that a temporary `bg-slate-200` in a `web/src/ui` file fails it.

## 3. Stored colours and palette

- [x] 3.1 Add `web/src/ui/tokens/palette.ts` with the 12 `HUES` and `hueFor()` (OKLab nearest, exact canonical short-circuit, slate fallback), plus the `[data-hue=…]` CSS rules for the solid, soft and text steps in both themes. Verify with `palette.test.ts`: every existing `LABEL_PALETTE` value maps to its own hue, `#a0522d` maps to orange, and invalid input maps to slate.
- [x] 3.2 Append the lime, cyan and indigo canonical hexes to `LABEL_PALETTE`, keeping the existing order. Verify that the existing label tests still pass, and with a test that creating 10+ labels cycles through all 12.
- [x] 3.3 Move the `PRIORITY_RING` (`TaskRow.tsx`) and QuickAdd chip colours to the priority and status tokens. Verify that `npm test` passes and, by manual check in both themes, that priority rings are unchanged in hue.

## 4. Typeface

- [x] 4.1 Generate `web/src/assets/fonts/InterVariable-latin.woff2` (roman, weight axis, the Latin subset from design.md decision 5) with `pyftsubset`, and commit it with `OFL.txt`. Record the exact command in the contributor doc and the file size in design.md. Verify that the size is ≤110 KB.
- [x] 4.2 Add `@font-face` (`font-display: swap`, `unicode-range`), set `--font-sans` to Inter plus the system fallback, and add `font-synthesis: style`. Verify in the running app that DevTools shows the font loaded from the app's own origin with no other host contacted, and that it renders offline after install (PWA precache includes it). Verify that `npm run build` succeeds.

## 5. Legacy class remap

- [x] 5.1 Rewrite `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.input` and `.kbd` on tokens, with variants composing the `.btn` base, and add `.btn-secondary` (design.md decision 8). Switch the body to `bg-canvas text-default`. Verify that `npm test` and `npm run build` pass.
- [x] 5.2 Mechanically replace every `btn-ghost border border-slate-300 dark:border-slate-700` with `btn-secondary`. Verify that `grep -rn "btn-ghost border border-slate-300" web/src` returns nothing and that `npm test` passes.
- [x] 5.3 Run `make layout-check` (Chromium and WebKit, 360/390/768 px, both themes) and fix any regressions caused by the new control heights or radii. Verify that the layout check passes.

## 6. Foundations stories

- [x] 6.1 Add `web/src/ui/foundations/` stories for Colours (every token with its live contrast ratio against its allowed surfaces), Palette (12 hues × solid/soft/text, both themes), Type, Spacing, Radius, Elevation and Motion, plus an empty Icons story for `ui-primitives` to fill. Verify that `npm run storybook` shows the Foundations group and that each story renders in light, dark and side-by-side.

## 7. Gates

- [x] 7.1 Add `scripts/ui-check/a11y.mjs`. It reads `storybook-static/index.json`, opens each story in Chromium (light and dark), injects `axe-core` with WCAG 2.2 AA rules, and fails on serious or critical violations. Verify that it passes on the Foundations stories, and that a temporary story with an unnamed icon-only button fails, naming the story, theme and rule.
- [x] 7.2 Add `scripts/ui-check/visual.spec.ts` and its config using `@playwright/test` (pinned to the CI Playwright version). It covers each story × light/dark × 375/1280, with animations and caret disabled, `maxDiffPixelRatio: 0.002`, and baselines under `web/src/ui/__screenshots__/`. Verify that a run against freshly generated baselines passes, and that changing the `.btn` padding fails with before, after and diff images.
- [ ] 7.3 Add Make targets: `storybook`, `ui-check` (build the workbench, then the a11y and visual checks) and `ui-baselines` (runs in `mcr.microsoft.com/playwright:v1.56.1-noble` via Docker), plus a manually triggered `ui-baselines` workflow that uploads baselines as an artifact. Verify that `make ui-check` passes locally and that `make ui-baselines` rewrites the PNGs.
- [ ] 7.4 Add a `ui-check` job to `.github/workflows/ci.yml` (Node 22, `npm ci`, global Playwright and `@playwright/test` at 1.56.1, Chromium) that uploads the diff artifact on failure. Verify that the job is green on the PR.

## 8. Documentation and roadmap

- [x] 8.1 Write `docs/design-system.md` for contributors: principles, the keep/evolve table, the token list, how to run the workbench, how to add a story, how to update baselines, the font subset command, and the stored-colour mapping. Add one line to `AGENTS.md` (Conventions) pointing at the tokens and the workbench. Verify that `make docs-check` passes.
- [x] 8.2 Add the "Design refresh" section to `ROADMAP.md` listing `design-language`, `ui-primitives`, `settings-redesign`, `task-detail-redesign` and `labels-and-menus`, with `date-time-preferences`, `push-test-delivery` and `backup-restore-web` as related fixes. Verify that `make docs-check` passes.

## 9. Integration

- [ ] 9.1 Run `make check` and `make ui-check`, and confirm the production bundle size change is only the font (compare `internal/web/dist` before and after). Record the numbers in design.md. Verify that both commands pass.

## Workflow follow-up

- Archive the change after review, and confirm that `npx @fission-ai/openspec validate --all --strict` passes.
- Add a CHANGELOG.md entry under Unreleased: "New visual foundation: design tokens, bundled Inter, refreshed buttons and inputs, and a component workbench".
