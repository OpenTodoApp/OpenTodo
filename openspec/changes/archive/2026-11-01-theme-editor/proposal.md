# Proposal: theme-editor

## Why

The reporter of #638 wants to change the tokens themselves, not only pick from a list. With the engine (`theme-engine`) and the catalogue (`theme-catalogue`) in place, the missing piece is a way to make one's own theme safely: start from any theme, change a few base colours or any single token, see real screens change as you go, be told at once when a pair stops being readable and fix it in one click, undo anything, and take the result to another account or share it as a file. Editor users also have themes already: importing a VS Code colour theme gets them most of the way in seconds. This is the third of the four "Themes" changes in ROADMAP 0.20 (prioritised).

## What Changes

- **Custom themes, synced.** A new personal entity `theme` holds one theme document (at most 16 KB) per custom theme, at most 20 per user, synced to the user's own devices through the op log like rules and frames. A custom theme is chosen for a side as `user:<id>`. Themes are not content and are not end-to-end encrypted; the editor says so on encrypted accounts.
- **The editor**, Settings › Appearance › Themes › a theme:
  - **Start from any theme** (built-in, OpenTodo's own, or another custom theme) with Customise, which makes a copy that credits the original.
  - **Seeds:** the canvas, surface, text and accent pickers, and optional status hues; every other token follows by derivation.
  - **Advanced:** every semantic token, grouped (surfaces, text, lines, accent, status, priorities, labels, other), each showing whether it is derived or set, its value and its worst contrast pair, with **undo** and **reset to derived** per token, and a filter.
  - **Shape and type:** a radius preset or five values, a font (bundled, system, serif, monospace or an installed font by name, never downloaded) and the list text size.
  - **Live preview** of real screens (a list, a board, the week calendar, the task panel) built from sample data, in the theme's kind, with a switch to create the opposite kind as a counterpart.
  - **Live contrast warnings** per pair, with **Fix to AA** per pair and for all, which keeps each colour's hue and moves only its lightness. A theme with warnings can still be saved and chosen; its card is marked "Low contrast". High contrast still overrides it.
  - Changes stay a draft on the device until Save, with undo and redo for the whole session.
- **Import and export.** Export any theme as a `.opentodo-theme.json`; import one, validated and migrated on the device. **Import a VS Code colour theme** (`.json` with comments allowed): its workbench colours are mapped to OpenTodo's tokens (`editor.background`, `editor.foreground`, `sideBar.*`, `list.*`, `focusBorder`, `button.*`, the terminal's ANSI colours to the label palette, and more), everything unmapped is derived, and the user sees a report of what was mapped, derived, adapted and ignored before saving.
- Six languages, keyboard and screen-reader operable, built from design-system primitives with stories.

## Out of scope

- Free-form custom CSS (`theme-engine` D11).
- Sharing a theme with other users through the server, a public theme gallery, or importing from a URL: a theme travels as a file. The owner can offer themes to everyone with `theme-instance-default`.
- Importing other editors' formats (Sublime, JetBrains, Vim, terminal schemes); only VS Code's JSON now.
- Spacing, row height and elevation tokens.
- Using the user's own tasks in the preview.

Advances ROADMAP 0.20 "Themes" (prioritised), third of four changes; issue #638.

## Capabilities

### New Capabilities

- `theme-editor`: making and editing custom themes in Settings: start from a theme, seeds, the advanced token list with undo and reset, shape and type, live preview, live contrast warnings and Fix to AA, drafts and saving, import and export of theme files, and import of VS Code colour themes with a report.

### Modified Capabilities

- `themes`: new requirements for custom themes synced per user (entity, limits, offline and convergence, deletion of a chosen theme, no encryption), and for themes saved with contrast warnings.

## Impact

- **Data model and sync:** a new personal entity `theme` with fields `doc` (a new value kind, a theme document validated by `internal/themes`, at most 16 KB), `position`, `created_at`, `deleted_at`; unique ids like `rule` and `frame`; in the JSON export and import. Additive; nothing **BREAKING**; no environment variable. Not content fields: stated in the schema comment and `docs/themes.md`.
- **API / CLI / MCP:** none; writes go through sync (`mutate`).
- **Server:** the schema entry, the value kind using `internal/themes.Validate`, the export and import of the entity.
- **Web:** `web/src/lib/theme/` (custom themes, drafts, fix to AA, the VS Code mapper and a small JSONC reader), `web/src/app/settings/themes/` (the editor, its preview and report), new primitives in `web/src/ui` (colour field with OKLCH sliders, token row, contrast badge) with stories.
- **Bundle:** the editor is a lazy chunk of about 18 KB gzip and the VS Code importer a lazy chunk of about 3 KB gzip; the first load grows by under 0.5 KB (the custom theme table and the Themes row's entry). No dependency.
- **i18n:** about 70 new strings (token group and token names, editor actions, warnings, the import report) in the six catalogs.

Tracked in #710
Relates to #638
