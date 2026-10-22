---
title: Design system
summary: The visual language for contributors: principles, design tokens, the bundled typeface, the Storybook workbench and the accessibility and visual-regression checks.
audience: developer
section: Internals
specs: [design-system]
screens: []
order: 30
---
# Design system

OpenTodo's interface is friendly and roomy, in the spirit of TickTick, Todoist and Any.do, and keeps its own identity: the emerald accent, calm slate neutrals, white cards in light and a dark slate canvas lifted off pure black, so dark surfaces separate by lightness. Every colour, size, radius, shadow and duration comes from a design token, and every shared building block is developed and checked in a workbench. The contract lives in the `design-system` OpenSpec capability; this page is the how-to. How a screen is put together (the page template, the panel, settings, rows and the interface budget) is in the [Interface guide](interface-guide.md).

## Principles

1. **Content first.** Chrome is neutral, and colour is reserved for meaning: priority, project and label colours, status.
2. **Roomy, not sparse.** Generous padding, one idea per row, state before forms.
3. **One way to do a thing.** Every control comes from a primitive and every value from a token.
4. **Accessible by construction.** AA contrast, a visible focus ring, 44 px touch targets and reduced motion are enforced by tests, not left to review. A phrase for screen readers ("3 comments" for a chip showing "3") is visually hidden text inside the element (`ReadAs` in `web/src/ui/Chips.tsx`), never an `aria-label` on a `span` or `div` without a role, which screen readers ignore; `npm run lint` refuses that.
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
| Text | `text-strong`, `text-default`, `text-muted`, `text-faint`, `text-accent`, `text-on-accent` | the four tones; each meets 4.5:1 on every surface it is allowed on |
| Borders | `border-default`, `border-soft`, `border-input` | a container edge, a softer divider, a control edge (3:1); the first two stay at 1.1:1 or more on every surface |
| Accent | `bg-accent`, `bg-accent-hover`, `bg-accent-soft`, `text-on-accent-soft`, `ring-focus`, `outline-focus` | emerald-700; focus ring 2 px with offset |
| Priority | `border-p1` … `border-p4`, `bg-p1-soft` … `bg-p4-soft` | red, orange, blue, slate |
| Status | `text-success`, `bg-warning-soft`, `text-on-danger-soft`, … | success, warning, danger, info, each with a soft step |
| Palette | `bg-hue-solid`, `bg-hue-soft`, `text-hue` under `data-hue="<name>"` | 12 hues for projects and labels |
| Type | `text-hint`, `text-meta`, `text-body`, `text-h3`, `text-h2`, `text-h1`, `text-display` | 11, 13, 15, 17, 20, 24, 28 px; rem-based; headings and display are weight 600 with tracking −0.01em (h2), −0.015em (h1) and −0.02em (display) |
| Radius | `rounded-chip`, `rounded-control`, `rounded-card` | 6, 10, 14 px |
| Elevation | `shadow-1`, `shadow-2`, `shadow-3` | cards, popovers, dialogs; pair with a border in dark |
| Motion | `duration-(--duration-ui)`, `duration-(--duration-emphasis)`, `duration-(--duration-moment)`, `ease-calm`, `ease-spring` | Three durations: 120 ms for interface feedback, 250 ms for emphasis and the 400 ms moment, reserved for the completion sequence, list reflow and overlay entrances; nothing lasts longer and an exit takes about three quarters of its entrance. `ease-spring` is an ease-out that settles without overshoot (nothing bounces). Reduced motion keeps only colour and opacity fades of at most 120 ms and skips view transitions; `data-motion="none"` zeroes all three, so everything is instant |

Rules for code under `web/src/ui/`:

- Use token utilities only, in shared components, screens (`web/src/app`) and the component classes of `index.css`. A raw palette class (`bg-slate-200`), a fixed `bg-white`/`text-black`, a hex literal or a literal colour function (`rgb(148 163 184 / 0.35)`, `hsl()`, `oklch()`; `color-mix()` over tokens is fine) fails `src/ui/tokens/lint.test.ts`, which names the file and line. A hex passed as `color=` is stored data and allowed. Screens that an open change is rewriting sit on the lint's named allow-list, which may only shrink.
- Choose a token by what the colour **means**, not by its hue today. Emerald is both the accent and the success colour, and only the meaning keeps them apart when a theme changes the accent:

| Meaning | Tokens |
| --- | --- |
| Card, panel, input background | `bg-surface` |
| Page background | `bg-canvas` |
| Well, inset, hover tint | `bg-sunken` (dark hovers `dark:hover:bg-raised`) |
| Body text, headings | `text-default`, `text-strong` |
| Secondary text | `text-muted` |
| Hints, placeholders | `text-faint`, `placeholder-faint` |
| Card and container edges, dividers between groups, input borders | `border-default`, `border-soft`, `border-input` |
| Actions, links, selection, focus, current navigation | `bg-accent`, `text-accent`, `bg-accent-soft` with `text-on-accent-soft`, `ring-focus`, `text-on-accent` on the accent |
| Done, saved, connected | `text-success`, `bg-success-soft` with `text-on-success-soft` |
| Errors, destructive actions | `text-danger`, `border-danger`, `bg-danger-soft` with `text-on-danger-soft` |
| Cautions | `text-warning`, `bg-warning-soft` with `text-on-warning-soft` |
| Neutral notices | `text-info`, `bg-info-soft` with `text-on-info-soft` |
| Task priority | `p1` to `p4` |
| Overlay scrim, search highlight | `bg-scrim`, `bg-highlight` |

A token switches between light and dark by itself, so a screen needs no `dark:` partner for colour.
- Before using a new foreground and background combination, add it to `src/ui/tokens/pairs.ts`. `contrast.test.ts` recomputes every pair from `index.css` in both themes and every accent and fails with the pair, theme and ratio.
- **Tones, not opacity.** To make text or an icon quieter, step down one tone: `text-strong`, `text-default`, `text-muted`, `text-faint`. An icon takes the tone of its text (`currentColor`). An `opacity-*` utility or an alpha suffix (`text-default/70`, `border-soft/50`) on text or a border fails the lint; show and hide (`opacity-0`, `opacity-100`) and disabled states are fine, and a dragged ghost, a fading row or the scrim carry `tone-lint-allow` on the line with the reason. Every number (a time, a count, a duration) goes through a primitive that sets `tabular-nums`.

### Colour in OKLCH

Every colour token is written in OKLCH: an `oklch(L C H)` literal inside the sRGB gamut, or a `color-mix()` over other tokens. A hex, `rgb()`, `hsl()` or named colour inside a token block fails the lint with the stylesheet line. The browser resolves everything; the tests resolve the same values with `src/ui/tokens/resolve.ts` (OKLCH, mixes and alpha composited over the real surface) and measure what is drawn.

- **Neutrals** are the slate family with low chroma, the same in every theme. Light: canvas `oklch(0.985 0.003 250)`, surfaces white, sunken `oklch(0.965 0.004 250)`. Dark: canvas `oklch(0.17 0.016 262)`, surface `oklch(0.22 0.018 262)`, raised `oklch(0.27 0.02 262)`, sunken `oklch(0.14 0.014 262)`; dark borders are translucent white (10 % for the edge, 6 % for the divider).
- **An accent theme declares three values** in its `[data-accent]` block: `--ot-al-accent` (the light accent, also the browser bar colour), `--ot-ad-accent-text` (the bright accent for dark text, focus and the chart) and `--ot-a-on-accent` (text on the accent). Hover, soft, soft text and focus derive from them. A derived step that misses its minimum may be overridden in the accent block next to a comment naming the pair; `theme.test.ts` counts the overrides (today one: graphite's dark buttons).
- **A palette hue declares one solid per mode**; its soft and text steps derive.
- **The ratios** are `--ot-mix-*` custom properties in the `:root` block, read back by the tests:

| Step | Light | Dark |
| --- | --- | --- |
| Accent hover | 86 % accent toward black | same |
| Accent soft | 10 % accent into the surface | 14 % bright accent into the surface |
| Accent soft text | 80 % accent toward black | 80 % bright accent toward white |
| Focus | 85 % accent toward white | the bright accent |
| Hue soft | 14 % solid into the surface | 22 % solid into the canvas |
| Hue text | 68 % solid toward black | 78 % solid toward white |

Steps toward black or white mix `in oklch`, which keeps the hue; steps into a surface mix `in oklab`, because the dark surfaces are slightly blue and an OKLCH mix would turn the hue toward them. A browser without OKLCH gets six plain surface and text values from an `@supports` fallback: readable, not themed.

### High contrast and no motion

Two root attributes change the presentation for screens that ask for them (OpenSpec `display-mode`, design-system "High-contrast and no-motion presentation"):

- `data-contrast="high"` on `<html>` overrides the `--ot-*` tokens: every surface is pure white (light) or pure black (dark), text is black or white with secondary text still at 7:1 or more, soft tints become the surface (an outline keeps their shape), borders and the focus ring are full black or white, and the priority and status hues are darkened (light) or lightened (dark) to 7:1 as text and 3:1 as marks. The blocks are `html:root[data-contrast="high"]`, the system-dark branch and `[data-theme="dark"]`; their selectors outrank the mode and accent blocks, so the override combines with any mode and accent. The two dark blocks must stay identical.
- `data-motion="none"` sets `--duration-ui`, `--duration-emphasis` and `--duration-moment` to `0ms` and makes every transition and animation instant, stricter than the reduced-motion query (colour and opacity do not fade either).

Only the display routes set them, on mount, and remove them on unmount (`useRootPresentation` in `web/src/app/display/displayHooks.ts`); they never touch the user's theme or preferences. `OVERRIDE_PAIRS` in `src/ui/tokens/pairs.ts` holds the override's pairs with raised minimums (7:1 for text and chips, 3:1 for the rest), and `contrast.test.ts` measures them in both modes and names the pair, the override and the ratio when one fails. The workbench shows the override in **Foundations → Colours → High Contrast Override**. The display's large type is not a token: `.display-root` multiplies the type tokens by `--display-scale` (1.35, 1.6 and 2.15 for the `m`, `l` and `xl` sizes), so it still follows the browser's font size.

The legacy classes `.btn-*`, `.input` and `.kbd` are gone: screens use `<Button>`, `<IconButton>`, the field primitives and `<Kbd>` (or the `ui-btn`, `ui-input` and `ui-kbd` classes they render), and `lint.test.ts` fails if a legacy class returns to the stylesheet or a screen.

## Stored colours

Projects, labels and views store a free hex string in their ops. At render time `hueFor()` in `web/src/ui/tokens/palette.ts` maps it to a palette hue: an exact canonical hex maps to itself, a grey (OKLCh chroma below 0.06) maps to slate, and anything else maps to the hue with the nearest hue angle. Components render `data-hue="<name>"` and use `bg-hue-soft text-hue`. Rendering never writes the stored value back; a colour picked in the UI stores the hue's canonical hex (`LABEL_PALETTE`).

## Typeface

Inter 4.1 is bundled as `web/src/assets/fonts/InterVariable-latin.woff2` (84 KB, weight and optical-size axes, Latin subset, licence in `OFL.txt`). `font-optical-sizing: auto` lets text at the display size use Inter's Display cut. It is served from the app's own origin, hashed by Vite and precached by the service worker; no font is ever requested from another host. The family is named `OpenTodo Inter`, so a locally installed Inter is never used instead, and `font-display: swap` shows the system font until it loads.

To regenerate it (fonttools 4.60.1):

```sh
python3 -m venv venv && ./venv/bin/pip install fonttools==4.60.1 brotli==1.1.0
curl -LO https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip && unzip Inter-4.1.zip
./venv/bin/pyftsubset InterVariable.ttf \
  --unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20A0-20CF,U+2122,U+2190-21FF,U+2212,U+2215,U+FEFF,U+FFFD" \
  --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,tnum,cv11' \
  --flavor=woff2 --output-file=InterVariable-latin.woff2
```

Keep the `unicode-range` of the `@font-face` rule in `index.css` in step with `--unicodes`.

## Building blocks

Screens import shared UI from `web/src/ui/` (re-exported from `web/src/ui/index.ts`); they don't hand-build buttons, menus or pickers.

### Icons

One line-icon set, vendored from [Lucide](https://lucide.dev) (ISC licence in `web/src/ui/icons/LICENSE-lucide.txt`); there is no icon dependency at runtime. Use `<Icon name="bell" />`: it draws in the current text colour and is hidden from assistive technology. Give it a `label` only when the icon itself carries meaning; an icon-only control gets its name from the control (see `IconButton`).

Emoji and Unicode symbols are not icons: `make check` runs `scripts/ui-check.mjs`, which fails on a glyph used as an icon in `web/src/app` (typography inside copy, such as "Settings → Integrations", is fine).

To add an icon, add its Lucide name to `web/src/ui/icons/names.json` and regenerate:

```sh
npm pack lucide-static@1.48.0 && tar xzf lucide-static-1.48.0.tgz
node scripts/icons-sync.mjs ./package
```

The script is idempotent. A unit test fails when a vendored icon is used nowhere (or listed as reserved for a planned screen change), so the set doesn't grow unnoticed.

### Brand

The mark is an open loop whose free end turns into a tick: the loop centred at (12, 13) with radius 8 on a 24-unit grid, a 2-unit stroke with round caps, the opening at the top right (70°) so the tick escapes through it and the two never touch at 16 px. It never sits in a square or a checkbox, and the wordmark is never part of it.

- **Source**: `web/src/ui/icons/brand.svg`, under 2 KB, two symbols: `mono` and `colour`. Every other brand file is generated from it.
- **In the interface**: `<BrandMark size={24} />` (sizes 16, 20, 24, 32) draws `mono`, in `currentColor` with the tick's short stroke in `--ot-accent-text`, so it takes the tone of its row and the theme's accent. `<BrandWordmark />` is the text "OpenTodo" in the strong tone, set in the bundled Inter; it is never translated. Both come from the `ui` barrel; no screen uses an image of the icon.
- **Elsewhere**: `colour` is the mark in emerald on a slate rounded square, the same in every theme, because it sits on other people's surfaces: the favicon, the manifest icons (192 and 512 px, a 512 px maskable icon that fills its square), the Apple touch icon, the browser extension's icons and `brand/` in the site bundle.
- **Regenerating**: `make brand-icons` (`scripts/brand-icons.mjs`) renders every raster in the Chromium that Playwright brings, with no image dependency, and writes `web/src/ui/icons/brand-icons.json` with the hash of the source and of each file. `scripts/brand-icons.test.mjs` (in `make repo-check` and `make test-extension`) fails when the source changed without regenerating or a raster was edited by hand.

The `Foundations/Brand` story shows the mono mark at every size beside a row's checkbox in two accent themes; its 16 px baseline is the legibility check.

### Illustrations

Empty and finished states may show one calm line drawing above their sentence (the first is Inbox zero). Each lives in its own file in `web/src/ui/illustrations/` as inline SVG and follows one style, so later ones match:

- strokes in `currentColor` (the wrapper sets the muted text colour), `strokeWidth="1.5"` at 160 × 120 px, round caps and joins;
- the sunken surface (`var(--color-sunken)`) as the only shape fill, plus at most one accent shape at 15 % opacity (`var(--color-accent)`);
- no hex or `rgb()` colours, gradients, filters, shadows, text, raster or external images, and no animation;
- decorative: hidden from assistive technology, since the sentence beside it says everything;
- at most 4 KB per file.

The set, each a brief for the next drawing as much as a list:

| Name | Where | Motif | Accent shape |
| --- | --- | --- | --- |
| `inbox-zero` | Empty Inbox, end of Process the Inbox | An empty tray with a leaf beside it | the leaf |
| `today-clear` | Empty Today | A mug from the side with two steam lines, a small sun upper right | the sun |
| `week-clear` | Empty Upcoming | Seven small rounded squares on a baseline, the first raised | the raised square |
| `project-new` | A project with no open task | An open box, lid tilted back, a pencil leaning on its edge | the pencil's cap |
| `day-done` | Done for today (Close the day) | A closed notebook with a ribbon, a crescent moon above | the moon |
| `trash-empty` | Empty Trash | A bin with its lid on top and one leaf beside it | the leaf |

No faces, people or mascots: each motif names the state in one glance and needs no translation of tone. Settings and error pages have no illustration.

Name it in `Illustration.tsx` and pass that name to the empty-state pattern (`<EmptyState illustration="inbox-zero" …/>`); add it to `Illustrations.stories.tsx` so the workbench checks it in light and dark. `make ui-lint` fails on a file that breaks the colour, image, text or size rules.

### Buttons

`<Button variant size icon iconEnd>` with `primary`, `secondary`, `ghost` and `danger`, sizes `sm` (32 px), `md` (40 px) and `lg` (48 px). When `onClick` returns a promise, the button shows a spinner, sets `aria-busy` and ignores further clicks until it settles. `<IconButton icon label>` is the icon-only form; `label` is required and becomes the accessible name and the tooltip.

### Form controls

Wrap a control in `<Field label description error>`: the label, the description and the error are wired to the control (`aria-describedby`, `aria-invalid`). `Input`, `Textarea` and `Select` are styled native elements; use `Select` for small fixed sets (role, sort order) and the Combobox for choosing an entity. A setting that applies immediately is a `Switch` (`role="switch"`); a choice submitted with a form is a `Checkbox` (with an indeterminate state).

### Menus

Action menus use the overlay `Menu` with `kind="menu"` and contain `MenuItem`, `MenuGroup` and `MenuSeparator`. Items take an `icon`, a `shortcut` hint (shown and announced), a `description` (for example why an item is unavailable), `danger` (placed last, in its own group), `disabled` and `checked` for toggles. The menu opens on its first item; ↑/↓ wrap, Home/End jump, typing a letter moves to the next item starting with it, and choosing an item closes the menu and returns focus to its button. Panels that contain form controls keep `kind="dialog"`.

### Smart picker (Combobox)

`<Combobox>` is a field whose list opens anchored to it from 640 px up and as a bottom sheet below; `<ComboboxPanel>` keeps field and list together inside a dialog. Both follow the ARIA combobox pattern: focus stays in the field, ↑/↓ move the active option, Enter picks, Escape closes, and the number of results is announced.

- **Ranking:** with an empty query, `pinned` keys come first (for example "Unassigned" and "You"), then the options picked most often and most recently in that `rankContext` on this device (each pick halves in weight every 14 days), then the source order. A tree (`getPath`) keeps its shape and shows recent picks in a "Recent" group on top. Pick history lives in the device-local `pickHistory` table: it is never synced or exported and is cleared on sign-out.
- **Matching:** case- and accent-insensitive. An exact label beats every query word being a word prefix (in the label or `getSecondary`, such as an email), which beats letters in order (fuzzy, two characters or more). Matches are highlighted; a nested match shows its path.
- **Sources:** an array, or `(query, signal) => Promise<{ items }>` for large or remote sources (debounced 120 ms, aborted per keystroke, stale answers ignored, with loading and empty states). Above 200 options the list is windowed; 10,000 options stay under 16 ms per keystroke.
- **Creating:** with `onCreate`, a "Create “query”" option comes last when nothing matches exactly. `multiple` keeps the picker open and clears the query after each pick.

### Surfaces and patterns

`Card`, `Badge` (soft or solid, any palette hue or stored colour), `Avatar` (initials on a colour derived from the account id, the same on every device), `Tabs` (arrow keys, Home/End), `EmptyState` and `Timeline` (events and comment threads). For settings: `SettingsSection` (a titled card with one line that may end with a **Learn more** link, `learnMore`, opening the card's guide section; never a header action) and `SettingRow` (label and state beside the control, stacked on phones), both fed by the settings copy table (`web/src/lib/settingsCopy.ts`; limits in the [interface guide](interface-guide.md#copy)). `ConfirmDialog` replaces `window.confirm` (focus starts on Cancel; a destructive one ignores taps outside); the app never uses the browser's `confirm()` or `prompt()`, and code never finds elements by translated text (use a `data-*` attribute), and `ListRow` is the focusable row for lists with a trailing menu.

Five surface styles, each a class in `@layer components` built from tokens (`Foundations/Surfaces` in the workbench):

| Style | Class | Used for |
|---|---|---|
| Card | `surface-card`, `SettingsSection tier="primary"` | statistics tiles, the one primary settings card |
| Flat section | `ui-section-flat` | other settings sections, statistics panels |
| Column | `ui-column`, `ui-cards--lift`, `ui-drop-placeholder` | board columns, lifting cards, where a dragged card lands |
| Block | `ui-block` (`--row`, `--dashed`, `--past`, `--late`) | calendar blocks, Month and Plan rows, timeline bars |
| Event | `ui-block--event`, `ui-block-dot` | events from other calendars |

A block reads `data-hue`: the soft hue as fill, a 3 px solid edge, `text-strong`. `--past` mixes the fill toward the surface and uses `text-faint` (measured per hue in the contrast pairs); `--late` takes the danger pair whatever the hue.

## The workbench

Storybook is a development tool only: it adds nothing to `internal/web/dist`, the Go binary or the container image, and a unit test fails if the production build contains Storybook code.

- `make storybook` (or `npm run storybook` in `web/`) opens it on http://localhost:6006. The toolbar switches the theme (light, dark, side by side) and the frame width (375 or 1280 px). A third switch picks the interface language: a story then renders with that language's catalog (loaded the way the app loads it) and `lang` set on the frame, which shows where a longer German or French label wraps. The accessibility gate and the visual baselines always run in English.
- `npm run build-storybook` writes the static build to `web/storybook-static/` (not committed).
- **Foundations** shows the colour tokens with their live contrast ratios, the palette, type, spacing, radius, elevation and the component classes. **Foundations → Motion** plays each sequence with a Play control over seeded rows: the completion on a row and on a card, the repeating completion, a list reflow, the dialog, the phone sheet, the task panel and the toast (OpenSpec `motion-v2`).

### Adding a story

Put a `*.stories.tsx` file next to the component, in Component Story Format; `make check` fails when a component in `web/src/ui` has no stories file importing it. Interaction tests opt into a DOM with `// @vitest-environment happy-dom` and use the helpers in `web/src/ui/test-utils.tsx`. Stories render with fixture data only, never Dexie or the network. Cover the states that matter (default, disabled, error, long text) and check them in both themes and at 375 px.

Every entry of the screen inventory, rare ones included, names the story that shows it. Screen stories seed the local database through `withSeed` in `web/src/app/stories/fixtures.tsx`. A screen that reads one answer from the server by a token (a reset or invitation preview, a public list) gets it from `answerRequests`, which answers listed paths with a fixture and every other request with 404, so the whole screen renders as a visitor sees it.

## Checks

| Check | Runs in | Fails on |
|---|---|---|
| Token contrast, token lint, workbench exclusion | `npm test`, `make check` | a pair under its minimum; a raw colour in `web/src/ui`; Storybook code in the production build |
| Accessibility | `make ui-check`, CI job "UI check" | any serious or critical axe-core (WCAG 2.2 AA) violation in a story, light or dark; on a `Screens/*` story, an element that shows no focus ring when tabbed to (elements of the first run are listed in `scripts/ux-audit/focus-exempt.json` until their fix) |
| Story coverage | `make ui-lint` (`scripts/ux-audit/stories.mjs`) | a core screen of the inventory without its story; rare screens are listed, not failed |
| Visual regression | `make ui-check`, CI job "UI check" | a story × theme × width screenshot that differs from its baseline by more than 0.2% |
| Motion | `make ui-check` (`scripts/ui-check/motion.mjs`) | a Foundations → Motion story that, with reduced motion emulated, runs an animation changing `transform`, `translate`, `scale`, `height`, `block-size`, `width` or `inline-size`, or that runs any animation under `data-motion="none"`; it names the story and the property |

`make ui-check` needs Playwright and `@playwright/test` 1.56.1 installed globally, as CI does (`npm i -g playwright@1.56.1 @playwright/test@1.56.1 && playwright install chromium`). Set `PLAYWRIGHT_NODE_PATH` to use another install. Failures leave actual, expected and diff images in `web/test-results/ui-visual`, and CI uploads them as the `ui-check-report-<shard>` artifact of the visual regression shard that failed.

### Updating baselines

Font rendering differs between operating systems, so baselines are only generated inside the pinned Playwright image and stored under `web/src/ui/__screenshots__/`:

- With Docker: `make ui-baselines`, then review and commit the changed PNGs.
- Without Docker: run the **UI baselines** workflow on GitHub (Actions → UI baselines → Run workflow), download the `ui-baselines` artifact and commit its PNGs. For a story that has no baseline yet, the CI "UI check (visual regression)" job also writes one and fails; its `ui-check-report-<shard>` artifact contains it under `web/src/ui/__screenshots__`.

Update baselines only for intended visual changes, in the same pull request as the change.

## The interface audit

The workbench checks stories; the audit checks the built app. `make ux-audit` starts a throwaway server, seeds it the way the layout check does, and opens every entry of the screen inventory (`scripts/ux-audit/screens.json`: every route, settings section, signed-out screen, display route and the main overlays) at 360, 768 (both with touch) and 1280 px, light and dark, in English and German. It writes `ux-audit-report/index.html`, a contact sheet with a screenshot of each capture and the findings ranked, and `report.json`. CI runs it on every code change as the "Interface audit" job and uploads the report; it does not block a pull request.

| Id | Measures | Limit |
| --- | --- | --- |
| M1, M9 | axe-core, WCAG 2.2 AA; contrast reported apart | no serious or critical issue |
| M2 to M5 | the interface budget: chrome rows, a row's metadata, primary destinations, vertical scrollers | `web/src/app/budget.json` |
| M6 | an element or the page wider than the viewport, outside `data-scroll-x` | none |
| M7 | target size | 44 px on touch; 24 px, or 24 px of space around it, with a mouse |
| M8 | focus: Tab through the screen at 1280 px | a ring on every focusable element |
| M10 | text cut with an ellipsis | its full text in the accessible name, the tooltip (`data-tip`) or an `sr-only` neighbour |
| M11 | two controls overlapping | at most 4 px |
| M12 | layout shift from navigation to idle | 0.1 |
| M13 | the first task row on a second visit with the server stopped | reported |
| M14 | story coverage of the core screens | none missing |
| M15 | movement under reduced motion (completing a task, opening the panel and a dialog) | none |

German captures cover every screen; overlays are opened in English, because their openers find controls by name. A finding seen only in German is marked so (M16). Each finding is scored by severity (4 blocks a task, 3 slows it, 2 breaks a guideline, 1 is cosmetic) times how often the screen is used (3 daily, 2 weekly, 1 rare), and the report lists the highest first.

`ONLY` (inventory ids), `WIDTHS`, `THEMES`, `LANGS`, `CONCURRENCY` and `OUT_DIR` narrow a local run. With `UX_AUDIT_STRICT=1` the audit exits non-zero on budget, overflow and story-coverage findings; in CI the repository variable `UX_AUDIT_STRICT` turns that on. The measurements have fixture tests in `scripts/ux-audit/measure.test.mjs` (one passing and one failing case each), and `scripts/ux-audit/ux-audit.test.mjs` keeps the inventory in step with the router and the layout check.
