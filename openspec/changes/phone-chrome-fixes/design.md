# Design

## Context

The default appearance is OpenTodo Light with the emerald accent, whose light bar is `#047857`; the dark bar is the dark canvas `#0d0e10` (`web/src/ui/tokens/accents.ts`). The boot script and the app apply those values, but the static `theme-color` meta in `index.html`, the boot script's fallback and the web app manifest still say `#0f172a`. The manifest's splash background also still uses the dark canvas. On Android the status bar therefore changes colour after the first load, and the installed app opens on a dark splash before the light page appears.

The phone shell renders the add button whenever the phone chrome is shown. Settings is not a list and has no quick-add action, so the button only covers the rows' chevrons.

The panel title uses a one-row textarea that grows to two lines and scrolls inside itself while a long title is edited. Leaving the field commits the edit but keeps the textarea's internal scroll position, hiding the start of the title.

## Decisions

### D1. Keep Settings in the phone chrome and hide only the add button
The tab bar remains the way out of Settings, so it stays. The add button is rendered when the phone chrome is shown and the view is not Settings, or while a quick-add sheet is open. This keeps quick add available from every other view and does not change the opening or closing of the sheet.

### D2. Reset the multiline field's scroll on blur
The blur handler already commits the edit. It now also sets `scrollTop = 0` on the field when it is multiline, after the commit. A single-line input has no internal vertical scroll to reset, so the inline title editor is unchanged. The test sets a scroll position, blurs the field and expects zero.

### D3. Use the appearance source of truth for static colours
The light value comes from `lightBar(DEFAULT_ACCENT)`, which reads `ACCENTS` in `web/src/ui/tokens/accents.ts`, and the dark value from `DARK_BAR`. `index.html` declares both with `prefers-color-scheme` media queries, so the first frame follows the system scheme. `public/appearance.js` uses the light value when a light preference has no cached bar. The manifest's `theme_color` uses the light value, and its `background_color` uses `#eef0f2`, the light page canvas also used by the OpenTodo Light theme. `mobile-web-app-capable` replaces the older Apple-only hint for installed-app behaviour.

### D4. Pin the static values with a file-reading test
The values live in three files that cannot import the TypeScript tokens. `web/src/lib/appearance.test.ts` reads those files from the web package root and compares them with `lightBar(DEFAULT_ACCENT)`, `DARK_BAR` and the light canvas. This catches a partial change such as updating the meta but not the manifest.

## Data model and sync

None. The change writes no op and adds no field; offline behaviour and convergence are unchanged.

## Container image and runtime

No dependency or server code changes: no effect on image size or memory.

## Interface budget

No chrome is added. On Settings one floating control is removed, one shortcut is not added, and the existing tab bar is unchanged. The panel title keeps its two-line height and the inline editor keeps its size.

## Risks

Browsers that ignore `media` on `theme-color` use the first meta, which is the light default; the boot script replaces the metas with the resolved appearance once a preference is cached. The scroll reset runs after commit, so it cannot move the caret while the field still has focus.
