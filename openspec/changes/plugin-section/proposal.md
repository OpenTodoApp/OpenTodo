# plugin-section

## Why

Anyone who wants to add a small feature to OpenTodo has to touch core files: the palette registry, the settings table, the router. The feature then ships unconditionally for every account, with no way to turn it off. A contributor who wants to focus on extensions cannot: there is no seam between "the app" and "an optional module". This change creates that seam as a built-in plugin platform: a manifest contract, one static registry, an enable switch per account, and a Settings section that shows what is installed.

## What changes

- `web/src/plugins/` gains the plugin contract: a `Plugin` manifest type (kebab-case id, translated name and one-line description, optional icon, optional commands), one registry module that imports every plugin statically, and guard tests that fail on a missing manifest, a duplicate id or an unknown field.
- Settings gains a **Plugins** section at `/settings/plugins` (App group, between Capture and About), listing every registered plugin with its name, one-line description and an enable switch, visible to every signed-in role and opening offline.
- One additive `user_prefs.disabled_plugins` field holds the comma-separated ids of the plugins an account has turned off: written through the operation log, offline-safe, converging by last-writer-wins; an unknown id is ignored without rewriting the stored value.
- The command palette lists the commands of enabled plugins only, as ordinary command entries.
- One example plugin ships (`daily-digest`: copy today's open tasks as Markdown) so the contract is exercised end to end.

## Impact

- Affected specs: `plugins` (new capability), `settings-navigation` (the section list gains `plugins`; the group order and counts change), `command-palette` (commands contributed by plugins).
- Affected code: `web/src/plugins/` (new), `web/src/app/router.ts`, `web/src/app/settingsSections.ts`, `web/src/app/settingsPages.tsx`, `web/src/app/PluginsSection.tsx` (new), `web/src/app/palette/{registry.ts,CommandPalette.tsx}`, `web/src/lib/plugins.ts` (new), `internal/sync/ops.go` (one additive field, regenerated contract files), the six translation catalogs, `docs/`.
- ROADMAP.md: no existing item covers in-app extensions; this change introduces the platform itself and leaves a per-plugin roadmap to later changes.
- No new environment variable, no breaking change to the op-log format (one additive string field).
- No new dependency; bundle effect is measured in the pull request (design D7).

## Out of scope

- Runtime installation or loading of third-party plugins (network, zip or URL); every plugin is code in this repository and goes through review like any other code.
- Per-plugin settings storage (a `plugin_prefs` op entity is the natural follow-up).
- Event and automation hooks (reacting to task events); v1 plugins act only when their command runs.
- Backend plugin routes, plugin-owned database tables, plugin-owned views or routes, and a plugin store or directory.
