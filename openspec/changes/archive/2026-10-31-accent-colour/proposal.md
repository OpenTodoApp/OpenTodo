# Proposal: accent-colour

## Why

People want the app to feel like theirs: a brand colour for a freelancer, the colour of a team, or simply a favourite. Today Settings › Appearance offers eight fixed accent themes (`appearance-preferences`), and issue #563 (from the umbrella #427) asks for one's own accent next to them. Done naively, a custom colour breaks the contrast the design system guarantees in both modes (`design-system` "Accessible contrast in both themes"), or reads as the red of errors and priority 1. This change adds a custom accent whose full light and dark token scales are derived on the device, with contrast guaranteed by construction. It is the `accent-colour` item of the 0.19 "Series and time" milestone.

## What Changes

- A ninth choice, **Custom**, after the eight theme tiles in Settings › Appearance › Theme. It opens a colour picker: a grid of curated swatches and a hex field (`#rrggbb`), with a live preview of the result in light and dark (a button, a link, a selected row, a soft chip).
- From the one picked colour the device derives the three values every theme declares (light accent, bright dark-mode accent text, on-accent text) plus a dark-mode button value when needed. The existing fixed mix ratios derive every other accent step, as for the built-in themes.
- **Contrast is guaranteed**: the derivation adjusts the colour's OKLCH lightness (and chroma, to stay in the sRGB gamut), keeping its hue, until every accent token pair of the contrast check passes in both modes. It also keeps the accent at least as far from the danger and priority-1 colours as the built-in Rose theme is, turning the hue away when needed. When the colour was adjusted, the picker says so and shows both.
- Stored as two synced appearance preferences: `theme_accent` gains the value `custom`, and a new `theme_accent_custom` holds the picked hex. Switching back to a built-in theme keeps the custom colour for next time. Older clients read `custom` as Emerald and write nothing.
- The browser and system bar uses the derived light accent in light mode; the first frame is already in the custom accent (the cached appearance carries the derived values, no derivation runs before the first paint).
- High contrast keeps replacing the accent with black or white, as it does for every theme.

## Out of scope

- Free colours for projects, labels, sections or views: the fixed palette keeps its contrast guarantee there.
- Changing neutrals, surfaces, priority or status colours, or a full custom theme.
- An owner-set default accent for the instance (instance branding stays name and logo).
- A native `<input type="color">` picker or an eyedropper.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `appearance-preferences`: the theme preference gains `custom` and a stored custom colour; Settings › Appearance gains the Custom tile and its picker; new requirements for the derived custom accent (adjustment, red guard, bar colour, first frame, offline and sync).
- `design-system`: a new requirement that the custom accent derivation passes every accent pair of the contrast check, proven in CI over a fixed sample of input colours and pinned by test vectors.

## Impact

- **Data model and sync:** one additive `user_prefs` field `theme_accent_custom` (`kString`, default `""`) and one new accepted value `custom` for `theme_accent` (not restricted on the server, read as the default by older clients). Personal scope like every appearance field, last-writer-wins per field, included in the JSON export and import. Not user-written content: not an E2EE field. Nothing **BREAKING**.
- **API / CLI / MCP:** none; appearance preferences are written through sync only.
- **CalDAV, vault, email:** none. The server never renders the accent (emails are plain text; the install splash and icons stay neutral), so the derivation is client-only and has no Go port; its vectors are a TypeScript test fixture.
- **Web:** `web/src/lib/appearance.ts`, a new pure `web/src/lib/accentDerive.ts` reusing the colour maths of `web/src/ui/tokens/resolve.ts`, `web/public/appearance.js` (applies cached derived values), `web/src/app/AppearanceSection.tsx` and a picker component in `web/src/ui` with stories, `web/src/ui/tokens/accents.ts`.
- **Bundle:** about 3 KB gzip for the derivation and picker, loaded with the Settings chunk; the boot script grows by about 300 bytes. No dependency. Server binary: one schema entry.
- **i18n:** about ten new strings in the six catalogs.

Fixes #563
Relates to #427
