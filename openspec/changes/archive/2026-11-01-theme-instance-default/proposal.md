# Proposal: theme-instance-default

## Why

A family, club or company server already carries its own name and logo (`instance-branding`); its look should be able to match. The owner of an instance wants new members to start in the server's theme, and to offer a few house themes to everyone without each member importing a file. Today every account starts in OpenTodo Light and Dark and themes are personal. This is the last of the four "Themes" changes in ROADMAP 0.20 (prioritised); it depends on `theme-engine` and reuses the files and validation of `theme-editor`.

## What Changes

- **Instance default theme.** In Settings › Server › Branding, the owner chooses the default light theme and default dark theme of the instance from the built-in, OpenTodo and instance themes. A member whose side is empty (`""`, never chosen) sees the instance default instead of OpenTodo's; a member's own choice always wins. Clearing the default brings OpenTodo's back.
- **Instance themes.** The owner adds up to 20 instance themes by importing a `.opentodo-theme.json` or by offering one of their own custom themes to the instance; every member sees them in their theme lists as "From this server" and can choose them (`instance:<id>`) or customise a copy. Each is validated by `internal/themes` and at most 16 KB.
- **Routes.** `GET /api/v1/themes/instance` for every signed-in member (the default and the instance themes); owner-only `PUT /api/v1/settings/themes/default`, `PUT` and `DELETE /api/v1/settings/themes/instance/{id}`, refused on the demo instance, recorded as `settings.changed`.
- **Offline and first frame.** The device remembers the instance default and the instance themes it last read, so they work offline and the first frame uses them; a device that has never read them uses OpenTodo's themes until it does.
- No new environment variable: the default is set in Settings only.

## Out of scope

- Forcing a theme on members or hiding the other themes: the instance default is a default, never a lock.
- Theming the sign-in, invitation and reset screens before an account is known, the emails, the install splash and the icons: they stay neutral, as with `instance-branding`.
- Per-workspace or per-project themes.
- An environment variable or config file for the default theme.
- CLI and MCP commands (`theme-engine` D12).

Advances ROADMAP 0.20 "Themes" (prioritised), fourth of four changes; issue #638.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `themes`: new requirements for the instance default theme of each side, instance themes offered to every member, their routes, and their offline behaviour.
- `instance-branding`: the Branding card gains the default theme and the instance themes.

## Impact

- **Data model:** server settings only (`themes.default` with `light` and `dark` ids, `themes.instance` with up to 20 documents), not synced through the op log, in the server backup like every setting. The member's choice keeps its meaning: `""` now means "the instance default, else OpenTodo's", which older clients read as OpenTodo's. Nothing **BREAKING**; no environment variable.
- **API:** four routes with their policies (`signedIn` for the read; `ownerOnly(...).DemoDenied()` for the writes, with matching entries in the demo deny list), `docs/api.md`. Errors `unauthorized`, `forbidden`, `invalid_input`, `too_large`, `limit_reached`, `not_found`.
- **Audit:** `settings.changed` with keys `themes.default` and `themes.instance` (the theme id only, never its document).
- **Multi-tenant host:** per tenant, like every setting; no host-level default.
- **Web:** the Branding card, the theme lists' "From this server" group, the cache of the instance themes, `web/src/lib/api.ts`.
- **Bundle:** under 0.5 KB gzip on first load (reading the cached default); the Branding card's theme controls load with Settings. Server binary: a few KB. No dependency.
- **i18n:** about ten new strings in the six catalogs.

Tracked in #711
Relates to #638
