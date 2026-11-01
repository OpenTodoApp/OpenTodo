# Design: theme-instance-default

## Context

`theme-engine` stores each member's choice per side in `user_prefs.theme_light` and `theme_dark`, where `""` means the side's default and `instance:<id>` is reserved; it validates documents with `internal/themes` and applies the cached resolution before the first paint. `theme-editor` adds custom themes, file import and export. `instance-branding` keeps the instance name and logo as owner settings in `internal/settings`, edited in Settings › Server › Branding through owner-only routes refused on the demo instance and recorded as `settings.changed`; the app remembers the branding on the device. Routes are registered through `routes.handle(pattern, policy, handler)` with the demo deny list in `internal/httpapi/demo.go`.

## Goals / Non-Goals

**Goals:** an owner-chosen default per side that members get without any write; a small set of house themes for everyone; offline and first-frame behaviour like the rest of appearance; no environment variable.

**Non-Goals:** locking themes, theming pre-sign-in screens, per-workspace themes.

## Decisions

### D1. Storage: two settings

- `themes.default`: `{ "light": "<choice>", "dark": "<choice>" }`, each `""` (OpenTodo's), `builtin:<id>` or `instance:<id>`; a choice of the wrong kind or an unknown id is refused with `invalid_input`.
- `themes.instance`: a list of at most 20 documents (`MaxInstanceThemes`), each validated by `internal/themes.Validate` and at most 16 KB; the server sets each document's `id` to a fresh server id on add (`instance:<id>` in choices).

Both are owner settings in the tenant's database, so they are in the backups and per tenant on a multi-tenant host. Neither goes through the op log: they are server state like branding, not a member's data, and members cannot write them. An instance theme deleted by the owner stops being offered; a member who chose it reads it as unavailable and falls back (theme-engine D6), keeping the stored choice.

- *Alternative: an environment variable `OPENTODO_DEFAULT_THEME`.* Rejected: AGENTS.md non-negotiable 5 (no new mandatory env vars) allows an optional one, but a theme is chosen by looking at it, which only Settings can do, and a variable cannot carry instance themes.
- *Alternative: write the default into each new account's `user_prefs`.* Rejected: it would freeze the default at sign-up, changing it later would not reach anyone, and it would write ops the member never made.

### D2. Routes

| Route | Policy | Body / answer | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/themes/instance` | `signedIn` (read tokens too) | `{ default: {light, dark}, themes: [doc…], version }` | `unauthorized` |
| `PUT /api/v1/settings/themes/default` | `ownerOnly("set the default theme").DemoDenied()` | `{light, dark}` | `unauthorized`, `forbidden`, `invalid_input` |
| `PUT /api/v1/settings/themes/instance/{id}` | `ownerOnly("change an instance theme").DemoDenied()` | a theme document; `{id}` is `new` to add | `unauthorized`, `forbidden`, `invalid_input`, `too_large` (over 16 KB), `limit_reached` (a 21st), `not_found` |
| `DELETE /api/v1/settings/themes/instance/{id}` | `ownerOnly("remove an instance theme").DemoDenied()` | — | `unauthorized`, `forbidden`, `not_found` |

Removing an instance theme that is the instance default also clears that side of the default in the same transaction. Each write is recorded as `settings.changed` with the key and the theme id (`themes.default` with both ids, `themes.instance` with `added`, `changed` or `removed` and the id), never the document. `version` only grows with every change, so devices can tell when to refetch. The deny list in `demo.go` gains the three write routes (the test checks they agree).

The read is `signedIn`, not `public`: pre-sign-in screens stay neutral (D5), and the member list of themes is no one else's business.

### D3. On the device

- After sign-in and on every sync wake, the app fetches `GET /api/v1/themes/instance` when the `version` the server reports in `auth/status` (`themes: {version}`, next to `branding`) differs from the one cached. The answer is cached on the device (`ot.instanceThemes`), so offline use and later starts have it.
- A side whose choice is `""` resolves to the instance default for that side when one is set and available, else to OpenTodo's theme. The resolution is cached for the first frame like any other theme (theme-engine D5), so a member never sees OpenTodo's theme flash before the house theme.
- The theme lists show instance themes in a "From this server" group after OpenTodo's themes, with the instance name as the credit when the document has no author. Members can choose them (`instance:<id>`) or customise a copy (`theme-editor`); they cannot edit or delete them.
- The Light and Dark lists mark the instance default as "Server default" and the current default choice reads "Default (Server default: <name>)".

### D4. The owner's controls

The Branding card (`instance-branding`) gains, below the name and logo:
- **Default theme:** two pickers, Light and Dark, listing OpenTodo, built-in and instance themes of each kind, with a preview strip;
- **Server themes:** the instance themes as cards, with Add from file (`.opentodo-theme.json`, validated on the device first, then on the server), Offer one of my themes (copies one of the owner's custom themes; the copy is independent), and Remove.
The card is unavailable offline (it shows the last values read-only), like the rest of Branding. The card keeps the Settings section pattern; no new route in the app, scroll region or shortcut, so the interface budget is unchanged.

### D5. What stays neutral

Sign-in, invitation, reset and share-capture screens before an account is known, the emails (plain text), the install splash and the instance's icons keep OpenTodo's neutral colours. The theme needs an account to be read, and these screens are shared by everyone, including people who chose no theme; branding already covers their identity.

## Data model

Server settings `themes.default` and `themes.instance` (D1). No op schema change. `auth/status` gains `themes: {version}`. Member choices keep their stored values; `""` gains the "instance default first" reading.

## Bundle, binary and memory

Under 0.5 KB gzip on first load (resolving `""` through the cached default and the `auth/status` check); the owner's controls load with Settings, which is already lazy for the server sections. Server: four handlers and the validator call, a few KB; settings rows up to 320 KB on disk. Memory on the device: the cached instance themes, at most 320 KB in storage and the resolved active theme in the page.

## Risks / Trade-offs

- [The owner picks a low-contrast instance theme] → the server validates format only; the Branding card shows the same contrast warnings as the editor and asks to confirm a theme with warnings as the default.
- [Members surprised by a theme change] → only members who never chose a theme follow the default; Settings names the server default so it is clear where the look comes from.
- [Stale instance themes on a device that rarely syncs] → the `version` in `auth/status` triggers a refetch on the next start online.

## Migration Plan

Additive. Without a default, `""` reads as OpenTodo's themes as before. Rollback leaves the settings stored and unused; `instance:` choices read as the default.

## Open Questions

- Should the instance default also theme the sign-in screens (it would need the default's document in the public `auth/status`)? Deferred; branding covers those screens today.
