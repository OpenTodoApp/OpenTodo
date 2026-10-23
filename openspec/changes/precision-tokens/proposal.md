# Proposal

## Why

The owner chose a redesign direction, "Precision": dense, near-monochrome, dark first, emerald as the only accent, colour only for state, after a reference board of Linear screens and two rounds of mock-ups (`design-references/round2/` in the session that made it; the tokens are in its `system.md`). Every later redesign change builds on its tokens, so they land first and alone: the shell (`precision-shell`) and the rows (`precision-rows`) follow.

Today's tokens are a step away from that direction in four ways:

- **The neutrals are lighter and bluer,** and the sidebar is tinted with the accent. Precision wants a flatter, darker slate with the sidebar on the plain canvas.
- **Surfaces stop at four** (canvas, surface, raised, sunken). Precision needs a popover surface, a hover tint, a selected nav item and a selected row, each a token instead of an ad-hoc `bg-sunken`/`bg-raised` pair per theme.
- **The type is larger:** 15 px body text and 13 px metadata. Precision's density comes from 13 px list text and 12.5 px metadata.
- **The radii and shadows are softer:** 10 px controls, 14 px cards, a shadow on every card. Precision uses 7 / 8 px and keeps shadows for overlays only.

## What Changes

- **Colour:** the canvas, surface, raised and sunken values, the three text tones, the hairlines, and the danger, warning and info tones take Precision's values in both themes. Every pair still meets its contrast minimum, checked by the existing contrast test.
- **New surface tokens:** `pop` (popovers, menus, tooltips, sheets), `hover`, `selected` (the selected nav item, an active tab or tool) and `selected-row`, plus `line-strong` for popover and selected-card edges, each in light, dark and high contrast, with their pairs added to the contrast test. The rule "the faint tone never sits on `selected`" is part of the pairs.
- **The sidebar sits on the canvas:** the accent tint is retired (`--ot-sidebar` is the canvas in every theme and accent).
- **Type:** list and control text is one token, `--ot-text-list`, 13 px (one line to switch to 14 px). Metadata is 12.5 px; labels, counts and key badges are 11.5 px at weight 500. Prose (notes, help articles, the display route) keeps 15 px through a new `text-prose` step. The page heading steps become 14 px (header title), 22 px (task and settings title) and the 28 px display step at weight 650.
- **Radius and elevation:** row 6, control 7, card 8, the inset surface 10 and popover 12 px. Cards and lists are flat: the first elevation becomes no shadow, and only overlays keep one.
- **Rows:** the row height token is 36 px with a fine pointer and 44 px with a coarse one. Compact density takes rows to 32 px.
- **Overlays** (popover, sheet, tooltip, menus) use `pop` with the strong edge. Ghost and secondary buttons hover on `hover`.
- **The dark browser bar colour** follows the new dark canvas.

Out of scope:
- The accent mechanism and the eight accent themes are unchanged: a theme still declares three values and derives the rest. In dark mode a button keeps the theme's light accent fill (system.md suggested a brighter fill; that would change every theme's on-accent colour and is left for later).
- Layout (the inset surface, page heads, sidebar toggle) is `precision-shell`; row anatomy is `precision-rows`.

## Capabilities

### Modified Capabilities

- `design-system`: semantic tokens gain the Precision surfaces; the reading scale, the surface styles and the accent-derivation note change.
- `appearance-preferences`: density values.
- `app-shell`: the sidebar's surface is the canvas (the tint requirement is retired) and its active row uses the selected token.

## Impact

- `web/src/index.css` (tokens, `@theme` utilities, component classes), `web/src/ui/tokens/*` (pairs, tests, bar colour), `web/public/appearance.js`, the overlay components.
- Almost every visual baseline changes; that is intended.
- Bundle: no new dependency; the stylesheet grows by a few lines.
