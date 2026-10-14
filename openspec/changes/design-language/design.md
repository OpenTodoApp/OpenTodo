# Design

## Context

See proposal.md for the motivation. Here is the current state that shapes the approach:

- **Styling.** Tailwind 4 through `@tailwindcss/vite`. `web/src/index.css` defines only two tokens (`--color-muted` and `--color-faint`, already AA-tuned in both themes). It also has six component classes (`.btn` outside the layer; `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.input` and `.kbd` inside `@layer components`), each repeating the full base `@apply` list.
- **Raw colour literals are everywhere.** The most used are slate-300 (156), slate-800 (128), slate-600 (105) and red-600/400 (77 each). Emerald-700 is the primary colour (36). Radii are mixed: `rounded-md` 87, `rounded` 53, `rounded-full` 40. Type is almost all `text-sm` (415) and `text-xs` (398).
- **Dark mode** follows `prefers-color-scheme` only, through Tailwind's default `dark:` media variant.
- **Stored colours.** Projects, labels and saved views store `color` as a free string in ops (`internal/sync/ops.go:140,194,212`). Labels default to `LABEL_PALETTE` (`web/src/lib/labels.ts:9`), which holds nine Tailwind 500-step hexes.
- **Priorities** are coloured ad hoc: `PRIORITY_RING` in `web/src/app/TaskRow.tsx:12` (red, orange and blue 500, plus slate).
- **Fonts and caching.** CSP already allows `font-src 'self'` (`internal/httpapi/server.go:450`), and the PWA precache already includes `*.woff2` (`web/vite.config.ts`). A self-hosted font needs no server change.
- **Existing checks.** Playwright is installed globally in CI (`playwright@1.56.1`) for `scripts/e2e-layout.mjs`, which covers every screen at 360/390/768 px in Chromium and WebKit. `axe-core` is already a web devDependency.
- **Dependency policy.** `web/.npmrc` uses `save-exact=true`, and AGENTS.md asks that every dependency be justified.

## Goals / Non-Goals

**Goals:**
- One token layer that every later change uses, so redesigns are consistent by construction.
- Visible improvement on day one through the remapped legacy classes, with zero screen rewrites.
- A workbench and automated gates good enough that a contributor can change a primitive with confidence.

**Non-Goals:**
- Replacing Tailwind or adding a CSS-in-JS or component library.
- Changing any screen layout. Screens get only the side effects of the legacy class remap.
- Pixel-perfect cross-browser visual baselines. Visual regression runs in Chromium only, because WebKit behaviour is already covered by the layout check.

## Decisions

### 1. Direction: keep the soul, evolve the craft

| | Keep (identity) | Evolve (craft) |
|---|---|---|
| Colour | emerald accent, slate neutrals, white / slate-950 | formal tokens, soft tints, canvas vs card surfaces |
| Mood | calm, honest, a little technical | roomier and friendlier |
| Space | — | 4 px grid, 44–48 px rows, 16/24 px section gaps |
| Surfaces | — | cards with soft elevation instead of bare sections and thin borders |
| Type | system sans fallback | bundled Inter, 15 px body, clear heading scale |
| Colour use | accent on primary actions | colour carries meaning: priority, project and label chips, status |
| Delight | — | gentle motion and a satisfying completion state, respecting reduced motion |

Principles, recorded in the contributor doc:
1. **Content first.** Chrome is neutral, and colour is reserved for meaning.
2. **Roomy, not sparse.** Generous padding, one idea per row, state before forms.
3. **One way to do a thing.** Every control comes from a primitive, and every value from a token.
4. **Accessible by construction.** AA contrast, visible focus, 44 px touch targets and reduced motion are enforced by tests, not left to review.
5. **Calm motion.** Short transitions with nothing bouncing in the way.

### 2. Token architecture: CSS variables → Tailwind `@theme` → utilities

Raw values live as `--ot-*` custom properties on `:root`. Tailwind's `@theme` maps semantic names onto them (`--color-surface: var(--ot-surface)` and so on), so utilities like `bg-surface`, `text-muted`, `border-default` and `rounded-control` work, and dark values swap in one place.

Dark values are declared twice:
- under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
- again under `:root[data-theme="dark"]`

A `@custom-variant dark` with the same two conditions keeps `dark:` utilities consistent. The app never sets `data-theme`, so it keeps following the system preference (no behaviour change). The workbench sets it to show both themes side by side, and a future theme setting gets it for free.

*Alternatives considered:*
- **A TS token file generating CSS.** It adds a build step, and the CSS would no longer be the obvious source.
- **Overriding Tailwind's default palette and radii.** That would silently change all 87 `rounded-md` and hundreds of colour usages unpredictably. New semantic names are added instead, and the defaults are left alone.

### 3. Token values

All ratios below were computed with the WCAG 2.x relative-luminance formula. The contrast unit test (decision 7) recomputes them from `index.css` on every run.

**Surfaces and text**

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#f8fafc` slate-50 | `#020617` slate-950 | app background |
| `surface` | `#ffffff` | `#0f172a` slate-900 | cards, panels, rows |
| `raised` | `#ffffff` + elevation-2 | `#1e293b` slate-800 | popovers, dialogs |
| `sunken` | `#f1f5f9` slate-100 | `#020617` slate-950 | wells, code, inactive tabs |
| `text` | `#0f172a` | `#f1f5f9` | body (17.1:1 on canvas, light) |
| `text-muted` | `#526075` (existing) | `#94a3b8` (existing) | descriptions; ≥5.7:1 on all surfaces |
| `text-faint` | `#5f6e82` (existing) | `#8695aa` (existing) | timestamps, counts; ≥4.75:1 (sunken, light) and ≥4.8:1 (raised, dark) |
| `border` | `#e2e8f0` | `#1e293b` | decorative dividers (not a 3:1 boundary) |
| `border-input` | `#7c8aa0` | `#64748b` | input boundaries: 3.5:1 and 3.75:1 |

**Accent (emerald, unchanged identity)**

| Token | Light | Dark | Notes |
|---|---|---|---|
| `accent` | `#047857` emerald-700 | `#047857` | primary fill; white text 5.48:1 |
| `accent-hover` | `#065f46` | `#065f46` | 7.68:1 |
| `on-accent` | `#ffffff` | `#ffffff` | |
| `accent-text` | `#047857` | `#34d399` | links, selected nav text; 5.48:1 and 9.29:1 |
| `accent-soft` / `accent-soft-text` | `#ecfdf5` / `#065f46` | `#022c22` / `#6ee7b7` | selection and active chips; 7.29:1 and 9.94:1 |
| `focus` | `#059669` | `#34d399` | ring 2 px with 2 px offset; 3.77:1 and 10.5:1 |

**Priority**

The values follow the familiar Todoist convention, are used for the check ring and flag, and keep the existing hues.

| Token | Light | Dark |
|---|---|---|
| `p1` | `#dc2626` (4.83:1) | `#f87171` (6.45:1) |
| `p2` | `#ea580c` (3.56:1, non-text) | `#fb923c` |
| `p3` | `#2563eb` (5.17:1) | `#60a5fa` |
| `p4` | `#64748b` (4.76:1) | `#64748b` (3.75:1) |

Each priority also has a soft step for the check fill (the hue's 50 step in light, the 950 step at 40% in dark), replacing `PRIORITY_RING`.

**Status:** `success` emerald, `warning` amber-700 `#b45309` (5.02:1) / amber-400, `danger` red-600 / red-400, `info` sky-700 `#0369a1` (5.93:1) / sky-400. Each has a soft background (50 / 950) and a soft text step (800 / 300).

**Palette: 12 hues for projects and labels**

Each hue has five steps. The canonical value is what gets stored. The solid step is a ≥3:1 dot or ring. The soft and text steps are for chips.

| Hue | Canonical (stored) | Solid L / D | Soft bg L / D | Soft text L / D | Chip contrast L / D |
|---|---|---|---|---|---|
| red | `#ef4444` | `#dc2626` / `#f87171` | `#fee2e2` / `#450a0a` | `#991b1b` / `#fca5a5` | 6.8 / 8.5 |
| orange | `#f97316` | `#ea580c` / `#fb923c` | `#ffedd5` / `#431407` | `#9a3412` / `#fdba74` | 6.4 / 9.3 |
| yellow | `#eab308` | `#d97706` / `#fbbf24` | `#fef3c7` / `#451a03` | `#92400e` / `#fcd34d` | 6.4 / 10.4 |
| lime *(new)* | `#84cc16` | `#4d7c0f` / `#a3e635` | `#ecfccb` / `#1a2e05` | `#3f6212` / `#bef264` | 6.5 / 11.2 |
| green | `#22c55e` | `#16a34a` / `#4ade80` | `#dcfce7` / `#052e16` | `#166534` / `#86efac` | 6.5 / 10.6 |
| teal | `#14b8a6` | `#0d9488` / `#2dd4bf` | `#ccfbf1` / `#042f2e` | `#115e59` / `#5eead4` | 6.7 / 9.8 |
| cyan *(new)* | `#06b6d4` | `#0891b2` / `#22d3ee` | `#cffafe` / `#083344` | `#155e75` / `#67e8f9` | 6.5 / 9.2 |
| blue | `#3b82f6` | `#2563eb` / `#60a5fa` | `#dbeafe` / `#172554` | `#1e40af` / `#93c5fd` | 7.2 / 8.2 |
| indigo *(new)* | `#6366f1` | `#4f46e5` / `#818cf8` | `#e0e7ff` / `#1e1b4b` | `#3730a3` / `#a5b4fc` | 8.1 / 8.0 |
| violet | `#8b5cf6` | `#7c3aed` / `#a78bfa` | `#ede9fe` / `#2e1065` | `#5b21b6` / `#c4b5fd` | 7.6 / 8.3 |
| pink | `#ec4899` | `#db2777` / `#f472b6` | `#fce7f3` / `#500724` | `#9d174d` / `#f9a8d4` | 6.7 / 8.3 |
| slate | `#64748b` | `#64748b` / `#94a3b8` | `#f1f5f9` / `#1e293b` | `#334155` / `#cbd5e1` | 9.5 / 9.9 |

The nine existing `LABEL_PALETTE` values are canonical as they are, so old clients and stored data stay valid. `LABEL_PALETTE` gains the three new canonical values at the end, keeping the order of the existing nine.

**Type** (`--text-*` with line heights): `hint` 11/14, `meta` 13/18, `body` 15/22, `h3` 17/24, `h2` 20/28, `h1` 24/32. Weights are 400, 500 and 600. Everything is in rem, so it follows the browser font size.

**Space:** Tailwind 4's `--spacing: 0.25rem` (4 px) stays. The recommended rhythm is 8/12/16/24/32. `--size-row` is 44 px, or 48 px under `pointer: coarse`.

**Radius:** `chip` 6 px, `control` 10 px (inputs, buttons), `card` 14 px (cards, popovers, dialogs), `full`.

**Elevation:**
- 0 is a border only.
- 1 is `0 1px 2px rgb(15 23 42 / .06)` (cards).
- 2 is `0 4px 12px rgb(15 23 42 / .10)` (popovers).
- 3 is `0 12px 32px rgb(15 23 42 / .16)` (dialogs).

In dark, shadows are paired with a 1 px `border` because shadows barely read there.

**Motion:** `--duration-ui` 120 ms, `--duration-emphasis` 250 ms, `--ease-out` `cubic-bezier(.2,.8,.2,1)`. A global `@media (prefers-reduced-motion: reduce)` rule sets transition and animation durations to 0.01 ms, except opacity.

### 4. Stored colours map to hues at render time

`web/src/ui/tokens/palette.ts` exports:
- `HUES` (name, canonical hex)
- `hueFor(stored)`: an exact canonical match short-circuits. Otherwise the colour is converted to OKLCh; greys (chroma below 0.06) map to slate, and anything else maps to the hue with the nearest hue angle. Lightness is ignored on purpose: palette hues differ by hue, while stored colours vary in lightness (plain OKLab distance mapped sienna `#a0522d` to red). Unknown or invalid input falls back to slate.

Components render `data-hue="green"`, and CSS rules `[data-hue=green] { --hue-solid; --hue-soft; --hue-text }` supply the per-theme values. Stored colours are dynamic, so per-hue utility classes can't be generated; the attribute keeps everything in CSS and theme-aware. Nothing is written back.

**Data model impact:** none. No new fields and no op changes. Colours picked from now on store canonical hexes, as they already do today.

### 5. Typeface: Inter variable, self-hosted

- **Font and licence.** Inter 4.x, roman, variable weight axis only (the optical-size axis is dropped). OFL-1.1, with the licence committed next to the file.
- **Subset.** Basic Latin, Latin-1 Supplement, Latin Extended-A, general punctuation, currency, arrows and the `tnum` / `cv11` features. That covers the six quick-add languages.
- **How it was produced.** The subset is generated once with `pyftsubset`, and the command is recorded in the contributor doc. The output, `web/src/assets/fonts/InterVariable-latin.woff2`, is committed.
- **Loading.** It is referenced from `@font-face` in `index.css` with `font-display: swap` and a `unicode-range`. Vite hashes it, the PWA precaches it (the existing glob), the Go binary embeds it, and CSP already allows it.
- **Size.** Budget ≤110 KB. Measured: **54,068 bytes (52.8 KiB)** for Inter 4.1 (`Inter-4.1.zip` SHA-256 `9883fdd4…6b11e`), optical size pinned at 14 with `fonttools varLib.instancer`, then subset with `pyftsubset` (fonttools 4.60.1). The exact commands are in `docs/design-system.md`.
- **Italics** use `font-synthesis: style`.
- **Fallback stack:** `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, …`, so non-Latin scripts fall back per glyph.

*Alternatives considered:*
- **System fonts only.** Zero bytes, but the look varies across platforms.
- **Google Fonts.** Ruled out by the no-third-party-calls principle.
- **Full Inter with italics and opsz.** About 700 KB, not justified.

### 6. Workbench: Storybook, dev-only

**Packages:** `storybook`, `@storybook/react-vite`, `@storybook/addon-a11y` and `@storybook/addon-docs`, as exact-pinned devDependencies. Use the newest Storybook release whose Vite builder supports Vite 8. The apply step verifies `npm run storybook` and `npm run build-storybook` against the repo's Vite 8.3.4.

**Configuration:**
- `web/.storybook/main.ts` lists stories from `src/**/*.stories.tsx` and reuses `vite.config.ts` without the PWA plugin, so no service worker gets into the workbench.
- `preview.tsx` imports `index.css` and adds two toolbar globals:
  - theme (light / dark / side-by-side), which sets `data-theme`
  - width (375 / 1280)

**Story conventions:**
- One `*.stories.tsx` next to each component.
- A `Foundations/` group in `web/src/ui/foundations/` with Colours (every token pair and its live contrast ratio), Palette, Type, Spacing, Radius, Elevation, Motion and Icons. Icons is filled in by `ui-primitives`.
- Stories render with fixture data only, never Dexie or network.

**Commands:**
- `npm run storybook` (dev, :6006) and `npm run build-storybook` (static, into `web/storybook-static/`, which is gitignored).
- Make targets `storybook`, `ui-check` and `ui-baselines`.

**Why Storybook:**
- It is the industry standard and recognisable to open-source contributors.
- Its docs and a11y add-ons are mature.
- Stories use the Component Story Format (CSF), so moving to Ladle later only means swapping the runner.

**Weight:** tens of MB in `node_modules`, dev-only. Zero bytes in `internal/web/dist`, the Go binary or the container image, and no runtime memory impact. A test asserts the zero-bytes part: the production build output must contain no `storybook` string.

*Alternatives considered:*
- **Ladle.** Lighter, but fewer add-ons and less familiar.
- **An in-app `/dev/ui` route.** No dependency, but it would have to be built and maintained by hand, and it risks leaking into the production bundle.

### 7. Gates

| Gate | Where | How | Fails on |
|---|---|---|---|
| Token contrast | `npm test` (vitest), and so `make check` | `web/src/ui/tokens/contrast.test.ts` parses the light and dark `--ot-*` blocks from `index.css` and checks every pair in `pairs.ts` (text-on-surface ≥4.5, UI ≥3, chip text ≥4.5 for all 12 hues) | Any pair below its threshold; the message names the pair, theme and ratio |
| Token lint | `npm test` | `web/src/ui/tokens/lint.test.ts` scans `web/src/ui/**/*.tsx` for raw palette classes (`(bg\|text\|border\|ring\|fill\|stroke)-(slate\|emerald\|red…)-\d+`) and hex literals | A raw colour in the shared UI folder; legacy `app/` is exempt until migrated |
| Story a11y | `make ui-check`, CI job `ui-check` | Playwright opens each story from the static build's `index.json` in Chromium, light and dark, injects `axe-core` and runs WCAG 2.2 AA rules | Any serious or critical violation |
| Visual regression | same | `@playwright/test` `toHaveScreenshot` for each story × {light, dark} × {375, 1280}, animations disabled, `maxDiffPixelRatio: 0.002` | A diff over the threshold; before, after and diff images are uploaded as a CI artifact |

**Where baselines come from.** Font rasterisation differs between operating systems, so baselines are generated only inside the pinned Playwright Docker image (`mcr.microsoft.com/playwright:v1.56.1-noble`). `make ui-baselines` runs that container when Docker is available. Without Docker, a manually triggered `ui-baselines` CI workflow attaches the baselines as an artifact for the contributor to commit. Baselines are stored as PNGs under `web/src/ui/__screenshots__/`, cropped to the story root to keep the repository small.

*Alternative considered:* a hosted visual-testing service (Chromatic and similar). Ruled out because it is a third party and paid.

### 8. Legacy class remap

`index.css` gets one `.btn` base inside `@layer components`, and the variants compose it instead of repeating the base list:

| Class | New definition |
|---|---|
| `.btn` | `inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-control text-sm font-medium transition duration-(--duration-ui)`, focus ring `focus`, disabled at 50% |
| `.btn-primary` | `bg-accent text-on-accent hover:bg-accent-hover`, elevation-1 |
| `.btn-secondary` *(new)* | `bg-surface text-default border border-input hover:bg-sunken` |
| `.btn-ghost` | `text-muted hover:bg-sunken hover:text-default` |
| `.btn-danger` | `text-danger hover:bg-danger-soft` |
| `.input` | `h-10 rounded-control border-input bg-surface text-body px-3 placeholder:text-faint focus:ring-2 focus:ring-focus/30 focus:border-focus` |
| `.kbd` | `rounded-chip border-default bg-sunken text-hint font-mono text-muted` |

Plus:
- A mechanical codemod replaces the repeated `btn-ghost border border-slate-300 dark:border-slate-700` with `btn-secondary`. Grep-verified, with no other edits.
- Body: `bg-canvas text-default` instead of `bg-white` / `slate-950`.
- `PRIORITY_RING` and the QuickAdd chip colours move to tokens.

Heights grow slightly (36 px buttons, 40 px inputs), so the existing layout check is the safety net.

*Applied differently from the table above:* the heights come from padding (`py-2.5` with `text-sm` for buttons, `py-2` with `text-body` for inputs, both 40 px) rather than fixed `h-9`/`h-10`. Buttons match the input height because a 36 px button beside a 40 px input in the same form row looked misaligned in the screenshot review. During apply, 126 of 297 legacy button usages turned out to shrink themselves on purpose (`text-xs`, `py-0.5`); a fixed height would have inflated every compact row control. Dark hovers use `raised`, because `sunken` equals the dark canvas and would show no hover. The base moved into `@layer components`, so utilities on a button now override it (previously `.btn` was unlayered).

### 9. Sequencing and migration

```
design-language  (tokens, font, remap, workbench, gates)
      |
      v
ui-primitives    (web/src/ui/: Icon + glyph migration, Button, inputs, Card, Menu items,
      |           Combobox, Tabs, Badge, Avatar, SettingsSection/Row, Timeline, EmptyState)
      +--------------------+----------------------+
      v                    v                      v
settings-redesign   task-detail-redesign   labels-and-menus
                    (uses date-time-preferences when present)

independent at any time: date-time-preferences, push-test-delivery, backup-restore-web
```

Rules for every later change:
- New and changed UI is built from `web/src/ui` primitives and tokens.
- A screen counts as migrated when its file holds no raw palette classes. The token lint's exemption list shrinks as screens migrate.
- Each redesign change adds its patterns' stories and baselines.

### 10. Measured size impact (apply)

Production build (`internal/web/dist`) compared with the commit before this change:

| Asset | Before | After | Change |
|---|---|---|---|
| JavaScript | 1,779,719 B (529,228 B gz) | 1,777,228 B (528,324 B gz) | −2.5 KB (−0.9 KB gz) |
| CSS | 72,368 B (12,398 B gz) | 104,307 B (15,813 B gz) | +31.9 KB (+3.4 KB gz) |
| Font | — | 54,068 B | +54 KB |

The CSS growth is the token declarations themselves (light block, two identical dark blocks, the 12 `data-hue` rules), not Storybook; the workbench adds 0 bytes, as the exclusion test asserts. The Go binary grows by the same ~86 KB. Runtime memory is unchanged.

## Risks / Trade-offs

- **The remap shifts unmigrated screens** (taller buttons, new radius, canvas tint), which could break a tight layout. → Mitigation: the existing layout check at 360/390/768 px in both engines runs in the same PR. Any regressions are fixed in that PR, and the remap is one CSS block, easy to revert.
- **Storybook lags Vite 8 support.** → Mitigation: verify first, as task 1. If no compatible release exists, fall back to Ladle with the same CSF stories, and record it here.
- **Visual baselines are brittle and noisy.** → Mitigation: baselines come from the pinned Docker image only, animations and caret are disabled, fixtures are fixed, there is a small diff threshold, and stories are cropped to the component.
- **Repository growth from PNG baselines.** → Mitigation: about 4 images per story, cropped and optimised. Budget ≤5 MB total, reviewed in `ui-primitives`.
- **Nearest-hue mapping changes how an odd custom colour looks** (for example, imported `#a0522d` becomes orange). → Mitigation: the stored value is untouched, and the next explicit colour pick stores a canonical hue. This is documented.
- **Font weight on slow first loads.** → Mitigation: `font-display: swap`, so text shows immediately, and the font is precached once.
- **Two dark-mode conditions (media and `data-theme`) can drift.** → Mitigation: one `@custom-variant` and one token block generated from the same declarations. The contrast test reads both.

## Migration Plan

1. Tokens and `@custom-variant` land with values equal to or close to today's colours. The contrast and lint tests are added.
2. The font is added and the body switches to tokens.
3. The legacy classes are remapped and the `btn-secondary` codemod runs. The layout check must pass.
4. The workbench, Foundations stories and gates are added, and the CI job turns on.

Rollback: revert the CSS block and the font. No data is involved, and no device has to resync.

## Open Questions

- Should the side-by-side theme view become the workbench default? This is a contributor ergonomics question, decidable when the workbench lands.
