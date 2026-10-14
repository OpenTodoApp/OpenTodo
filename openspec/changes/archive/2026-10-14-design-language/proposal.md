# Proposal

## Why

The web app works, but it looks cramped and inconsistent. 415 `text-sm` and 398 `text-xs` usages, emoji and Unicode glyphs standing in for icons, bare `<section>`s with no visual separation, menu items built as full-width ghost buttons, and button, input and colour classes repeated by hand in every file. There is no shared vocabulary for colour, type, space, radius or elevation, so every screen improvises and every redesign would start from scratch. Before the screens are redesigned (`settings-redesign`, `task-detail-redesign`, `labels-and-menus`), OpenTodo needs one deliberate visual language and a professional place to build and verify it.

## What Changes

- **A documented visual direction.** Friendly and roomy, in the spirit of TickTick, Todoist and Any.do, while **keeping OpenTodo's identity**: the emerald accent, slate neutrals and the white / slate-950 mood. It comes with written principles and a keep/evolve table.
- **Design tokens** as the single source of visual decisions, defined in Tailwind 4 `@theme` in `web/src/index.css` with semantic names and light and dark values:
  - surfaces: canvas, surface, raised, sunken
  - text: strong, default, muted, faint, on-accent
  - borders
  - accent and accent-soft
  - priority p1–p4
  - status: success, warning, danger, info
  - a 12-hue palette for projects and labels, each with solid and soft steps
  - type scale (15 px body), 4 px spacing base, radii 6/10/14/full, elevations 0–3, motion durations

  Every text and UI colour pair meets WCAG AA in both themes, checked automatically.
- **A bundled typeface.** Inter variable, latin subset, self-hosted woff2, served from the binary and precached by the service worker. No font CDN and no network call. The system font stack remains the fallback.
- **Legacy classes remapped onto tokens.** `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.input` and `.kbd` keep their names but draw from tokens, and a new `.btn-secondary` replaces the copy-pasted `btn-ghost border border-slate-300 …` pattern. The whole app shifts a little toward the new language on day one, without touching screens.
- **Stored colours stay as they are.** Existing label and project colours, stored as hex strings in ops, render through the palette: each maps to its nearest palette hue for its soft step. No op is written, and stored values are never rewritten.
- **A design workbench.** Storybook (Vite builder, React), dev-only, in `web/.storybook/`. It has a Foundations section (colour, type, space, radius, elevation, motion, icons) and is the home for every primitive and pattern story added by `ui-primitives`.
- **Quality gates** run on every story:
  - axe accessibility checks (with the existing `axe-core`)
  - Playwright visual regression of the static Storybook build in light and dark, at 375 px and 1280 px
  - a token contrast check

  The contrast check and a token lint run as unit tests, so they are covered by `npm test` and `make check`. The a11y and visual checks are a `make ui-check` target with its own CI job.
- **A migration plan and sequencing** for the sibling changes: `ui-primitives`, then `settings-redesign`, `task-detail-redesign` and `labels-and-menus`. Old and new styles coexist until each screen migrates.

No op schema, API, server or data change. No new environment variable.

## Out of scope

- Redesigning any screen. That belongs to `settings-redesign`, `task-detail-redesign` and `labels-and-menus`.
- Building primitives (Icon, Button, Combobox, Card, …) and replacing emoji with icons. That belongs to `ui-primitives`. This change only defines the tokens and the workbench those primitives use.
- A user-selectable accent colour or themes. The tokens make it possible later, but it is not part of this change.
- A user setting to override light/dark. The app keeps following the system preference.
- Date and time formatting (`date-time-preferences`), push testing (`push-test-delivery`) and backup restore (`backup-restore-web`).
- Changing any stored colour value or adding colour fields.

## ROADMAP

The original roadmap and "Bring your agent" are complete, and no existing item covers visual design. This change adds a new ROADMAP.md entry, **"Design refresh: one visual language, built in a workbench"**. It lists the change names `design-language`, `ui-primitives`, `settings-redesign`, `task-detail-redesign` and `labels-and-menus`, with `date-time-preferences`, `push-test-delivery` and `backup-restore-web` as related usability fixes.

Nothing here is **BREAKING**: no new mandatory environment variable and no op log format change.

## Capabilities

### New Capabilities
- `design-system`: the visual language contract. The tokens and their light/dark values, contrast guarantees, the bundled typeface, reduced-motion behaviour, how stored colours map to the palette, the legacy component classes, and the workbench with its accessibility and visual-regression gates.

### Modified Capabilities
<!-- None. Screen-level requirements change in the sibling redesign changes. -->

## Impact

- **Code:**
  - `web/src/index.css` (tokens, remapped component classes, `@font-face`)
  - `web/src/ui/tokens/` (palette mapping for stored colours, contrast pairs, token tests)
  - `web/src/assets/fonts/` (Inter woff2 and its OFL licence, hashed by Vite)
  - `web/.storybook/` and `web/src/ui/foundations/*.stories.tsx`
  - `scripts/ui-check/` (a11y and visual regression over the static workbench build)
  - Makefile (`storybook`, `ui-check`, `ui-baselines`), `.github/workflows/ci.yml` (new `ui-check` job)
- **Existing colour literals:** `TaskRow.tsx` priority rings and `QuickAdd.tsx` chip colours move to tokens. Other screens keep their literals until their redesign change.
- **Dependencies (dev-only):** `storybook`, `@storybook/react-vite`, `@storybook/addon-a11y`, `@storybook/addon-docs`. Playwright stays a global CI install, as it is today, with `@playwright/test` at the same pinned version.
- **Size:** zero bytes added to the app bundle from Storybook. A font budget of at most 110 KB, measured and recorded during apply, precached once. The Go binary grows by the same font bytes. The container image barely changes, and runtime memory doesn't change.
- **Docs:** `docs/` gains a short "Design system" contributor page (how to run Storybook and update baselines). `AGENTS.md` gets one line pointing at tokens and the workbench.
