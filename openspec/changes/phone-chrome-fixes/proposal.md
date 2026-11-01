# Proposal

## Why

The phone shell and the installed app still carry startup defaults from before the appearance work. On a phone, the floating add button sits over the end of Settings rows even though Settings has no quick-add action. When a two-line panel title is long enough to scroll while it is edited, it keeps the scroll position after the edit, so the beginning of the title stays hidden. The static theme colours and the manifest splash also disagree with the default appearance: the Android status bar changes tint after the app loads, and the installed app opens on a dark splash before showing the light page.

## What Changes

- Below 768 px, Settings keeps the tab bar but no longer shows the floating add button, which covered the chevrons at the end of its rows. The button returns on the next view that offers quick add.
- A multiline panel title scrolls back to its start when the field loses focus, so a long title shows its beginning again after editing.
- The static `theme-color` metas in `index.html`, the light fallback in `public/appearance.js` and the manifest's `theme_color` use the default appearance's bars: `#047857` in light and `#0d0e10` in dark. `index.html` also declares `mobile-web-app-capable`.
- The manifest's splash `background_color` is the light page canvas `#eef0f2` instead of the dark canvas.
- A test reads `index.html`, `public/appearance.js` and `vite.config.ts` and fails when a static startup colour drifts from the default appearance.

Out of scope: the back-gesture overlay test reset from `aad52f323` (it belongs to the Back/overlay work, not to this appearance and phone-chrome group), the other phone fixes on separate branches, and any change to the native shells.

## Roadmap

No ROADMAP.md item: these are small corrections to existing phone, title and install behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: the phone's floating add button is absent on Settings while the tab bar stays.
- `natural-language-capture`: a multiline panel title shows its start again after an edit.
- `web-app`: the static startup colours and the manifest splash match the default appearance.

## Impact

- Web app only: `web/src/app/Shell.tsx`, `web/src/app/TitleField.tsx`, `web/index.html`, `web/public/appearance.js` and `web/vite.config.ts`.
- No op field, sync, API, CLI, MCP, encryption, dependency or server change.
- No new visible string; the change adds no translation key.
