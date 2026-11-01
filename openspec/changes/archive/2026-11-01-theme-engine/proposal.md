# Proposal: theme-engine

## Why

Issue #638 asks for every design token to be editable in Settings, because the app's look is fixed apart from light or dark, density, high contrast and the accent. Code editors solved this long ago with themes: a small file that sets every colour of the interface, shared, imported and switched in a click. OpenTodo's tokens are already semantic and measured (`design-system` "Semantic design tokens", "Accessible contrast in both themes"), and `accent-colour` proved that a colour can be derived on the device with contrast guaranteed. What is missing is the engine: a documented theme format, a derivation that fills every token from a few seeds, a way to apply a theme before the first paint, a synced selection per light and dark side, and a CI gate every theme must pass. This change builds that engine and expresses OpenTodo Light and OpenTodo Dark as its first two themes, with no visible change for anyone who does not pick another theme. The owner has prioritised it (ROADMAP 0.20, group "Themes").

## What Changes

- **A theme format.** A theme is a versioned JSON document (`.opentodo-theme.json`, format 1) with an id, a name, an author, a licence, a `kind` (`light` or `dark`), a few **seeds** (canvas, surface, text, accent, and optionally the four status hues), optional explicit values for any *semantic* token (surfaces, the tone scale, lines, accent steps, status, priorities p1–p4, the 12-hue label palette, focus, scrim, highlight, charts), and optionally **shape** (the five-step radius scale) and **type** (a bundled, system or locally installed font family, never a web font from another host, and the list text step of 13, 14 or 15 px). A JSON Schema and a shared set of valid and invalid example documents pin it in TypeScript and Go.
- **Derivation.** Every token a theme does not set is derived on the device from its seeds in OKLCH, extending `web/src/lib/accentDerive.ts` from "an accent on OpenTodo's neutrals" to "every token on the theme's own surfaces". A theme stays complete when OpenTodo adds a token later. The derivation is deterministic and pinned by vectors, and every derived value passes the contrast pairs by construction.
- **Applying a theme.** The resolved tokens become one generated style sheet of custom properties on the document root, scoped so that the high-contrast presentation always wins. The early appearance script (`web/public/appearance.js`) applies the cached resolved theme before the first paint, so there is no flash. `meta theme-color`, and through a new optional shell bridge capability the Android and iOS status and navigation bars, follow the active theme.
- **Selection, synced per side.** Two additive `user_prefs` fields, `theme_light` and `theme_dark`, hold the chosen theme for each side. With mode `system` each side keeps its own theme and the app switches between them with the operating system. Empty means "the default" (OpenTodo Light and Dark). Unknown or unavailable themes read as the default without writing.
- **Accent themes keep working.** The eight accent tiles and the custom accent stay as they are and apply to the OpenTodo themes; a theme from elsewhere brings its own accent.
- **The contrast gate.** `web/src/ui/tokens/contrast.test.ts` measures every theme document in the repository through the same resolver and pairs, so a theme that fails AA fails CI. A shared checker reports failing pairs for any theme document, for the editor's live warnings later.
- **OpenTodo Light and OpenTodo Dark as themes.** Generated from `web/src/index.css`, which stays the source of the default tokens, and checked by a test to stay equal to it. Choosing them applies no generated style sheet at all.
- **Settings › Appearance › Theme.** A theme choice for the light side and the dark side (one choice when the mode is fixed), listing the themes the device has. In this change the list holds only the two OpenTodo themes; `theme-catalogue` adds the built-in palettes and `theme-editor` the user's own.

## Out of scope

- The built-in editor palettes (`theme-catalogue`), custom themes, the editor, import and export (`theme-editor`), the owner's default theme and instance themes (`theme-instance-default`).
- **Free-form custom CSS**, now and in the follow-ups: see design D11 for the reasons and the conditions to revisit it.
- Spacing, row height and elevation in a theme. Density stays its own preference; a theme can change colour, radius and type only.
- Theming the sign-in screens before an account is known, the emails, the install splash and the instance's icons: they stay neutral.
- A CLI or MCP command for themes (design D12).

Advances ROADMAP 0.20 "Themes" (prioritised), first of four changes; issue #638.

## Capabilities

### New Capabilities

- `themes`: the theme format and its versioning, derivation from seeds, applying a theme without a flash, the synced per-side selection, the system bars, and the contrast gate over theme documents.

### Modified Capabilities

- `appearance-preferences`: the appearance preferences gain the light and dark theme choices; "A theme changes only the accent" becomes a statement about accent themes on the OpenTodo themes; the first frame and the bar colour follow the active theme; Settings › Appearance gains the theme choice.
- `design-system`: the identity requirement applies to the OpenTodo themes; the contrast requirement covers every theme document; the high-contrast presentation overrides every theme.
- `native-shells`: a new optional bridge capability lets the web app set the system bar colours, with its payload in the shared bridge fixtures.

## Impact

- **Data model and sync:** two additive `user_prefs` fields, `theme_light` and `theme_dark` (`kString`, default `""`), personal like every appearance field, last writer wins per field, in the JSON export and import. Not user-written content: not E2EE fields. Nothing **BREAKING**; no new environment variable.
- **API / CLI / MCP:** none; the selection is written through sync like the other appearance preferences.
- **Server:** one schema entry per field, plus `internal/themes`, a small Go validator of the format against the shared examples, which `theme-editor` and `theme-instance-default` use for synced and instance themes. The server never renders a theme.
- **Web:** a new `web/src/lib/theme/` (format, migration, derivation, resolver, apply, cache), `web/public/appearance.js`, `web/src/lib/appearance.ts`, `web/src/app/AppearanceSection.tsx`, `web/src/ui/tokens/contrast.test.ts`, a generator `scripts/themes-sync.mjs` for the OpenTodo themes, `web/src/lib/shell.ts`.
- **Shells:** Android and iOS implement the optional `system-bars` capability (a few lines each); older shells keep today's bars.
- **Bundle:** about 1.5 KB gzip on first load (reading the selection and the cache, applying the sheet); the derivation and resolver (about 5 KB gzip, shared with the custom accent) load lazily only when a non-default theme has no valid cache; the boot script grows by about 600 bytes. No dependency.
- **i18n:** about eight new strings in the six catalogs.

Tracked in #708
Relates to #638
