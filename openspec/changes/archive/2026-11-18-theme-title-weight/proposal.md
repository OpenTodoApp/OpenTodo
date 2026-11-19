# Proposal

## Why

Issue #1469: on a phone, a task row shows its title and, around it, the date, priority, project and labels, all at much the same weight. Scanning a long list is slow because the title does not stand out. The reporter asked for bold or semibold titles; the answer on the issue was a title weight in the theme format, next to the typeface and the list text size, so it follows the theme to every device and needs no new setting.

## What Changes

- **A theme can set how heavy task titles are.** A new optional key of the theme document, `titleWeight`: `400` (the default, what titles are today), `500`, `600` or `700`. It applies to the title of every task row, card and Today title, in every list.
- **The theme editor has the control**, under Shape and type after the list text size: **Task title weight** with Regular, Medium, Semibold and Bold. The preview follows it at once. Regular removes the key.
- **It is applied like the list text size:** resolved on the device, cached for the first paint, kept under high contrast, synced with the theme, written in the theme template and in the JSON Schema.
- **Additive.** `titleWeight` is a top-level key, and format 1 already keeps and ignores a top-level key it does not know. So an app or server from before this change still accepts and applies a theme that carries it, with regular titles, and keeps the key when it exports or syncs the theme. The format version stays 1. Any other value (`650`, `"bold"`) is refused by the app and the server with the code `type`. Not **BREAKING**.
- No new op field, entity, route, setting, dependency or shortcut. The themes that ship with the app are unchanged.

Out of scope: a weight for other text (headings, notes, details); making the details quieter instead; a switch in Settings (#1469's first option); changing the default weight; a text size setting (#1414).

Roadmap: a follow-up of `theme-engine` and `theme-editor`; listed in the 0.20 table as `theme-title-weight`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `themes`: new requirement "Task title weight".
- `theme-editor`: new requirement "Task title weight in the editor".

## Impact

- Web: `web/src/lib/theme/tokens.ts` (`TITLE_WEIGHTS`), `format.ts` (the key and its check), `derive.ts`, `load.ts`, `apply.ts` (`--ot-title-weight`, the cache check), `web/public/appearance.js` (the same check and declaration before the first paint), `template.ts`, `web/src/app/themes/EditorSections.tsx`, `ThemePreview.tsx`, `templateText.ts`, `web/src/index.css` (the default and the rule on `[data-row-title]`).
- Server: `internal/themes/themes.go` (the same check), shared examples `internal/themes/testdata/` (`valid/title-weight.json`, `invalid/title-weight.json`, `invalid/title-weight-word.json`, `expected.json`, the two templates).
- Docs: `docs/themes.md`, `docs/themes/opentodo-theme.schema.json`; `changelog.d/Added/theme-title-weight.md`.
- Catalogues: six new messages in every language.
- Size: no dependency; a few lines on the first load (`apply.ts`, the boot script, one CSS rule). The first-load budget is not raised.
