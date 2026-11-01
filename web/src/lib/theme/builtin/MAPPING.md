# How the built-in palettes map onto OpenTodo's tokens

The built-in themes other than OpenTodo's own (OpenSpec change `theme-catalogue`, design D3) take their colours from editor palettes. An editor palette is made for code on one background; a task app needs surface steps, four text tones, selection, soft chips for 12 label colours, four status colours and four priorities. This file is the one written mapping every palette follows. The published values and where each goes are in `web/src/lib/theme/catalogue/palettes.ts`; `web/src/lib/theme/catalogue/generate.ts` applies the mapping and the contrast adaptation, and `catalogue.test.ts` checks the documents in this folder against both (`UPDATE_CATALOGUE=1 npx vitest run src/lib/theme/catalogue.test.ts` rewrites them).

## Seeds

| Seed | From the palette |
| --- | --- |
| `canvas` | The background behind the sidebar and around the content: the palette's panel or sidebar colour where it has one (Catppuccin `mantle`, Tokyo Night's sidebar, Gruvbox `bg0_h` in dark and `bg0_s` in light, Solarized `base2` in light), else its editor background (Solarized Dark, One, Nord, Dracula: canvas and surface are the same colour). |
| `surface` | The palette's main editor background (Solarized `base03` and `base3`, Gruvbox `bg0`, Catppuccin `base`, Rosé Pine `surface`, Tokyo Night's editor, One's `syntax-bg`, Nord `nord0`, Dracula's background). |
| `text` | Its main foreground. |
| `accent` | The colour the palette's own UI uses for selection and buttons: Solarized blue, Gruvbox aqua, Catppuccin mauve, Rosé Pine iris, Tokyo Night blue, One blue (`hue-2`), Nord frost `nord8`, Dracula purple. In a dark theme the palette's accent is also the accent text (links, the active item: `accent-text`); the button under the text on it is derived from it. |
| `success`, `warning`, `danger`, `info` | The palette's green, yellow (or orange where yellow is its highlight colour: Dracula, One's `hue-6-2`), red, and blue or cyan (cyan when blue is the accent). Rosé Pine: pine, gold, love, foam. |

## Explicit tokens

| Token | From the palette, where it defines one |
| --- | --- |
| `text-strong` | Its emphasised foreground (Solarized `base01` in light and `base1` in dark, Gruvbox `fg0`, Tokyo Night `#c0caf5`, Nord `nord6`). |
| `muted` | Its secondary foreground (Gruvbox `fg3`, Catppuccin `subtext0`, Rosé Pine `subtle`, Tokyo Night's sidebar or description colour, One `mono-2`). |
| `faint` | Its comment colour (Solarized `base1` and `base01`, Gruvbox `fg4` and `gray`, Catppuccin `overlay1`, Rosé Pine `muted`, Tokyo Night's comment and line numbers, One `mono-3`, Nord `nord3`, Dracula's comment). |
| `raised`, `hover`, `selected` | Its panel, hover and selection backgrounds (Solarized `base02`, Gruvbox `bg1` and `bg2`, Catppuccin `surface0` and `surface1`, Rosé Pine `overlay`, `highlight low` and `highlight med`, One's selection, Nord `nord1` and `nord2`, Dracula's current line). |
| `border` | Its divider, where it has one (Tokyo Night Light's panel border). |

Every other token (the remaining surfaces, lines, the accent's hover, soft and focus steps, the soft and text steps of each status and label colour, the priorities, the highlight and the chart ramp) is derived from these by the theme engine, as for any theme (`docs/themes.md`).

## Label colours

The palette's accent colours fill the 12 label colours by nearest hue (OKLCH hue against OpenTodo's own label hue): a green that leans yellow (Solarized, Tokyo Night, Nord, Gruvbox) is the `lime` label, a cyan that leans green (Solarized) is `teal`. Each published colour fills at most one label. `slate` is the palette's comment or grey colour. A label colour the palette has no colour for uses OpenTodo's hue at the mean lightness and chroma of the palette's own accents, so a project's colour stays recognisable and sits with the palette; the document's `notes.text` lists them. `catalogue.test.ts` requires the 12 solid label colours of each theme to stay at least ΔE 8 apart (CIE76).

## Adapted values

Every theme passes the contrast gate (`make check`). When a published colour misses one of its pairs (Solarized's comment colour `base01` on `base03`, Nord's `nord3`, most palettes' comment colour on their raised panels, light palettes' greens and yellows as text), the theme uses the nearest lightness of the same hue that passes: its OKLCH lightness moves in steps of 0.0025, the hue stays and the chroma is reduced only where sRGB cannot show it. A text or mark moves away from its background; a background moves the other way. Each such value is written in `oklch()` and its published value is kept under `notes.adapted`, so the change from the palette is visible; the theme's details in the app say "Some colours were adapted for contrast".

## Bar, shape and type

`bar` is the canvas, as editors colour their title bar. Built-in themes set colours only: no `shape` or `type`, so switching a palette never moves the layout (design D5).
