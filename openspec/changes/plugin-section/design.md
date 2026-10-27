# Design

## Context

See proposal.md. The current state that shapes the approach:

- The command palette's command list is built by one function (`web/src/app/palette/registry.ts` `commands(ctx)`) from a `PaletteContext` built in `CommandPalette.tsx`.
- Settings sections are one data table (`web/src/app/settingsSections.ts`) shared by the list, the routes, the search index and the tests; a one-page section renders through `SectionCards` in `web/src/app/settingsPages.tsx`.
- Synced per-account preferences are additive string fields on `user_prefs` (`internal/sync/ops.go` `Schema`, regenerated into `web/src/generated/opSchema.ts`), read reactively through `useUserPrefsRow()` and written through `mutate()`; `haptics` (`web/src/lib/haptics.ts`) is the smallest existing example.
- The web app has a first-load gzip budget (`web/bundle-budget.json`), a strict CSP and no runtime code loading; end-to-end encryption means anything in the bundle can read decrypted task data.

## Decisions

**D1. Plugins are source folders compiled into the app, registered by static import.** Each plugin lives under `web/src/plugins/<id>/` and is imported by name in `web/src/plugins/registry.ts`. Why: the security model stays untouched (every plugin line is reviewed and shipped in the bundle, nothing is fetched or executed at runtime), the bundle budget stays measurable, and the E2EE guarantee ("only code the user installed can see decrypted data") keeps meaning what it says. Alternatives: (a) runtime loading from a URL or zip — needs a sandbox, signing, a supply-chain story and CSP exceptions, and rejections this project cannot honestly make; rejected. (b) External plugins only through MCP and webhooks — no in-app surface, so it does not satisfy a Settings section that lists and switches plugins; kept as the existing path for out-of-process integration, not as this change.

**D2. A plugin is data plus commands.** A manifest carries `id`, `name`, `description`, an optional icon and optional commands (`id`, `label`, optional `icon`, optional extra search words, `run`). `run` is a function in the bundle and may call the app's own libraries (`ops`, `navigate`, clipboard, the date helpers). Why: the smallest contract that lets a contributor ship something real. A declarative action DSL was rejected as speculative; plugin-owned React views need a route seam that stays out of scope (proposal).

**D3. Enable/disable state is one additive `user_prefs.disabled_plugins` string field.** A comma-separated list of the ids the account turned off; empty or absent means everything is on. Written through `mutate('user_prefs', 'me', …)` like every other preference, so it works offline, syncs to the account's devices and converges by last-writer-wins; an unknown id (from a newer build or a removed plugin) is ignored on read and preserved on write. Why: it is the `sidebar_destinations`/`haptics` recipe exactly — additive, no migration, no server behaviour change. Alternatives: a `plugin_prefs` op entity (deferred with per-plugin settings, proposal out of scope); server-side per-user settings (not synced through the op log, so offline toggles would not converge).

**D4. Plugins is a first-class section in the App group, not an Integrations sub-page.** It holds account-local, offline, per-user switches, which is what the App group holds (language, notifications, capture); Integrations holds features that talk to a server. The section is visible to every signed-in role and needs no demo restrictions (it changes no server feature).

**D5. The palette reads the disabled set through its context.** `PaletteContext` gains an optional `disabledPlugins?: ReadonlySet<string>`; `CommandPalette.tsx` fills it from the reactive `useUserPrefsRow()`, and `commands()` appends the enabled plugins' commands after the app's own. Why: one production context builder exists, the field is optional so older tests and stories keep working, and a disabled plugin's commands disappear on the same render the switch flips.

**D6. One example plugin ships: `daily-digest`.** A single palette command, "Copy today's tasks as Markdown", that writes today's open tasks as a Markdown list to the clipboard. Why: an empty platform cannot be reviewed or tested end to end; this plugin is small, has no settings, touches no sync data and demonstrates every part of the contract (manifest, registration, command, enable switch, palette disappearance). It can be dropped without touching the platform if the maintainers prefer.

**D7. Budgets.** Interface guide: the section is rows with labels of at most 4 words and one-line descriptions (settings-navigation "Settings copy"); no new chrome above content, no new shortcuts (plugin commands ship without keys, so the shortcut registry is untouched), the sidebar's six primary destinations are unchanged. Bundle: measured with `make bundle-budget` after this change — entry 297 KB gzip (296 before), entry and its static imports 667 KB (663 before), both budgets unchanged and with headroom. No new dependency, no server or container size change beyond one schema comment.

**D8. Every new string is translated.** Names, descriptions and command labels go through `msg()`/`t()` and the six shipped catalogs; `make i18n-check` is the gate.

## Data model impact

One additive string field on `user_prefs`: `disabled_plugins` (`internal/sync/ops.go`, with a comment that becomes its documentation). `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema` regenerates `web/src/generated/opSchema.ts`, `internal/e2ee/contentfields.go` and the contract fixture. No migration, no rename, no removal; the field is not content (ids only, never user text), so it is never encrypted and derives no activity event.
