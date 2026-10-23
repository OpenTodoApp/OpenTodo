# Design

## Context

Precision's system sheet (`system.md`, round 2 of the redesign mock-ups) lists every token with its value and maps it to today's `--ot-*` token. This change applies that mapping to the stylesheet. The existing machinery stays: OKLCH token blocks for light and dark (two identical dark blocks), `@theme inline` utilities, three-value accent themes with derived steps, the high-contrast override, and the numeric contrast test over every allowed pair.

## Decisions

### D1. Colour: new values in the existing tokens, five new tokens

The hex values of system.md are converted to OKLCH (the token lint refuses anything else in a token block).

| Token | Dark | Light | Notes |
|---|---|---|---|
| canvas | 0.1635 0.0045 264 | 0.9542 0.0034 248 | the sidebar's background too |
| surface | 0.1959 0.0062 271 | 1 0 0 | the inset content surface |
| raised | 0.2184 0.0079 275 | 0.9757 0 0 | group bars, cards, inputs: a step, not a lift |
| sunken | 0.1824 0.0063 271 | 0.9632 0.0034 248 | board columns, wells |
| pop (new) | 0.2271 0.0079 275 | 1 0 0 | popovers, menus, tooltips, sheets |
| hover (new) | 0.2141 0.008 275 | 0.9787 0 0 | row, nav and button hover |
| selected (new) | 0.2728 0.0097 268 | 0.9333 0.0046 258 | the selected nav item, an active tab or tool |
| selected-row (new) | 0.2389 0.0082 264 | 0.9632 0.0034 248 | a selected row |
| line-strong (new) | 0.3122 0.0099 261 | 0.878 0.0064 255 | popover and selected-card edges |
| text-strong, text | 0.9459 0.0029 265 | 0.2126 0.0067 258 | one value: system.md folds strong into text |
| muted | 0.7273 0.0111 262 | 0.491 0.0142 260 | |
| faint | 0.66 0.0147 262 | 0.5145 0.0133 252 | dark is a hair lighter than system.md's 0.632, so it keeps 4.5:1 on the accent-soft row tint and the dimmed calendar fills |
| border | 0.2641 0.008 264 | 0.905 0.0046 258 | light a step darker than system.md so the hairline keeps 1.1:1 on the darker canvas |
| border-soft | 0.255 0.0082 264 | 0.915 0.0046 258 | the same reason |
| danger, warning, info | 0.6986 0.158 24 / 0.7665 0.130 73 / 0.6988 0.133 260 | 0.5283 0.180 27 / 0.4921 0.110 66 / 0.5071 0.162 260 | |

- **The light yellow and green label hues** are one step darker (0.645 and 0.61 lightness) so they keep 3:1 on the darker light canvas. Their soft and text steps are derived, as before.
- **The sidebar tint is retired.** `--ot-sidebar` is the canvas in every mode and accent block, and the two sidebar mix ratios are removed. The token still exists, so screens and pairs that name it keep working until `precision-shell` restyles the sidebar.
- **`border-input` keeps its role and value.** system.md maps the control edge to `line-strong`, but an input's edge must reach 3:1 (WCAG non-text contrast) and `line-strong` is 1.6:1 by design. Inputs keep the accessible edge; popovers and selected cards use `line-strong`.
- **The accent mechanism is unchanged** (proposal, out of scope).

### D2. Type: one list token, a prose step

- **`--ot-text-list` (13 px)** is the value behind `text-body`. One line switches the whole interface's list and control text to 14 px (`0.875rem`); the owner hasn't confirmed 13 px at reading distance yet.
- **`text-prose` (15 px)** is new, for running text people read rather than scan: the notes editor and comment composer, help articles, and the display route's base size. The briefing on day pages (`precision-shell`) uses it too.
- **The rest of the scale:**
  - `text-meta` is 12.5 px;
  - `text-hint` is 11.5 px at weight 500, for labels, counts and key badges;
  - `text-h3` is 14 px, the compact header title;
  - `text-h1` is 22 px, the task and settings page title;
  - `text-display` stays 28 px, at weight 650.
- **The reading-scale rule moves:** text under 12 px was reserved for key badges. Now it is reserved for key badges, section labels and counts, all at the hint step.

### D3. Radius

The steps are chip and row 6, control 7, card 8, surface 10 (new) and popover 12 (new). They stay named steps, so the "no raw radius in screens" lint is unchanged.

### D4. Elevation

- **`shadow-1` is no shadow:** cards and lists are flat, separated by surface steps and hairlines.
- **Overlays keep `shadow-2` and `shadow-3`.** The `surface-overlay` class becomes `pop` with the strong edge and the popover radius.

### D5. Rows and density

- **The row height token** is 36 px with a fine pointer and 44 px with a coarse one (system.md: phone rows 44).
- **Density:** Comfortable is now the 36 px row. Compact keeps its smaller padding, which gives 32 px rows; touch targets stay 44 px.

### D6. Browser bar

The dark bar colour (`DARK_BAR`, `appearance.js`) is the new dark canvas, `#0d0e10`; the light bar stays the accent.

## Risks

- **Every screen changes at once:** hundreds of visual baselines are regenerated in this change, and the shell and rows follow shortly. Mitigation: the three changes are reviewed with side-by-side screenshots against the mock-ups.
- **13 px may read small** for some people. Mitigation: one token, and the browser's font-size setting still scales everything (rem units).
