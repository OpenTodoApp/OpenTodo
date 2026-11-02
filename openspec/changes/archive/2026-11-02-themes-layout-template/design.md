# Design

## D1. The template is JSON with comments, generated, and round-trips

A theme file cannot carry notes as JSON values (the format refuses unknown seed and token names that are not colours), and a schema alone helps only people whose editor reads `$schema`. So the template is JSON with `//` comments, the dialect VS Code theme files already use and `web/src/lib/theme/jsonc.ts` already reads. `readThemeFile` blanks comments and trailing commas before parsing, which keeps every offset, so "Line 12: canvas is not a colour." still points at the right line.

`web/src/lib/theme/template.ts` writes it from a document and its resolution: the header (what the file is, how to import it, the docs address), `$schema`, each key with a note, the seeds (optional status seeds commented with their derived colour while unset), then every token of `TOKEN_GROUPS` but the seeds, by group: a token the theme sets as a value, every other one as `// "token": "#rrggbb", // Name`. Every entry ends with a comma, so any line can be uncommented on its own. `bar`, `shape` and `type` are commented with what applies now unless the theme sets them. Reading the file back gives the document plus `$schema`, which `importedDraft` (and the Branding upload) drops with an empty `tokens`.

The notes are translated (`app/themes/templateText.ts`): the header, a note per key and seed, and the token and group names the editor already shows. Keys and values stay as the format writes them.

From where: Settings uses the theme in use on the side shown (a built-in or catalogue theme as a "(custom)" copy, simplified as Customise does; a custom theme as it is; a server theme as a copy), the editor the draft, Branding a new theme from OpenTodo Light.

`$schema` points at the schema in the repository on GitHub (`raw.githubusercontent.com/OpenTodoApp/OpenTodo/main/docs/themes/opentodo-theme.schema.json`), because the `$id` address on opentodo.app does not serve it. The app never fetches it; only an editor the user opens the file in may.

## D2. `$schema` in the format

Both validators accept a top-level `$schema` of at most 300 characters of text (code `key` otherwise), and the JSON Schema documents it. Shared examples `valid/with-schema.json` and `invalid/schema-not-text.json` pin both sides. `template.test.ts` writes OpenTodo Light's and Dark's templates to `internal/themes/testdata/template/`; `themes_test.go` strips their comments and validates them as written and with every commented line set, so the server accepts what the template produces.

## D3. Layout by the editor's own width

The editor is a size container (`@container/theme-editor`). From 52 rem the grid is `minmax(0,1fr) minmax(22rem,26rem)` with the preview sticky in the second column (at 1280 px with the sidebar, the editor is about 59 rem: controls about 32 rem, preview 26 rem). Narrower (a 1024 px window with the sidebar, a tablet, a phone) the preview is above the controls behind the Preview toggle, so it is never squeezed below the width at which task rows stay readable. The controls are their own container (`@container/theme-controls`): from 30 rem the shape and type controls and the details share lines, and the colour rows go two by two whenever two rows of 12.5 rem fit (also at 768 px with the sidebar).

A colour row is the colour field without its old two-line text: swatch (opens the picker), name, Derived or Set, a hex field that writes on Enter or blur, and Reset for an optional colour (its place kept while derived, so rows line up). The pairs below AA a colour is in show on its row as "2 pairs below AA"; the Contrast panel keeps the list with Fix.

## D4. Settings spacing

Your themes and Branding's server themes are each one row (`py-3`, the row padding of `SettingRow`) holding their title, actions and list, instead of siblings of a row that the section's dividers separate without padding. The layout check gains a measure: in Settings › Appearance and Server › Branding, no two visible controls overlap, and no control is within 4 px of a row divider (`scripts/ux-audit/measure.mjs` `crowdedControls`).

## Interface budget

No new chrome above a list, no new scroll region (the editor scrolls as one page; the preview column is sticky, not scrolling), no new shortcut. The editor still shows one page.

## Size

No dependency. The template writer and its notes are part of the lazy theme chunk loaded with Settings › Appearance (a few KB); the first load is unchanged.
