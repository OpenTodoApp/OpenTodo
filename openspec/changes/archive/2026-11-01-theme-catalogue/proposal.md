# Proposal: theme-catalogue

## Why

A theme engine with only OpenTodo's own two themes does not answer #638. People who live in a code editor already have a palette they like, and the editor world's favourites are open-licensed: Solarized, Gruvbox, Catppuccin, Rosé Pine, Tokyo Night, One Dark and Light, Nord, Dracula. Shipping a curated set of them, mapped carefully onto OpenTodo's semantic tokens and proven readable in CI, gives most people the theme they want in one click, and shows authors of custom themes what a good theme looks like. This is the second of the four "Themes" changes in ROADMAP 0.20 (prioritised); it depends on `theme-engine`.

## What Changes

- **Fourteen built-in palettes** beside OpenTodo Light and Dark, as theme documents in the format of `theme-engine`:
  - light and dark pairs: Solarized Light and Dark, Gruvbox Light and Dark, Catppuccin Latte and Mocha, Rosé Pine Dawn and Rosé Pine, Tokyo Night Light and Tokyo Night, One Light and One Dark;
  - dark only, as their projects publish them: Nord, Dracula.
- **Mapped, not copied.** Each palette's published colours are assigned to OpenTodo's semantic tokens by a written mapping (its background to the canvas, its panel colour to the surface, its comment colour to the faint tone, its eight accent colours to status, priorities and the 12 label hues, and so on). Where a published colour misses a contrast pair, the theme uses the nearest lightness of the same hue that passes, and the theme's notes say which values were adapted.
- **Licences verified and credited.** Every palette is MIT-licensed; the design records each project, its copyright line, its licence file and the date it was checked. The full notices ship next to the documents, each theme card credits its author, a theme's details show its licence and copyright, and `docs/themes.md` lists the credits. The names are used only to credit the palettes; OpenTodo says it is not affiliated with their projects.
- **Every built-in passes the contrast gate** of `theme-engine` (WCAG AA for every pair) in CI.
- **Loaded lazily.** The catalogue is one lazy chunk loaded with Settings › Appearance; the active theme comes from the device's cache, so the first load does not grow.
- **Excluded:** palettes whose names or licences are not clearly open (design D2).

## Out of scope

- More variants of the same families (Catppuccin Frappé and Macchiato, Rosé Pine Moon, Tokyo Night Storm, Dracula's light variant): the catalogue is curated; custom themes (`theme-editor`) cover the rest.
- Syntax-highlighting colours: OpenTodo has no code editor; code blocks in notes keep their token styling.
- Fonts from the palettes' projects: built-ins keep the bundled typeface and today's radius scale, so switching a palette never changes layout.
- A theme gallery or download from the internet: the catalogue ships inside the app.

Advances ROADMAP 0.20 "Themes" (prioritised), second of four changes; issue #638.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `themes`: new requirements for the built-in catalogue, the credits and licences of third-party palettes, and lazy loading of the catalogue.

## Impact

- **Data model and sync:** none; a built-in is chosen as `builtin:<id>` in the fields `theme-engine` adds. Nothing **BREAKING**; no environment variable.
- **API / CLI / MCP:** none.
- **Web:** fourteen JSON documents and `CREDITS.md` in `web/src/lib/theme/builtin/`, a catalogue index, the cards in Settings › Appearance, the contrast loop already covers the folder.
- **Bundle:** the catalogue chunk is about 9 KB gzip (each document about 0.6 KB gzip: seeds and a few explicit tokens), loaded with Settings › Appearance or when a built-in's cached resolution is stale. First load unchanged. Server binary unchanged.
- **Docs:** `docs/themes.md` gains the catalogue with screenshots and credits.
- **i18n:** theme names are proper names and are not translated; about four new strings (Credits, Licence, Adapted for contrast, Not affiliated).

Tracked in #709
Relates to #638
