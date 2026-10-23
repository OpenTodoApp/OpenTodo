# Design

## Context

The target is the round-2 mock-up `settings.png` (Settings → Notifications), together with `system.md`:
- "Settings": the settings nav (search, You · App · Server) and one page with a 22 px title, a lead line and flat groups of hairline rows;
- the widths and heights: settings nav 228, nav row 30, control 28;
- the control rows: toggle, select, status dots.

`precision-shell` already gave every tool page the compact 46 px header and the inset surface, and its design flagged Settings as the page that still lays itself out. `precision-tokens` provides `bg-selected`, `bg-hover`, `border-soft`, the 13 px list text, `text-h1` at 22 px and `text-hint` at 11.5 px.

## Decisions

### D1. Header: a breadcrumb in the compact head

- **From 1024 px:**
  - The page keeps one `PageHeader` (tool kind). Its `leading` slot is a link "Settings" followed by a chevron, and its title is the section's name, so the `h1` stays the section name. Focus after navigation and the existing tests keep their target.
  - The header spans the surface, so the sidebar toggle is first at the surface's left edge, as on every other page.
  - Help stays at the right.
- **Below 1024 px:** the header keeps its back action to the list instead of the crumb, unchanged.

### D2. The navigation pane

- **The grid:** from 1024 px, `grid-cols-[14.25rem_minmax(0,1fr)]` (228 px) under the header. The pane has a `border-soft` hairline on its right and fills the height of the surface; it is sticky and scrolls on its own when the list is taller than the window.
- **Pane content:**
  - First, the search field with a `/` key hint inside it.
  - Then the groups, labelled at `text-hint` in normal case and muted.
  - Then the rows: 30 px, icon at 15 px, name at 13 px. The current row is `bg-selected text-strong`, and hover is `bg-hover`.
- **The `/` key:** a new registry entry `settings.search` (view scope, `settings`) focuses the field.
- **What leaves the pane:** the profile card, the per-section descriptions and the free-software footer.
- **The phone list:** the full-screen list below 1024 px keeps all three, since there the list is the page.

### D3. The page: title, lead line, flat sections

- **Title and lead line:**
  - From 1024 px, the page starts with a 22 px title (`text-h1`) and the section's own one-line description (the same string the list shows) as the lead line, muted, at most 72 ch.
  - The visible title is decorative (`aria-hidden`). The header's `h1` already names the page, and a second heading with the same text would be announced twice.
  - Below 1024 px the shell's phone bar carries the title, so this block is hidden.
- **Content width:** 45 rem, the mock-up's row width; Workspaces keeps its two panes at 56 rem.
- **Flat sections:**
  - `SettingsSection` loses its tiers. Every section is flat: a heading at the label step (`text-meta` medium, muted) with no icon, its one line under it, then rows. Each row has a `border-soft` hairline above it, and the last row has one below it.
  - Sections are 32 px apart, and the page has no other separator.
  - The `tier` prop and `SETTINGS_TIER_CLASS` are removed with their eleven `tier="primary"` callers; no other branch passes a tier.
- **Rows:**
  - The label is 13 px medium (`text-body font-medium`) and the description 12.5 px muted.
  - Rows are 12 px tall in padding (a row with a description is about 56 px, matching the mock-up). The control column sits right from 640 px and stacks below it, as today.

### D4. Controls

- **Switch:**
  - A 32 × 18 px track with a 14 px knob. Off is `bg-selected` with a `border-strong` edge; on is the accent.
  - A `touch-target` utility keeps the hit area at 44 px on touch.
  - The same component is used everywhere, so every switch in the app changes. It was already the settings control, and the mock-up's density applies to all of them.
- **Select:**
  - `select.ui-input` loses the native arrow (`appearance: none`) and draws a chevron with two gradients in the muted text token, so there is no hex and no image; the right padding makes room for it.
  - Inside a settings row's control column (`[data-setting-control]`), inputs, selects and buttons use the small 32 px size, so a row's control is as tall as the mock-up's. Elsewhere they keep 40 px.
- **`StatusIndicator` (new, `web/src/ui/StatusIndicator.tsx`):**
  - An inline 6 px dot in a tone (`ok`, `warn`, `danger`, `busy`, `off`), then the word in `text-meta text-muted`. The word always carries the meaning, so colour is never alone.
  - `busy` pulses unless reduced motion is on.
  - It has a story in light and dark.

### D5. Which badges become dots

- **State becomes a dot:** On/Off, Configured, Ready or Connecting, Working, Failing, Test sent or failed, a backup run's outcome, a webhook delivery, an invitation's status, a user's Active or Deactivated, the push permission, the two-factor policy, the encryption state and the digest summary.
- **Categories stay badges:** a role, a token scope, Default, This device, Titles, Encrypted, SSO only, Revoked, the version and Suspicious.
- **The mapping from the old hues:** green to `ok`, orange to `warn`, red to `danger`, blue to `busy`, slate to `off`.

### D6. The stale path

"Settings → AI → X" becomes "Settings → Integrations → X" everywhere outside the CHANGELOG's history and the archived changes. The server's two error strings change too; they are messages, not codes, and no client matches on them.

## Data model

None. No op, field, route or migration.

## Size

No dependency. `StatusIndicator` is about 40 lines. The CSS adds about 1 KB before compression.

## Interface budget

- Settings has no list, so the "2 rows of chrome" budget does not apply. The header is one row.
- Scroll regions: the page, plus the pane when it overflows, which makes two of the three allowed.
- One new shortcut, `/` in the `settings` view scope. It is registered in the registry, and the conflict test covers it against `view.edit-query`, which lives in the `list` scope that Settings never mounts.

## Risks

- **The switch changes across the whole app**, and baselines move wherever one shows: Settings, the display panel and dialogs.
- **A row-scoped size override for buttons** makes a dialog opened from a row keep its own sizes, because the selector only matches descendants of the control column, not portals.
