## Why

Issue #1469 (sh0nuff). On a phone, a task row shows its title and its details (date, priority, project, labels) at much the same weight, so a long list is slow to scan: the eye has nothing to land on. On the issue, the owner and the reporter agreed on a title weight in the theme format, next to the typeface and the list text size. It follows the theme to every device, and it doesn't make every text heavier the way a heavier typeface would.

## What Changes

- **A theme may carry `titleWeight`:** `400` (the default), `500`, `600` or `700`, the weight of task titles in lists. It's a top-level key, so an app older than this change keeps and ignores it, as the format does for every top-level key it doesn't know. A key inside `type` would make an older app refuse the theme.
- **The app and the server accept and refuse it alike.** Shared examples: `valid/title-weight.json` and `invalid/title-weight.json` (650 is refused as `type`). The JSON Schema documents it.
- **The theme editor's Shape and type section gains Task titles,** with Regular, Medium, Semibold and Bold, shown live in the preview.
- **Applying a theme** sets `--ot-title-weight`, which task row titles (`[data-row-title]`) use; unset, the row keeps its own weight. The boot script writes the same.

## Capabilities

### Modified Capabilities

- `themes`: "Theme document format" adds the title weight.
- `theme-editor`: "Shape and type in the editor" adds the Task titles choice.

## Impact

- **Web:** `web/src/lib/theme/` (`format.ts`, `tokens.ts`, `derive.ts`, `apply.ts`, `load.ts`), `web/public/appearance.js`, `web/src/app/themes/EditorSections.tsx`, `ThemePreview.tsx`, one rule in `web/src/index.css`, and three new strings in every shipped language.
- **Server:** `internal/themes/themes.go`, with its shared examples.
- **Docs:** `docs/themes/opentodo-theme.schema.json` and `docs/themes.md`.
- No op or sync change: a theme is synced as a document, as before.
