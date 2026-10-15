# Proposal

## Why

OpenTodo's look is fixed: an emerald accent on slate, with light or dark decided only by the operating system. People coming from Todoist expect to pick a theme (Todoist offers several colour themes plus dark mode, synced across devices), and some need the app dark while their system is light, or the other way round. Today there is no way to do either. With every screen colouring itself through design tokens (`screen-token-migration`), a theme is a different set of token values. It can be added with CSS and one synced preference, without a redesign.

## What Changes

- **Appearance preferences.** Each user gets two preferences:
  - **Mode:** `system` (default, today's behaviour), `light` or `dark`.
  - **Theme:** one of eight accents: `emerald` (default), `blue`, `indigo`, `violet`, `rose`, `orange`, `teal`, `graphite`.
  Any mode combines with any theme. A client treats an unknown or missing value as the default, so themes added later stay compatible with older clients.
- **Synced like the date and time preferences.** Both are fields of the existing personal `user_prefs` entity, written as ops. They apply on every device of the user, never on a project member's, work offline, converge per field by last-writer-wins, and are part of the export. There is no per-device override.
- **What a theme changes.** The accent and the colours derived from it: primary actions, focus ring, current navigation item, selection and accent-tinted surfaces. Priority colours (p1 to p4), status colours (success, warning, danger, info) and stored project, label and view colours do not change, because they carry meaning. There is no red accent, so the accent is never confused with p1 or danger.
- **No flash of the wrong theme.** The device remembers the last applied appearance locally and applies it before the first paint. The synced value takes over as soon as it is read, without a reload.
- **The installed app follows the theme.** The browser and system bar colour (`theme-color`) follows the current theme and mode live, including when the system switches between light and dark under `system`: the theme's accent in light mode, as Todoist does, and the dark canvas in dark mode. The install splash screen comes from the web app manifest, which is fixed at install time and shared by everyone on the server. It keeps a neutral colour.
- **Settings → Preferences → Appearance.** A card with a Mode control and a grid of eight theme tiles that preview each theme, applied immediately without a reload, fully keyboard-operable.
- **Accessible in every combination.** Every theme meets the existing contrast rules in light and in dark. The contrast check covers all 16 combinations.

## Out of scope

- Full palettes that also change neutrals, surfaces or typography (for example "Sepia" or "High contrast"). The model leaves room for them as later additions.
- Per-device appearance, per-project themes, custom colour pickers or user-defined themes.
- Theming the website or the generated docs site.
- New visual-regression baselines: screenshots stay on the default theme in light and dark, to keep CI as lean as today.

ROADMAP.md does not list theming yet. This change adds it to the Shipped tables (Organisation, views and GTD, or a new Appearance row) when it is archived, as a parity feature with the subscription apps OpenTodo replaces.

**Depends on:** `screen-token-migration` (screens must colour through tokens before a theme can reach them).

## Capabilities

### New Capabilities

- `appearance-preferences`: the user's mode and theme preferences, their sync, offline and convergence behaviour, defaults and unknown values, the Appearance panel in Settings, applying the appearance before first paint, and the installed app's bar colour.

### Modified Capabilities

- `design-system`: "OpenTodo identity is preserved" changes from "the accent SHALL remain emerald" to emerald as the default of a fixed set of accents, with neutrals, white light cards and the slate-950 dark canvas unchanged. "Accessible contrast in both themes" extends to every theme in both modes. ("Semantic design tokens" is left alone because `screen-token-migration` already modifies it.)
- `web-app`: "Responsive layout and themes" follows the user's mode (system, light or dark) instead of only the system preference.

## Impact

- **Op schema (additive, not breaking):** two string fields on `user_prefs`, `theme_mode` and `theme_accent`, in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. They are not user-written content, so the E2EE content field lists do not change.
- **Server:** schema entry only. No new route, no migration, no environment variable, no outbound request.
- **Client:** accent token blocks in `web/src/index.css`, `data-theme` and `data-accent` on the document root, a tiny same-origin pre-paint script loaded from `index.html` (the server's Content-Security-Policy forbids inline scripts), live `<meta name="theme-color">` updates, the Appearance panel, the manifest colours in `vite.config.ts` left at their current neutral dark slate, and `web/src/ui/tokens` contrast pairs for every theme.
- **Checks:** contrast unit tests grow to 16 combinations (milliseconds). No new CI job and no new screenshot baselines.
- **Size:** no dependency. About 2 to 3 KB of CSS gzipped for the accent blocks.
- **Docs:** `docs/settings.md` (Appearance), the in-app help, and the CHANGELOG.
