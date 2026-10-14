---
title: Design system
summary: The visual language for contributors: principles, design tokens, the bundled typeface, the Storybook workbench and the accessibility and visual-regression checks.
audience: developer
section: Internals
specs: []
screens: []
order: 30
---
# Design system

OpenTodo's interface is friendly and roomy, in the spirit of TickTick, Todoist and Any.do, and keeps its own identity: the emerald accent, slate neutrals, white cards in light and a slate-950 canvas in dark. Every colour, size, radius, shadow and duration comes from a design token, and every shared building block is developed and checked in a workbench. The contract lives in the `design-system` OpenSpec capability; this page is the how-to.

## Principles

1. **Content first.** Chrome is neutral, and colour is reserved for meaning: priority, project and label colours, status.
2. **Roomy, not sparse.** Generous padding, one idea per row, state before forms.
3. **One way to do a thing.** Every control comes from a primitive and every value from a token.
4. **Accessible by construction.** AA contrast, a visible focus ring, 44 px touch targets and reduced motion are enforced by tests, not left to review.
5. **Calm motion.** Short transitions, nothing bouncing in the way.

| | Keep (identity) | Evolve (craft) |
|---|---|---|
| Colour | emerald accent, slate neutrals, white / slate-950 | formal tokens, soft tints, canvas vs card surfaces |
| Mood | calm, honest, a little technical | roomier and friendlier |
| Space | | 4 px grid, 44–48 px rows, 16/24 px section gaps |
| Surfaces | | cards with soft elevation instead of bare sections and thin borders |
| Type | | bundled Inter, 15 px body, clear heading scale |
| Delight | | gentle motion and a satisfying completion state, respecting reduced motion |

## Tokens

Tokens are defined once in `web/src/index.css`:

- Raw values are `--ot-*` custom properties: light on `:root`, dark under `prefers-color-scheme: dark` and again under `[data-theme="dark"]`. The two dark blocks must stay identical (a unit test checks it). The app follows the system preference; the workbench sets `data-theme` to show both themes, also side by side.
- `@theme inline` maps them to Tailwind utilities that resolve per element, so a `[data-theme]` subtree switches too.
- The `dark:` variant uses the same two conditions.

| Group | Utilities | Notes |
|---|---|---|
| Surfaces | `bg-canvas`, `bg-surface`, `bg-raised`, `bg-sunken` | app background, cards and rows, popovers and dialogs, wells |
| Text | `text-strong`, `text-default`, `text-muted`, `text-faint`, `text-accent`, `text-on-accent` | each meets 4.5:1 on every surface it is allowed on |
| Borders | `border-default`, `border-input` | `input` meets 3:1 for control boundaries |
| Accent | `bg-accent`, `bg-accent-hover`, `bg-accent-soft`, `text-on-accent-soft`, `ring-focus`, `outline-focus` | emerald-700; focus ring 2 px with offset |
| Priority | `border-p1` … `border-p4`, `bg-p1-soft` … `bg-p4-soft` | red, orange, blue, slate |
| Status | `text-success`, `bg-warning-soft`, `text-on-danger-soft`, … | success, warning, danger, info, each with a soft step |
| Palette | `bg-hue-solid`, `bg-hue-soft`, `text-hue` under `data-hue="<name>"` | 12 hues for projects and labels |
| Type | `text-hint`, `text-meta`, `text-body`, `text-h3`, `text-h2`, `text-h1` | 11, 13, 15, 17, 20, 24 px; rem-based |
| Radius | `rounded-chip`, `rounded-control`, `rounded-card` | 6, 10, 14 px |
| Elevation | `shadow-1`, `shadow-2`, `shadow-3` | cards, popovers, dialogs; pair with a border in dark |
| Motion | `duration-(--duration-ui)`, `duration-(--duration-emphasis)`, `ease-calm` | 120 and 250 ms; reduced motion keeps only colour and opacity fades |

Rules for code under `web/src/ui/`:

- Use token utilities only. A raw palette class (`bg-slate-200`) or a hex literal fails `src/ui/tokens/lint.test.ts`. Screens in `web/src/app` are exempt until their redesign change migrates them.
- Before using a new foreground and background combination, add it to `src/ui/tokens/pairs.ts`. `contrast.test.ts` recomputes every pair from `index.css` in both themes and fails with the pair, theme and ratio.

The legacy classes `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.input` and `.kbd` keep their names and draw from the tokens. Use `.btn-secondary` for bordered neutral buttons.

## Stored colours

Projects, labels and views store a free hex string in their ops. At render time `hueFor()` in `web/src/ui/tokens/palette.ts` maps it to a palette hue: an exact canonical hex maps to itself, a grey (OKLCh chroma below 0.06) maps to slate, and anything else maps to the hue with the nearest hue angle. Components render `data-hue="<name>"` and use `bg-hue-soft text-hue`. Rendering never writes the stored value back; a colour picked in the UI stores the hue's canonical hex (`LABEL_PALETTE`).

## Typeface

Inter 4.1 is bundled as `web/src/assets/fonts/InterVariable-latin.woff2` (54 KB, weight axis only, Latin subset, licence in `OFL.txt`). It is served from the app's own origin, hashed by Vite and precached by the service worker; no font is ever requested from another host. The family is named `OpenTodo Inter`, so a locally installed Inter is never used instead, and `font-display: swap` shows the system font until it loads.

To regenerate it (fonttools 4.60.1):

```sh
python3 -m venv venv && ./venv/bin/pip install fonttools==4.60.1 brotli==1.1.0
curl -LO https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip && unzip Inter-4.1.zip
./venv/bin/fonttools varLib.instancer InterVariable.ttf opsz=14 -o inter-wght.ttf
./venv/bin/pyftsubset inter-wght.ttf \
  --unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20A0-20CF,U+2122,U+2190-21FF,U+2212,U+2215,U+FEFF,U+FFFD" \
  --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,tnum,cv11' \
  --flavor=woff2 --output-file=InterVariable-latin.woff2
```

Keep the `unicode-range` of the `@font-face` rule in `index.css` in step with `--unicodes`.

## The workbench

Storybook is a development tool only: it adds nothing to `internal/web/dist`, the Go binary or the container image, and a unit test fails if the production build contains Storybook code.

- `make storybook` (or `npm run storybook` in `web/`) opens it on http://localhost:6006. The toolbar switches the theme (light, dark, side by side) and the frame width (375 or 1280 px).
- `npm run build-storybook` writes the static build to `web/storybook-static/` (not committed).
- **Foundations** shows the colour tokens with their live contrast ratios, the palette, type, spacing, radius, elevation, motion and the legacy classes.

### Adding a story

Put a `*.stories.tsx` file next to the component, in Component Story Format. Stories render with fixture data only, never Dexie or the network. Cover the states that matter (default, disabled, error, long text) and check them in both themes and at 375 px.

## Checks

| Check | Runs in | Fails on |
|---|---|---|
| Token contrast, token lint, workbench exclusion | `npm test`, `make check` | a pair under its minimum; a raw colour in `web/src/ui`; Storybook code in the production build |
| Accessibility | `make ui-check`, CI job "UI check" | any serious or critical axe-core (WCAG 2.2 AA) violation in a story, light or dark |
| Visual regression | `make ui-check`, CI job "UI check" | a story × theme × width screenshot that differs from its baseline by more than 0.2% |

`make ui-check` needs Playwright and `@playwright/test` 1.56.1 installed globally, as CI does (`npm i -g playwright@1.56.1 @playwright/test@1.56.1 && playwright install chromium`). Set `PLAYWRIGHT_NODE_PATH` to use another install. Failures leave actual, expected and diff images in `web/test-results/ui-visual`, and CI uploads them as the `ui-check-report` artifact.

### Updating baselines

Font rendering differs between operating systems, so baselines are only generated inside the pinned Playwright image and stored under `web/src/ui/__screenshots__/`:

- With Docker: `make ui-baselines`, then review and commit the changed PNGs.
- Without Docker: run the **UI baselines** workflow on GitHub (Actions → UI baselines → Run workflow), download the `ui-baselines` artifact and commit its PNGs. For a story that has no baseline yet, the CI "UI check" job also writes one and fails; its `ui-check-report` artifact contains it under `web/src/ui/__screenshots__`.

Update baselines only for intended visual changes, in the same pull request as the change.
