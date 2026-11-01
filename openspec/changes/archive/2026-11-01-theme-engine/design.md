# Design: theme-engine

## Context

The stylesheet `web/src/index.css` declares every colour token twice, in a light block (`:root, [data-theme="light"]`) and a dark block (`:root[data-theme="dark"]`, plus the `prefers-color-scheme` copy), all in OKLCH (`design-system` "Semantic design tokens"). Accent steps and the palette's soft and text steps are mixes of a few declared values by ratios declared once (`--ot-mix-*`, "Derived accent and palette steps"). An accent theme sets three input properties (`--ot-al-accent`, `--ot-ad-accent-text`, `--ot-a-on-accent`) under `[data-accent]`; the custom accent (`accent-colour`) sets the same inputs inline from values derived by `web/src/lib/accentDerive.ts`, whose `BASE_TOKENS` are OpenTodo's fixed neutrals. The CI contrast check (`web/src/ui/tokens/contrast.test.ts`) reads the stylesheet, resolves mixes and translucency with `resolve.ts`, and measures `PAIRS`, `GLYPH_PAIRS` and the high-contrast `OVERRIDE_PAIRS` (`pairs.ts`) for every accent in both modes. `web/public/appearance.js` applies the cached appearance (`ot.appearance`) before the first paint as a same-origin script (the CSP forbids inline scripts; it allows inline styles). High contrast is `html:root[data-contrast="high"]` blocks that set surfaces, text and the accent directly. The native shells (`native-shells`) talk to the web app through `window.opentodoShell`, whose capabilities are optional and whose payloads are kept as shared fixtures; today neither shell colours its system bars from the app.

## Goals / Non-Goals

**Goals:** a documented, versioned theme format that stays complete as tokens are added; a deterministic derivation from a few seeds that passes every contrast pair by construction; applying any theme before the first paint with high contrast still winning; a synced selection per light and dark side; a CI gate every theme document in the repository must pass; OpenTodo Light and Dark expressed as themes with no visible change.

**Non-Goals:** the built-in palettes, custom themes and the editor, the owner's default, spacing or row height in a theme, free-form CSS, a server-side renderer.

## Decisions

### D1. The theme document (format 1)

```json
{
  "opentodoTheme": 1,
  "id": "nord",
  "name": "Nord",
  "author": "Sven Greb",
  "licence": "MIT",
  "source": "https://github.com/nordtheme/nord",
  "kind": "dark",
  "seeds": { "canvas": "#2e3440", "surface": "#3b4252", "text": "#eceff4", "accent": "#88c0d0",
             "success": "#a3be8c", "warning": "#ebcb8b", "danger": "#bf616a", "info": "#81a1c1" },
  "tokens": { "muted": "#d8dee9", "hue-red": "#bf616a" },
  "bar": "#2e3440",
  "shape": { "radius": { "chip": 4, "control": 5, "card": 6, "surface": 8, "popover": 10 } },
  "type": { "family": "system", "list": 13 }
}
```

- `opentodoTheme` is the **format version**, an integer. Adding a token does not change it (derivation fills new tokens, D3); only a change in the meaning of an existing key does, with a migration (D2).
- `id`: 1–64 characters of `[a-z0-9-]` for built-in and instance themes; a synced user theme's id is its entity id (`theme-editor`). `name` 1–60 characters, `author` and `licence` at most 120 (an SPDX identifier where one applies), `source` at most 300 characters of text, **never fetched**, shown as a credit only.
- `kind`: `light` or `dark`. A theme is one side; a pair (Solarized Light and Dark) is two documents.
- `seeds` (required): `canvas`, `surface`, `text`, `accent`; optional `success`, `warning`, `danger`, `info`.
- `tokens` (optional): explicit values for any semantic token. The closed list, grouped as the editor will show it: **surfaces** `canvas`, `surface`, `raised`, `sunken`, `pop`, `hover`, `selected`, `selected-row`, `sidebar`; **text** `text-strong`, `text`, `muted`, `faint`; **lines** `border`, `border-soft`, `border-input`, `line-strong`; **accent** `accent`, `accent-hover`, `on-accent`, `accent-text`, `accent-soft`, `accent-soft-text`, `focus`; **status** `success`, `warning`, `danger`, `info`, each with `-soft` and `-soft-text`; **priorities** `p1`–`p4`, each with `-soft`; **labels** `hue-<name>` for the 12 palette hues (the solid step; soft and text steps are always derived by the palette ratios); **other** `scrim`, `highlight`, `highlight-text`, `chart-base`, `chart-seq-1`–`chart-seq-5`. Internal tokens (the `--ot-mix-*` ratios, the accent inputs, the support button's `coffee`) are not part of a theme. An unknown token name is kept in the document and ignored by the resolver, so a document written by a newer app keeps its values through an older one.
- `bar` (optional): the browser and system bar colour (D8).
- `notes` (optional): `adapted`, a map from a token name to the published colour it replaced (for palettes adapted for contrast, `theme-catalogue`), and `text`, at most 500 characters shown in the theme's details.
- `shape.radius` (optional): the five radius steps in px, each an integer 0–20, applied to `--radius-chip`, `--radius-control`, `--radius-card`, `--radius-surface`, `--radius-popover`; a partial scale fills the rest by keeping today's proportions to the nearest given step.
- `type` (optional): `family` is `inter` (the bundled OpenTodo Inter, the default), `system` (the platform's UI font stack), `serif` (`ui-serif` stack), `mono` (`ui-monospace` stack) or `{ "local": "<name>" }`, a font installed on the device, named by 1–64 characters of letters, digits, spaces and hyphens, followed by the system stack; `list` is the list text step in px, 13 (default), 14 or 15, the one-line change `design-system` "Comfortable reading scale" already allows. Every type step scales with the browser's font size as today.
- Colour values are `#rrggbb` or `oklch(L C H)` with L in 0–1, C in 0–0.4 and H in 0–360, inside the sRGB gamut; alpha only on `scrim` (`oklch(L C H / a)` or `#rrggbbaa`). Nothing else (no `var()`, no `url()`, no keywords) is accepted, so a document can never carry CSS.
- Size: a document is at most 16 KB as UTF-8 JSON.

The JSON Schema lives at `docs/themes/opentodo-theme.schema.json`; `docs/themes.md` documents every key and token. Valid and invalid examples live in `internal/themes/testdata/{valid,invalid}/` and both validators (TypeScript `web/src/lib/theme/format.ts`, Go `internal/themes`) must accept and refuse exactly the same files (`docs/contracts.md` gains the entry).

- *Alternative: a full token map with no seeds.* Rejected: every future token would be missing from every existing theme, and authors would copy dozens of values that follow from four.
- *Alternative: VS Code's own format as the native format.* Rejected: its keys describe an editor (tabs, gutters, minimap), not a task app; it is an import source instead (`theme-editor`).
- *Alternative: YAML or TOML.* Rejected: JSON is what the app already parses, validates and exports, with no dependency.

### D2. Versioning and migration

`migrate(doc)` in `web/src/lib/theme/format.ts` (mirrored in Go) brings a document of any known older format to the current one, step by step, and is pure. There is only format 1 now, so it is the identity, and its test pins that a format-1 document survives unchanged. A document of a **newer** format than the device knows is not applied: the device falls back as for an unknown theme (D6), keeps the stored document untouched and says in Settings "Made with a newer version of OpenTodo". A document that fails validation is treated the same way.

### D3. Derivation from seeds

`deriveTheme(doc) → ResolvedTheme` in `web/src/lib/theme/derive.ts`, pure and deterministic, sharing the colour maths of `web/src/lib/colourMath.ts` and the search of `accentDerive.ts`, generalised so the base tokens are the theme's own surfaces instead of the fixed `BASE_TOKENS`. Each step fills only what the document does not set explicitly, in this order so later steps can measure against earlier ones:

1. **Surfaces.** `canvas` and `surface` are seeds. `raised`, `sunken`, `pop`, `hover`, `selected`, `selected-row` and `sidebar` are OKLCH lightness offsets of the seeds in the direction of the kind (lighter for dark themes, darker for light ones), keeping the seed's hue and chroma; the offsets are today's OpenTodo offsets, so the OpenTodo seeds reproduce today's values (vector test). The three surfaces keep at least 0.04 lightness apart (`design-system` "Dark surfaces separate by lightness").
2. **Tone scale.** `text-strong` and `text` are the `text` seed (strong moves 0.02 further from the surface). `muted` and `faint` are mixes of `text` toward `surface`, each the nearest mix that still reaches 4.5:1 on every surface it is allowed on, plus a 0.15 ratio margin, keeping the hue.
3. **Lines.** `border`, `border-soft`, `line-strong` and `border-input` are lightness offsets of `surface` toward `text`, searched to their minimums (1.1, 1.1, 1.2 and 3:1).
4. **Accent.** The `accent-colour` search (D2 of that change) runs against the theme's surfaces: the accent keeps its hue, moves its lightness until every accent pair passes, and the red guard keeps it away from the theme's own danger and p1 colours. On-accent is white or near-black, whichever passes with the smaller move (editor palettes often pair a pale accent with dark text, unlike OpenTodo's white-only rule). The hover, soft, soft-text, focus and chart-base steps are the stylesheet's mix ratios, as today.
5. **Status.** Each status hue (seed or OpenTodo's default hue) is fitted to 4.5:1 on canvas, surface and raised by lightness; its soft step and soft text use the palette mix ratios.
6. **Priorities.** `p1` follows danger, `p2` the orange label hue, `p3` info, `p4` the muted tone, each fitted to 3:1 on canvas and surface; their soft steps mix into the surface.
7. **Label palette.** For each of the 12 hues the solid step is OpenTodo's hue fitted to 3:1 on the theme's surface (or the document's explicit `hue-<name>` value), and soft and text use the existing ratios. Stored project and label colours keep rendering through the palette (`design-system` "Stored colours render through the palette").
8. **The rest.** `scrim` is the text colour at 35 % (light) or black at 60 % (dark); `highlight` is the warning hue's soft step lifted to 4.5:1 for `highlight-text`; `chart-seq-1..5` is the existing ramp of `web/src/lib/chartRamp.ts` from the accent.

Explicit values are never moved by the derivation, even when they fail a pair: a built-in theme must pass the gate as written (D10), and a custom theme shows the failure as a warning (`theme-editor`).

**As built.** Every step above starts from OpenTodo's own value for the kind, read from `web/src/lib/theme/reference.json` (generated from `index.css` with the mix ratios by `scripts/themes-sync.mjs`, checked by `themes.test.ts`), carried onto the theme's seeds: the lightness keeps its offset from the token's anchor (`raised`, `pop` and `hover` from `surface`; `sunken`, `selected` and `selected-row` from `canvas`; the tones from `text`; the lines from `surface`; a status colour's soft step from `surface` with the status hue, its soft text from the status colour; `p1` from `danger`, `p2` from the orange label hue, `p3` from `info`, `p4` from the slate label hue), a seed under 0.01 chroma keeps OpenTodo's slate tint and a coloured seed gives its hue. Then each token, or each family that moves together (a status colour with its soft steps, a label hue with its soft and text steps, the accent family), walks its lightness to the nearest value at which its own pairs pass, measured on the rounded value that is written; a value that already passes does not move, which is why OpenTodo's seeds reproduce the stylesheet exactly (the vector test compares every token's drawn colour). There is no ratio margin: the measured value is the written one. A tone or status colour drawn on another family's soft step (text on the accent's or a label's soft fill) answers for that pair itself, and three repair passes search again whatever a later step made fail. The accent: in a light theme the button and the accent text are one colour, searched with white or the theme's text colour on it, whichever needs the smaller move; in a dark theme the button is searched the same way (the dark choice is the canvas) and the accent text is the seed itself when it already reads on the surfaces, else OpenTodo's step above the button carried onto the seed, lifted until its pairs pass. The scrim keeps OpenTodo's; the highlight follows the warning hue and the surface. `accentDerive.ts` now takes its base tokens as a parameter, and the theme derivation shares its red guard and colour maths.

**Termination and the guarantee.** Every search walks one monotone axis (lightness at a fixed hue with chroma clamped to the gamut, or a mix ratio from 0 to 1) with a bounded number of steps, as in `accent-colour`. The end points always satisfy the targets (black or white text reaches 4.5:1 on any surface whose luminance is not in the narrow middle band; seeds whose canvas and surface sit in that band are first moved out of it by the surface step, which `deriveTheme` reports as an adjustment). So a theme built from any seeds is complete and passes. The whole derivation runs in under 5 ms on a mid-range phone (perf test with a budget; measured about 2.5 ms a theme on average over the sweep).

**Vectors.** `web/src/lib/theme/derive.vectors.json` pins the resolved values of the OpenTodo seeds (equal to the stylesheet), of a sweep of seed sets and of each built-in document; client-only, because the server never renders a theme.

- *Alternative: derive in HSL or sRGB.* Rejected for the same reason as `accent-colour`: lightness must be perceptual to keep the hue.
- *Alternative: store resolved values in the document.* Rejected: they would freeze an older derivation and miss new tokens; the input is stored, the output is cached per device (D5).

### D4. Applying: one generated style sheet

`applyTheme(resolved)` in `web/src/lib/theme/apply.ts` writes one rule into a `<style id="ot-theme">` element (allowed by the CSP's `style-src 'unsafe-inline'`; the boot script writes the same element, so there is one mechanism, not an adopted sheet beside it):

```css
html:root[data-ot-theme]:not([data-contrast="high"]) { --ot-canvas: oklch(…); …; color-scheme: dark; }
html:root[data-ot-theme] { --ot-radius-card: 6px; …; --ot-font: …; --ot-text-list: 0.875rem; }
```

The `html` type selector lifts the rule above `:root[data-accent][data-theme="dark"]`, so it wins whatever the order of the sheets. The stylesheet's radius and font tokens read `var(--ot-radius-*, today's value)` and `var(--ot-font, the Inter stack)`, which draw exactly as before when no theme sets them.

- The selector names `data-ot-theme`, which the root carries only while a non-default theme is active; the default themes write no sheet, so the default path is exactly today's.
- `:not([data-contrast="high"])` keeps the high-contrast blocks in charge whatever the specificity or order: under high contrast the theme's colours are not applied at all (`design-system` "High-contrast and no-motion presentation"). Shape and type stay applied under high contrast; they do not affect contrast.
- `data-theme` is still set to the theme's kind, so every `light`/`dark` rule of the stylesheet (shadows, images, `color-scheme`) follows the theme.
- Only names from the closed token list of D1 and values that passed the D1 grammar are serialised, each formatted by the app (never copied as text from the document), so a document cannot inject CSS. The font name is quoted after the D1 character check.
- The accent inputs (`--ot-al-accent`, …) are not used by a non-default theme: its sheet sets `--ot-accent` and the accent steps directly. With a default theme the accent themes and the custom accent work exactly as today (D7).
- Workbench subtrees (`[data-theme]` frames in stories) can apply a theme to a subtree with the same function and a scoping attribute, for the editor's preview later.

- *Alternative: inline properties on `<html>` (as the custom accent does).* Rejected: inline declarations beat the high-contrast rules; the custom accent avoids that only because it sets inputs, not the tokens high contrast replaces.
- *Alternative: one class per built-in theme in `index.css`.* Rejected: every theme would load on first paint, and custom themes need a generated sheet anyway.

### D5. First frame and the cache

The device caches the resolved active themes in `ot.theme` (local storage, through `deviceStorage`): for each side, `{ id, hash, kind, tokens: { name: "#rrggbb"|"oklch(…)" }, bar, radius, font, list }`, where `hash` is a short hash of the source document plus the derivation version. `appearance.js` reads it before the first paint, picks the side that matches the cached mode (or `prefers-color-scheme` under `system`), validates every name against a fixed pattern (`^[a-z0-9-]{1,40}$`) and every value against the two colour patterns, and writes the same rule as D4 into a `<style id="ot-theme">` element plus `data-ot-theme` and `data-theme` on the root. It never derives. A malformed or missing cache shows the default theme. The app then reads the synced selection; if the hash differs (another theme, an edited theme, a newer derivation) it re-resolves (loading the lazy derivation chunk), applies and rewrites the cache, without a reload. Writing the cache never writes an op. A resolved theme is about 3 KB, so both sides fit in about 6 KB of storage.

### D6. The selection: `theme_light` and `theme_dark`

Two additive `user_prefs` fields (`kString`, default `""`):

- `""`: the default for that side, OpenTodo Light or OpenTodo Dark (and, with `theme-instance-default`, the instance's default first).
- `builtin:<id>`: a theme shipped with the app (`opentodo-light`, `opentodo-dark` in this change).
- `user:<id>` and `instance:<id>`: reserved for `theme-editor` and `theme-instance-default`.

The light side's choice is applied when the effective mode is light, the dark side's when it is dark; under `system` the app switches between them live with the operating system, as it already switches modes. A side accepts only themes of its kind; a value naming a theme of the other kind, an unknown id, an unavailable or invalid document, or a newer format reads as that side's default **without writing an op**, and the stored value is kept so it comes back when the theme becomes available (a newer app, the theme synced later). Choosing a theme writes one op for one field. Personal scope, last writer wins per field, offline-first, in the JSON export and import, exactly like `theme_mode`. Not user-written content, not encrypted; stated in `docs/themes.md`.

- *Alternative: one `theme` field plus a derived opposite.* Rejected: editor users expect to pick Solarized Light by day and Nord by night; a pair is not always the same family.
- *Alternative: per device.* Rejected: `appearance-preferences` says appearance is personal and synced with no per-device override.

### D7. Accent themes and the custom accent

The accent preference (`theme_accent`, `theme_accent_custom`) keeps its meaning and applies to the OpenTodo themes only: OpenTodo Light with Teal is today's Teal. A theme from elsewhere carries its own accent, and while it is active on the current side the accent tiles show as "From the theme" and are not offered for that side. To change another theme's accent, the user customises it (`theme-editor`). This keeps the contrast proof per theme instead of per theme × accent, and keeps the eight tiles meaningful.

- *Alternative: the accent applies on top of any theme.* Rejected for now: every theme × accent combination would need the derivation's guarantee, and an accent that ignores a palette's own colours defeats choosing the palette. Recorded as an open question.

### D8. The bar and the system bars

The bar colour is the theme's `bar` value when given; otherwise the accent for a light theme (today's behaviour) and the canvas for a dark one. `appearance.ts` and `appearance.js` set `meta theme-color` from it as today, per side under `system` (`media` attributes). Shells gain an optional bridge capability **`system-bars`** with one method `setSystemBars(json)`, payload `{ "color": "#rrggbb", "dark": true|false }` (`dark` means light icons). Android sets the status and navigation bar colours and icon appearance through `WindowInsetsControllerCompat`; iOS sets the status bar style and the web view's background and under-page colour. Each shell remembers the last payload and applies it at launch, so the shell's first frame matches too. As built on iOS, where the status bar is drawn over the page, the colour goes to the web view's background and under-page colour; the status bar's icons keep following the system appearance, because a status bar style needs a UIKit root view controller that the SwiftUI shell does not have (an open question). A shell without the capability keeps its current bars. The payload is added to the shared bridge fixtures (`native-shells` "Shared bridge fixtures").

### D9. OpenTodo Light and Dark as generated documents

`index.css` stays the source of the default tokens (they are what high contrast, the stories and the visual baselines are built on). `scripts/themes-sync.mjs` writes `web/src/lib/theme/builtin/opentodo-light.json` and `opentodo-dark.json` from it: the seeds as the stylesheet writes them and every token's resolved value as an explicit `#rrggbb` token (a translucent one composited over the surface, except the scrim, which keeps its alpha). `themes.test.ts` fails when the files are stale, like the icon catalogue check. Their ids are `opentodo-light` and `opentodo-dark`, author "OpenTodo contributors", licence `AGPL-3.0-only`. They are the reference documents for authors and the first entries of the theme list; selecting them is the same as the default and applies no sheet.

### D10. The contrast gate

- `contrast.test.ts` gains a loop over every theme document in `web/src/lib/theme/builtin/` (and, from `theme-catalogue`, the palettes): resolve with `deriveTheme`, then measure `PAIRS` and `GLYPH_PAIRS` for its kind with the existing resolver. Every pair must pass; the failure names the theme, the pair, the measured and the required ratio.
- A sweep derives themes from 200 fixed seed sets (light and dark canvases across the hue circle and lightness band, pale and saturated accents, absent and present status seeds) and requires zero failures: the derivation's guarantee.
- `checkTheme(resolved) → Failure[]` in `web/src/lib/theme/check.ts` is the same measurement as a runtime function over `PAIRS`, without the test-only stylesheet parser, for the editor's live warnings (`theme-editor`). The test asserts that `checkTheme` and the CI loop agree on every built-in theme.
- High contrast is not measured per theme: it replaces the theme (D4), and its own pairs are already checked.

### D11. Not doing: free-form custom CSS

Issue #638 suggested custom CSS. It is out of scope for this change and its follow-ups, for three reasons. **Third-party requests:** CSS can load from anywhere through `url()` (backgrounds, fonts, cursors) and `@import`; a synced snippet would make every device of the user, and on a shared screen everyone looking at it, contact a host the owner never configured, breaking `AGENTS.md` non-negotiable 5. A CSP that blocks it would also break the next legitimate use. **Breakage across updates:** CSS targets class names and structure, which change in every release; a snippet that worked in 0.20 can make 0.21 unusable on every synced device at once, and the person may not be able to reach Settings to remove it. **Hidden UI:** CSS can hide controls, cover the screen, or make text the colour of its background, defeating the contrast and accessibility guarantees, and a shared screenshot of someone's app could be faked by it. Tokens cover what people use custom CSS for (colours, corners, font, size), with contrast checks and a working undo. **Revisit when:** (a) people ask in #638 or a new issue for something tokens cannot express, at least three distinct requests; (b) the request can be met by a sandboxed, per-device (never synced) style that the CSP restricts to `'self'` with no `url()` or `@import`; and (c) there is a safe way out (a reset address or a key that disables it before the first paint).

### D12. No CLI or MCP command

`ot theme list|set|export|import` was considered. A theme is something one sees; the CLI has no screen, export and import are plain files that any editor opens, and setting the selection from the CLI saves one click in Settings. An MCP tool for appearance is not a task for an assistant. Not worth the surface now; revisit if a scripted setup (provisioning many accounts) asks for it, where `theme-instance-default` already covers the server side.

### D13. `internal/themes`

A small Go package: `Validate(doc []byte) error` (D1 grammar and size, unknown tokens allowed), `Migrate`, and the shared testdata. It has no derivation and no renderer. This change only adds it and its tests; `theme-editor` uses it as the value kind of synced themes and `theme-instance-default` for instance themes.

### D14. Settings › Appearance › Theme

Below Mode, a **Theme** row: with mode `light` or `dark`, one choice; with `system`, two labelled choices, "Light" and "Dark". Each choice is a list of theme cards (a radio group: name, a swatch strip of canvas, surface, text, accent and four label hues, and the author as a credit line), a horizontal scrolling row below 40 rem like the accent tiles. In this change each list holds one card (the OpenTodo theme), so the row is shown but quiet; the accent tiles follow as today with their "From the theme" state (D7). No new route, no new shortcut, no new scroll region; the section keeps the Settings section pattern, so the interface budget is unchanged.

## Data model

`user_prefs.theme_light` and `user_prefs.theme_dark` (`kString`, default `""`), declared once in `internal/sync/ops.go` `Schema` with comments; the generator writes `web/src/generated/opSchema.ts`. Additive; never renamed. Not content fields.

## Bundle, binary and memory

- First load: about 1.5 KB gzip for reading the selection, the cache, applying a resolved theme and the system-bar call; the stylesheet is unchanged. Measured: the first load grew 3.5 KB (731.8 to 735.3 KB; entry 312.1 to 313.3 KB), the extra being the Theme row with its cards in Settings, which loads with the shell; the lazy chunk is 7.5 KB gzip plus the accent search it shares (2.8 KB) and each OpenTodo document (0.9 KB); the boot script grew 2.8 KB raw (unminified, with its comments). The derivation, resolver, checker and format validator (about 5 KB gzip including the shared accent search) are a lazy chunk, loaded only when a non-default theme lacks a valid cache, or with Settings › Appearance. The two generated OpenTodo documents (about 1 KB gzip together) load with that chunk. The boot script grows by about 600 bytes raw. The first-load budget is expected to rise by at most 2 KB, stated in the pull request.
- Server binary: the Go validator and its schema entries, under 50 KB. No dependency on either side. Runtime memory: one resolved theme per side in the page, about 6 KB.

## Risks / Trade-offs

- [Derivation changes shift existing themes slightly] → only inputs are stored; the vectors make any shift visible in review, and the CHANGELOG names it.
- [The generated sheet and the stylesheet's own mixes disagree] → the derivation reads the mix ratios from the same constants the stylesheet declares (as `accent-colour` does), and the OpenTodo vectors require equality with the stylesheet.
- [A local font name is used to fingerprint] → the font is chosen by the user on their own device and never reported anywhere; the page can already measure installed fonts. Documented.
- [Shell bars out of step with the page during a switch] → the call is made in the same frame as the sheet; a shell without the capability is unchanged.
- [Large themes in local storage] → at most two resolved themes, about 6 KB; storage failures fall back to the default (D5).

## Migration Plan

Additive. Older clients ignore `theme_light` and `theme_dark` and keep their appearance. Rollback leaves the fields stored and unused.

## Open Questions

- Should accent themes also apply on top of other themes (D7)? Deferred to the owner; the conservative default keeps them for the OpenTodo themes.
- iOS status bar icons (D8): they follow the system appearance; choosing them from the theme needs a UIKit root view controller in the SwiftUI shell.
