# Design

## Context

- **Prerequisite:** `screen-token-migration` is merged, so every screen colours through tokens and emerald is split into accent and success by meaning.
- **How tokens resolve today:** values live in `web/src/index.css`. Light values are on `:root, [data-theme="light"]`. Dark values are under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and again under `:root[data-theme="dark"], [data-theme="dark"]`. The `dark:` variant follows the same two conditions. `theme.test.ts` requires the two dark blocks to be identical. `css.ts` parses the blocks for `contrast.test.ts`, which checks the pairs in `pairs.ts`.
- **Accent tokens:** seven in all. `accent`, `accent-hover`, `on-accent`, `accent-text`, `accent-soft` and `accent-soft-text`, plus `focus`, which is emerald too.
- **The preference row already exists.** The synced row `user_prefs/"me"` came with `date-time-preferences`. `lib/userPrefs.ts` reads it with unknown-to-default fallback, and `DateTimePrefsProvider` watches it with `useLiveQuery`. The export (`GET /api/v1/export`) includes the row, and the importer (`profile_opentodo.go`) imports it as one row titled "Date and time preferences".
- **CSP:** the server sends `script-src 'self'`, so `index.html` cannot carry an inline script.
- **Fixed head colours:** `index.html` has a fixed `<meta name="theme-color" content="#0f172a">`, and the manifest (`vite.config.ts`) has `theme_color` and `background_color` set to `#0f172a`.

## Goals / Non-Goals

**Goals:**
- Mode and accent switch with attributes on `<html>` and CSS only, with no re-render of the React tree.
- One source of truth for accent values, readable by the contrast test and by the pre-paint script.

**Non-Goals:**
- Theming neutrals, typography or radius. The token structure allows it later as a "full theme", but no such theme ships now.
- A keyboard shortcut for the mode. It can be added through the existing shortcut registry later, and the specs don't require it.

## Decisions

### D1. Data model: two fields on `user_prefs`
`theme_mode` (`system|light|dark`) and `theme_accent` (one of eight) are added as `kString` to `Schema["user_prefs"]` in `internal/sync/ops.go`, to `UserPrefs` in `web/src/lib/types.ts`, and to `USER_PREFS_DEFAULTS` (`'system'`, `'emerald'`) in `web/src/lib/ops.ts`. The change is additive: no op field is renamed and no migration is needed, because `scope_fields` stores any schema field. Like the date fields, the server does not restrict the values. Clients map unknown values to the default, so a newer client can add a theme without a server release. These fields are not user-written content, so `e2ee.ContentFields` and `CONTENT_FIELDS` stay unchanged.

Alternative considered: one combined field (`theme: "violet-dark"`). Rejected because two fields converge independently, so a mode change on one device and an accent change on another both survive.

### D2. Mode through the existing `data-theme` attribute
- `system` removes `data-theme` from `<html>`.
- `light` sets `data-theme="light"`.
- `dark` sets `data-theme="dark"`.

The current CSS and `dark:` variant already honour exactly these three states, so mode needs no new CSS. `<meta name="color-scheme">` is updated alongside, so native controls and scrollbars match.

### D3. Accent through `data-accent` and per-accent raw values
Each non-default accent gets raw values for both modes on a `[data-accent="<name>"]` selector, as custom properties named `--ot-accent-l-*` and `--ot-accent-d-*` (seven per mode). The mode blocks then map the public tokens to them, with emerald as the fallback:
- light block: `--ot-accent: var(--ot-accent-l-accent, #047857)`
- dark blocks: `--ot-accent: var(--ot-accent-d-accent, #047857)`, and so on

The mode blocks' selectors also match `[data-accent]` elements, so the mapping is evaluated where the attribute sits. That lets a subtree (a theme tile, a Storybook story) show any accent in any mode, the same way `data-theme` already works for subtrees. Without `data-accent`, nothing changes, which keeps emerald byte-for-byte as today.

Alternatives considered:
- One block per accent × mode with the final token values. That needs three blocks per accent (light, media-dark and attribute-dark, the latter two kept identical by test), for 21 blocks and more selector combinations. Rejected for size and duplication.
- CSS `light-dark()`. Rejected because it would mean rewriting the existing mode mechanism, and older WebKit versions on phones support it unevenly.

### D4. Accent values
Each accent is built like emerald's tokens:
- the light accent at roughly the 700 step of its Tailwind family, with a white label
- `accent-hover` one step darker
- in dark mode, the same solid with a light text step (`accent-text` around the 400 step) and a 950-step soft surface

Families: blue, indigo, violet, rose, orange, teal, and slate for graphite. Orange needs a darker step (around 800) for a white label to reach 4.5:1. Graphite uses slate-700/800 in light and slate-300/400 text in dark. `contrast.test.ts` is the gate, and any value that fails it is adjusted until it passes. No red family is used.

### D5. Contrast test across accents
`css.ts` gains `parseAccents(css)`. It returns each accent's light and dark raw values, plus the effective token set obtained by overlaying them on the base light and dark tokens. `contrast.test.ts` runs the accent pairs of `pairs.ts` (`accent-text` on surfaces, `on-accent` on `accent`/`accent-hover`, `accent-soft-text` on `accent-soft`, `focus` as UI on surfaces) for all eight accents × two modes. Failure messages name the accent, mode, pair and ratio. `theme.test.ts` gains checks that every accent defines all seven tokens in both modes, and that the accent list in CSS equals the list in TypeScript.

### D6. One accent list in TypeScript
`web/src/ui/tokens/accents.ts` exports the ordered list of accent names, the display labels and the light-mode bar colour for each (the `accent` value). The settings panel, `readUserPrefs` validation, the theme-color logic and the tests all import it. A test compares it with the CSS, so the two can't drift apart.

### D7. Applying the appearance
- **Pre-paint script.** A tiny classic script in `web/public/appearance.js` (non-module, under 1 KB, precached by the service worker) is loaded synchronously in `<head>` before the stylesheet applies. It reads `localStorage["ot.appearance"]` (`{mode, accent, bar}`) and sets `data-theme`, `data-accent` and the `theme-color` meta before the first paint. It is wrapped in try/catch, so a private window or blocked storage just falls back to the defaults.
- **Runtime component.** An `AppearanceProvider`, a sibling of `DateTimePrefsProvider`, watches the `user_prefs` row with `useLiveQuery`. On every change it updates the attributes, the meta tag and the `localStorage` cache.
- **System switches.** For `system` mode, it listens to `matchMedia('(prefers-color-scheme: dark)')` to update the bar colour, since the CSS already switches by itself.
- **No ops from the cache.** The cache is written only from the synced value, never the reverse.

Alternative considered: an inline script with a CSP hash. Rejected because it couples the Go server's header to a build artefact. A same-origin file needs no CSP change.

### D8. Bar colour
- Light mode: `theme-color` is the accent's `accent` value. Dark mode: it is the dark canvas (`#020617`).
- Under `system`, both are emitted as two metas with `media="(prefers-color-scheme: …)"`, so the browser switches on its own.
- Under `light` or `dark`, a single meta is used.
- The manifest keeps `#0f172a` for `theme_color` and `background_color`, because one manifest serves every user of the server. This is the "neutral splash" in the spec.

### D9. Settings panel
`AppearanceSection` sits at the top of Settings → Preferences, built from `SettingsSection` and `SettingRow`:
- **Mode:** a three-option segmented control (System, Light, Dark) with radio-group semantics.
- **Theme:** a radio group of eight tiles with roving focus and arrow keys. Each tile carries its own `data-accent` and renders a mini sidebar and button through the real tokens (D3), with the theme name in text below.
- **Help:** the panel links to the `settings/appearance` help page.

The tiles are a shared pattern, so the panel gets a story, which is covered by the existing a11y gate at default light and dark. No baselines are added for other accents.

### D10. Import title and docs
The importer's preview title for the `user_prefs` row changes from "Date and time preferences" to "Preferences". The appearance fields import with the row unchanged, because the importer copies the schema fields.

## Risks / Trade-offs

- [A screen still hard-codes emerald after the migration] → It shows up at once in any non-emerald theme, and the token lint blocks new cases. Manual check: switch to `orange` and walk the main screens once before release.
- [The pre-paint script blocks parsing] → It is under 1 KB, same-origin and precached, so the cost is negligible compared with a flash of the wrong theme.
- [Status bar colour on iOS] → Safari honours `theme-color` for its browser chrome, but the standalone status bar depends on `apple-mobile-web-app-status-bar-style`. The bar there may stay neutral, which is acceptable and documented.
- [Unknown accent from a newer client] → It renders emerald and no op is written (spec). The newer client's value survives in the row.
- [Size] → No dependency. About 7 × 14 custom properties plus the mapping, roughly 2 KB of CSS gzipped, plus a script under 1 KB. No server change beyond two schema keys, and no effect on image size or runtime memory.

## Migration Plan

- No data migration. Existing users have no appearance fields, which read as `system` and `emerald`, the current look.
- Deploy is a normal release. The web app is embedded in the server binary, so client and schema ship together. A device still running a cached older app ignores the new fields until it updates. If a server is rolled back below this release, it refuses the two ops per op (as for any unknown field), and the rest of the outbox keeps syncing.
- Rollback: revert the client. Stored appearance fields stay harmlessly in `scope_fields`.

## Open Questions

- Exact hex values per accent, settled against the contrast test while implementing (D4).
