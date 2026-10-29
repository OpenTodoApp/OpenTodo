# Design: accent-colour

## Context

An accent theme declares three values in `web/src/index.css` (`[data-accent="…"]`): `--ot-al-accent` (light accent, also the light browser bar), `--ot-ad-accent-text` (the bright accent used in dark mode for text, focus, soft steps and charts) and `--ot-a-on-accent` (text on the accent), plus an optional `--ot-ad-accent` dark-button override (Graphite uses it). Every other step (hover, soft, soft text, focus, chart base, the sidebar tint) is derived by the `--ot-mix-*` ratios (`design-system` "Derived accent and palette steps"). The CI contrast check (`web/src/ui/tokens/contrast.test.ts` over `pairs.ts`, resolving mixes and translucency with `resolve.ts`) measures every accent theme in both modes. The appearance preferences are `user_prefs.theme_mode` and `theme_accent`, applied as `data-theme` / `data-accent` on `<html>`; `web/public/appearance.js` applies the cached appearance (`ot.appearance`: mode, accent, bar) before the first paint, as a same-origin script because the CSP forbids inline scripts. High contrast (`data-contrast="high"`) sets `--ot-accent` and its steps to black or white directly.

## Goals / Non-Goals

**Goals:** one picked colour becomes a full accent in both modes that passes every accent contrast pair by construction, never reads as the error red, syncs like the other appearance fields, and paints in the first frame.

**Non-Goals:** custom neutrals or status colours, per-entity free colours, an instance default accent, a server-side port.

## Decisions

### D1. Storage: `theme_accent = "custom"` plus `theme_accent_custom`

`theme_accent` gains the value `custom`; a new additive `user_prefs.theme_accent_custom` (`kString`, default `""`) holds the picked colour as lowercase `#rrggbb` (the input, not the derived values). Choosing a colour writes both fields in one `mutateMany` batch under one timestamp; choosing a built-in theme writes `theme_accent` only, so the custom colour is kept for next time. A client reads `custom` with a missing or malformed `theme_accent_custom` as Emerald and writes nothing. Older clients read `custom` as an unknown theme, so Emerald, and write nothing (existing rule). The server keeps the kind check only, like every `user_prefs` string. The export and import carry both fields.

- *Alternative: store the hex in `theme_accent` itself.* Rejected: switching to Blue would lose the colour, and a value that is sometimes an id and sometimes a colour is harder to read.
- *Alternative: store the derived values.* Rejected: the derivation is deterministic from the input; storing outputs would freeze an older algorithm's result and invite disagreement between devices on different versions. Devices on the same version derive the same values from the same input (vectors pin it).
- *Alternative: per device.* Rejected: `appearance-preferences` says appearance is personal and synced with no per-device override.

### D2. The derivation (client-only, deterministic)

`deriveAccent(hex) → { lightAccent, darkAccentText, darkButton, onAccent, adjusted: { lightness, hue } }` in `web/src/lib/accentDerive.ts`, pure, using the OKLCH and contrast maths of `web/src/ui/tokens/resolve.ts` (moved to a shared module if the Settings chunk would otherwise pull test-only code).

1. Convert the input to OKLCH (L₀, C₀, H₀).
2. **Red guard (hue).** If the derived light accent or dark accent text would be closer to the danger or priority-1 colour of the same mode than the built-in Rose theme is (OKLab ΔE, the threshold being Rose's own smallest distance, recorded as a constant and checked by a test), turn the hue away from the danger hue in 1° steps until it is not. Every built-in theme passes the guard unchanged.
3. **Light accent.** On-accent text is always white (`oklch(1 0 0)`), as for every built-in theme. Starting from L₀, step the lightness down by 0.005 (chroma clamped to the sRGB gamut at each step, hue kept) until every light-mode pair of `pairs.ts` that has an accent-derived token on either side passes (on-accent on accent and accent hover ≥ 4.5:1, accent text on canvas, surface and raised ≥ 4.5:1, soft text and the other texts on accent soft ≥ 4.5:1, focus on canvas, surface and raised ≥ 3:1, the sidebar pairs, …), resolving the stylesheet's mixes exactly as the CI check does. If the start already passes, stepping up is not attempted: a dark pick stays dark.
4. **Dark accent text.** Starting from the light accent's hue and L₀, step the lightness up until every dark-mode pair involving `accent-text`, `accent-soft`, `accent-soft-text`, `focus` and the chart base passes.
5. **Dark button.** The dark-mode `--ot-accent` defaults to the light accent; if a dark-mode pair of the accent itself fails (white on it ≥ 4.5:1 and the accent against the dark canvas ≥ 3:1), search the lightness band where both hold and take the value nearest the light accent.
6. `adjusted` reports whether the lightness or the hue moved, for the picker's note.

**Termination and the guarantee.** For a fixed hue with chroma clamped to the gamut, relative luminance is monotone in L, so each search is a walk along one monotone axis. The targets are reachable for every hue: at L = 0 (light) every text-on-light pair holds and white reaches 21:1; for dark text the near-white end reaches the 4.5:1 targets; for the dark button the band "white on it ≥ 4.5:1" (Y ≤ 0.183) and "≥ 3:1 against the dark canvas" (Y ≥ about 0.11 for `#0d0e10`) is non-empty at every hue. The walk is bounded (at most 200 steps), so it ends in under a millisecond.

- *Alternative: a fixed table of allowed colours.* Rejected: that is the eight themes again.
- *Alternative: HSL lightness.* Rejected: HSL lightness is not perceptual; OKLCH keeps the hue the person picked while the lightness moves.
- *Alternative: allow black on-accent text for light picks.* Rejected: the accent is also text on white surfaces (links, the active item), which forces a dark accent anyway; one rule (white on accent) matches every built-in theme.
- *Alternative: refuse a red pick.* Rejected: refusing a colour someone picked feels arbitrary; turning the hue the minimum needed and saying so is calmer, and it is deterministic.

### D3. Applying it

With `theme_accent = custom`, `applyAppearance` sets `data-accent="custom"` and the four input properties (`--ot-al-accent`, `--ot-ad-accent-text`, `--ot-a-on-accent`, `--ot-ad-accent` when needed) on `<html>` through the CSSOM (`style.setProperty`, allowed by the CSP, unlike inline scripts). The stylesheet's existing `:root[data-accent]` derivation block does the rest, so the derived steps are the same mixes the CI check resolves. Only the input properties are set, never `--ot-accent` itself, so the high-contrast block (which sets `--ot-accent` and its steps directly) still wins: in high contrast a custom accent looks like every other theme there, black or white.

### D4. First frame and the bar

The cached appearance (`ot.appearance`) gains `custom`: the four derived values as `#rrggbb`, and `bar` holds the derived light accent. `appearance.js` validates each value with the existing hex regex before setting it and never runs the derivation, so the first frame is already in the custom accent and the boot script stays small. The light-mode browser and system bar colour is the derived light accent; dark mode keeps the dark canvas; the install splash stays neutral. When the synced value differs from the cache, the app switches as soon as it reads it, without a reload (existing rule).

### D5. The picker (progressive disclosure)

Settings › Appearance › Theme shows a ninth tile, **Custom**, after Graphite: its swatch is the derived accent of the stored colour, or a dashed empty swatch with "Choose a colour" when none is stored. Activating it selects the custom accent (when a colour is stored) and opens the picker: a popover from 640 px, a bottom sheet below. The picker holds:
- 18 curated swatches (a radio group: arrow keys move, Enter or Space picks), chosen to cover the hue circle at two lightness levels;
- a hex field accepting `rgb`, `rrggbb`, with or without `#`, normalised to lowercase `#rrggbb`, with an inline error for anything else;
- a preview of the result in light and dark side by side (a primary button, a link, a selected row, a soft chip), computed live while typing without writing anything;
- when the colour was adjusted, one line: "Adjusted for contrast" (and/or "Turned away from the error red"), with the picked and the used colour shown together;
- Done.
A swatch or a valid hex (on Enter or when the field loses focus) writes the batch of D1 and applies at once. No native colour input (inconsistent across platforms, poor keyboard and screen-reader support, no contrast feedback). The picker is a `web/src/ui` primitive with stories. Nothing else in the app changes: Simple-list users who never open Appearance see nothing new; the interface budget of every screen is untouched.

### D6. Offline, sync and conflicts

Both fields are ordinary `user_prefs` ops in the user's personal scope: applied at once offline, uploaded on the next sync, converging per field by last writer wins. Device A choosing a custom colour while device B chooses Blue ends with whichever `theme_accent` write is later; the custom colour is kept either way. Shared projects and other members are unaffected. Encrypted accounts: preferences are not content and are not encrypted, as today.

### D7. Instance branding

Instance branding (`instance-branding`) sets the instance's name and logo; it has no colour, and the maskable icon and splash use the logo's edge or the dark canvas. The custom accent is personal and never changes the instance's icons or the splash screen.

### D8. Tests and vectors

- `web/src/lib/accent.vectors.json`: input colours (the eight built-in light accents, pure red, yellow, lime, cyan, navy, black, white, mid grey, a pale pink, a near-danger red) with their expected derived values and `adjusted` flags; `accentDerive.test.ts` checks them. Client-only: no Go mirror, because the server never renders the accent.
- `contrast.test.ts` gains a sweep: 36 hues × 4 lightness × 3 chroma inputs, each derived and measured against every accent pair in both modes, plus the red-guard distance; it fails naming the input, mode, pair and ratio.

## Risks / Trade-offs

- [The adjusted colour differs from the brand colour someone typed] → the picker shows both and says why; contrast is the non-negotiable.
- [The derivation and the stylesheet mixes drift apart] → the derivation reads the mix ratios from the same constants the stylesheet declares (`--ot-mix-*`, checked by `theme.test.ts`), and the CI sweep measures the result through the real resolver.
- [A future algorithm change shifts existing users' colours slightly] → only the input is stored; a change to the vectors is visible in review and goes in the CHANGELOG.

## Migration Plan

Additive only. Rollback leaves `custom` and `theme_accent_custom` stored and read as Emerald by the older client.

## Open Questions

- Should the owner be able to set a default accent for new accounts of the instance, to match their logo? Deferred; it would extend `instance-branding` without changing this design.
