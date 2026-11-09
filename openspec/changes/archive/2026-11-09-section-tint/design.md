# Design

## Context

Section headers render through `SectionHeader` → `ListGroupHeader`, in the list (`bar`: a 32 px strip on the raised surface) and on the board (`bar={false}`: a plain heading on the column's surface). Calendar frames (`calendar-frames` D3) already tint a band with the hue's soft step mixed towards what lies under it.

## Decisions

### D1. Header only
The tint fills the header, never the rows or cards: a list keeps one surface for its tasks, and the header is enough to tell sections apart. On the board, the same component draws the column header, so the colour is a rounded strip of the same fill at the top of the column; the column's own surface is unchanged.

### D2. The recipe and its strength
`.ui-group-tint` is `color-mix(in oklab, var(--hue-soft) 50%, var(--ot-surface))`: the frame band's soft-step tint, made opaque on the surface so it reads the same on the list's canvas and on a board column in light and dark. The ratio is set by contrast, not taste: the header holds text (label), muted (actions) and faint (count, chevron, "n completed") tones. Measured over the stylesheet, the 16 shipped themes and the 200-seed sweep, mixing towards `raised` fails `faint` even at 20 % (Catppuccin Mocha), and towards `surface` 60 % fails `faint` on Dracula; 50 % on `surface` keeps every tone at 4.5:1 or more everywhere (lowest: `faint` 4.63:1 on Gruvbox Light's red). In high contrast the soft step is the surface, so the tint disappears, as every soft tint does there.

### D3. Measured like the past block
The fill is a derived step, `hue-<name>-tint` in `DERIVED_TOKENS`, with `text`, `muted` and `faint` pairs on it for every hue. `checkTheme` (the theme editor's runtime check) mixes it the same way, reading the ratio from `reference.json` (`mix.tint`, generated from `DERIVED_TOKENS`), so CI and the editor agree. A test checks that the stylesheet's rules for the past block and the tint use the same mix as `DERIVED_TOKENS`.

### D4. No accent on the tint
Accent pairs are re-measured for every built-in and custom accent by the accent deriver, which only knows the base surfaces. Rather than teach the first-load deriver a new surface, "Show" on a tinted header takes the default text tone; it stays a button with its hover fill.

## Data model and sync

None: the section's existing `color` field is read as before.

## Interface budget

No new row of chrome, property, destination, scroll region or shortcut: the header keeps its height and contents.

## Size

One CSS rule, a prop and a class switch in first-load JS (bytes); the theme check change is in the theme editor's lazy chunk. No dependency.
