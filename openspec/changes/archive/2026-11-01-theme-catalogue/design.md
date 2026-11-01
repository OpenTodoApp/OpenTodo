# Design: theme-catalogue

## Context

`theme-engine` defines the theme document (seeds, optional explicit tokens, bar, shape, type), derives missing tokens, applies a theme before the first paint, stores the choice per side as `builtin:<id>`, and measures every document in `web/src/lib/theme/builtin/` in CI. This change fills that folder with well-known editor palettes. Editor palettes are designed for code on one background; a task app needs more: three or more surface steps, four text tones, selection on rows, soft chips for 12 label hues, four status colours and four priorities. The work is the mapping, and proving it readable.

## Goals / Non-Goals

**Goals:** a small, recognisable catalogue that covers light and dark tastes; each theme faithful to its palette while passing every AA pair; licences and names verified and credited; no first-load cost.

**Non-Goals:** every variant of every family; syntax colours; changing fonts or corners per palette; fetching themes from anywhere.

## Decisions

### D1. The catalogue

| Theme id | Name | Kind | Project | Copyright line | Licence | Checked |
| --- | --- | --- | --- | --- | --- | --- |
| `solarized-light`, `solarized-dark` | Solarized Light, Solarized Dark | light, dark | github.com/altercation/solarized | Copyright (c) 2011 Ethan Schoonover | MIT (`LICENSE`) | 2026-11-01 |
| `gruvbox-light`, `gruvbox-dark` | Gruvbox Light, Gruvbox Dark | light, dark | github.com/morhetz/gruvbox | Copyright (c) 2018 Pavel Pertsev (licence file of gruvbox-community/gruvbox; the original README states MIT/X11) | MIT | 2026-11-01 |
| `catppuccin-latte`, `catppuccin-mocha` | Catppuccin Latte, Catppuccin Mocha | light, dark | github.com/catppuccin/catppuccin | Copyright (c) 2021 Catppuccin | MIT (`LICENSE`) | 2026-11-01 |
| `rose-pine-dawn`, `rose-pine` | Rosé Pine Dawn, Rosé Pine | light, dark | github.com/rose-pine/rose-pine-theme | Copyright (c) 2023 Rosé Pine | MIT (`license`) | 2026-11-01 |
| `tokyo-night-light`, `tokyo-night` | Tokyo Night Light, Tokyo Night | light, dark | github.com/enkia/tokyo-night-vscode-theme | Copyright (c) 2018-present Enkia | MIT (`LICENSE`) | 2026-11-01 |
| `one-light`, `one-dark` | One Light, One Dark | light, dark | github.com/atom/one-light-syntax, github.com/atom/one-dark-syntax (Atom's One themes) | Copyright (c) 2016 GitHub Inc. | MIT (`LICENSE.md`) | 2026-11-01 |
| `nord` | Nord | dark | github.com/nordtheme/nord | Copyright (c) 2016-present Sven Greb | MIT (`license`) | 2026-11-01 |
| `dracula` | Dracula | dark | github.com/dracula/dracula-theme | Copyright (c) 2023 Dracula Theme | MIT (`LICENSE`) | 2026-11-01 |

Fourteen palettes, sixteen themes with OpenTodo's two: seven light (six palettes and OpenTodo Light) and nine dark (eight palettes and OpenTodo Dark). Each light theme pairs with its family's dark one for people who use `system` mode; picking one side of a pair in Settings offers to set the other side too (one extra op, only when accepted).

None of these projects publishes trademark or naming terms (their READMEs and licence files were checked on 2026-11-01; none mention a trademark). The names are used to credit the palettes, as the many ports in other editors do, and `docs/themes.md` and the theme details say "OpenTodo is not affiliated with these projects". One Dark and One Light are named as the Atom themes are and credited to Atom's authors; "Atom" itself is not used as a theme name.

- *Alternative: more variants (Catppuccin Frappé and Macchiato, Rosé Pine Moon, Tokyo Night Storm).* Rejected for now: close siblings crowd the list and each costs a contrast proof and a review; custom themes cover them, and adding one later is a document and a row in this table.

### D2. Excluded palettes

- **GitHub (Primer).** The palette is MIT (`primer/github-vscode-theme`), but "GitHub" and "Primer" are GitHub's marks, and GitHub's logo and trademark guidance does not allow using its name in a way that suggests endorsement; a theme called "GitHub Light" inside another product does that. Renamed, the palette is just another cool grey and not recognisable, so it adds nothing over OpenTodo Light. Left out.
- **Monokai.** The original has no clear open licence, and Monokai Pro is a commercial product under the same name. Left out.
- **Material Theme.** The best-known VS Code version was withdrawn and relicensed in 2023; the terms of the name and of the remaining forks are unclear. Left out.
- A palette is added later only with the same checks: a licence file, no naming terms that forbid the use, and the entry in D1.

### D3. The mapping

Every palette is mapped by one written table, `web/src/lib/theme/builtin/MAPPING.md`, applied by hand into each document and reviewed:

- **Seeds.** `canvas`: the palette's darkest (dark) or lightest (light) background, the one its editors use behind the sidebar; `surface`: its main editor background; `text`: its main foreground; `accent`: the colour the palette's own UI uses for selection and buttons (Solarized blue, Gruvbox aqua or yellow as its authors' VS Code port uses, Catppuccin mauve, Rosé Pine iris, Tokyo Night blue, One blue, Nord frost `nord8`, Dracula purple). Status seeds: the palette's green, yellow, red and blue or cyan. *Implementation note:* as in OpenTodo Light, a light theme's canvas is the palette's panel colour and its surface the lighter editor background; where a palette has no separate panel colour (Solarized Dark, One, Nord, Dracula) canvas and surface are the same colour and the panel colour is `raised` or `selected`.
- **Explicit tokens.** `muted`: the palette's secondary foreground; `faint`: its comment colour; `raised`, `sunken`, `pop`, `hover`, `selected`: its panel, input, widget, hover and selection backgrounds where the palette defines them; `border`: its divider. Everything else is derived.
- **Label palette.** The palette's accent colours fill the 12 label hues by nearest hue; hues the palette lacks (palettes have six to eight accents) are derived from OpenTodo's hue at the palette's mean lightness and strongest chroma, so a project's colour stays recognisable and, in muted palettes (Nord), stays apart from its neighbours. *Implementation note:* the published values and the mapping are data in `web/src/lib/theme/catalogue/palettes.ts`, applied by `catalogue/generate.ts` (the fix-to-AA search on explicit values: OKLCH lightness in 0.0025 steps, hue kept, chroma clamped to sRGB); `catalogue.test.ts` checks the documents against both, so the mapping is reviewed as code and prose (`MAPPING.md`). In dark themes the palette's accent is the explicit `accent-text` and the button is derived from it: the derivation's own start for a failing dark accent text (OpenTodo's step above the button) moved bright palette accents (Dracula purple, Nord frost) almost to white.
- **Adapted values.** When a published colour misses its pair (Solarized's `base01` comment colour on `base03` reaches about 3.6:1 as text; Nord's `nord3` comment colour is darker still), the document uses the nearest lightness of the same hue that passes, found with `checkTheme` and the "fix to AA" search of `theme-engine`, and lists it under `notes.adapted` in the document so the change from the published palette is visible. The theme's details say "Some colours were adapted for contrast".
- `bar`: the canvas, as editors colour their title bar. Shape and type are not set (D5).

### D4. Credits in the app and the repository

- `web/src/lib/theme/builtin/CREDITS.md` holds each project's full MIT notice (copyright line and permission notice), as `web/src/assets/fonts/OFL.txt` does for the font. It is served in the built app at a fixed path for the details dialog's "Licence" link (same origin, no network beyond the server).
- Each card's credit line is "by <author>". **About this theme** (a button under the list whose chosen theme is a palette, rather than a menu on every card: a button inside a radio card is invalid nesting, and one control per list keeps the radio group's single tab stop) shows: name, author, licence, copyright line, the project's source as text (not a link that loads anything inside the app; a normal external link the user may follow), the "adapted for contrast" note and the "not affiliated" line.
- `docs/themes.md` gains a Catalogue section with a screenshot of each theme (taken by `make docs-screenshots`) and the same credits.

### D5. No font or radius changes in built-ins

Built-ins set colours only. A palette does not imply a typeface, and changing corners or the list text size on a palette switch would move layout under the person's hands. Custom themes may set shape and type (`theme-editor`).

### D6. Loading

`web/src/lib/theme/builtin/index.ts` lists ids, names, kinds, families, credits and preview swatches (1.4 KB gzip, generated by `catalogue.test.ts`); each document is its own lazy chunk (0.65 to 0.83 KB gzip) loaded through `lib/theme/load.ts`; Settings › Appearance loads the index, and the Theme row itself (`app/ThemeRow.tsx`, 1.7 KB) and About this theme (0.7 KB) are lazy too. The first-load choice reader (`choice.ts`) lists only OpenTodo's two themes: without the catalogue, a `builtin:` id it does not list reads as a theme provisionally, and the lazy loader answers whether this app has it and of which kind (an unknown or other-kind theme reads as the side's default); Settings passes the loaded catalogue for exact statuses ("Made with a newer version"). The active built-in is applied from the device's cache (`theme-engine` D5); only when the cache is missing or stale is its document and the derivation chunk loaded. The full catalogue is about 9 KB gzip; the first load is unchanged.

### D7. Tests

- The contrast loop of `theme-engine` already measures every document in the folder; this change adds `catalogue.test.ts`: every document validates, every id in the index has a document and a row in `CREDITS.md`, every `notes.adapted` value differs from its published value only in lightness (hue within 1°), every value not listed there is the published one, the index matches the documents, the 12 label solids are at least ΔE 8 apart (CIE76; OpenTodo's own themes pass the same measure), and pairs (light and dark of one family) name each other.
- Visual: one story per theme in the workbench (`Settings/App/Theme catalogue`) with the core pieces of the list (task rows), the board (cards), the calendar (the 12 label blocks, a past one) and a panel, drawn with the theme's tokens on a subtree, with baselines only for OpenTodo's two themes to keep CI lean (as `theming` decided); the picker with a palette chosen and the counterpart offer, and the About dialog, have baselines.

## Data model

None. The choice is `builtin:<id>` in `theme_light` or `theme_dark`. Ids are stable: a built-in is never renamed; one that must be withdrawn stays as an id that reads as the side's default.

## Bundle, binary and memory

About 9 KB gzip lazy for the catalogue; first load unchanged; no dependency; server unchanged.

## Risks / Trade-offs

- [A project changes its licence or publishes naming terms later] → the table records what was checked and when; a withdrawn theme's id keeps reading as the default, so nobody's app breaks.
- [Adapted colours disappoint fans of a palette] → only the pairs that fail are adapted, by lightness, and the details say so; readability is the non-negotiable.
- [Palettes with few accents make label hues look alike] → missing hues are derived from OpenTodo's hue circle; `catalogue.test.ts` requires the 12 solids to stay at least ΔE 8 apart from each other.

## Migration Plan

Additive. Rollback removes the documents; stored `builtin:` choices then read as the default and come back with the next version.

## Open Questions

- Should a Dracula light variant ("Alucard") be added once its project marks it stable? Not now.
