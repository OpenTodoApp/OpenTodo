// The plugin registry (OpenSpec change plugin-section, plugins "Built-in plugin
// manifest", design D1/D2): every built-in plugin, imported statically — the app
// never fetches or executes plugin code at runtime. Names, descriptions and
// command labels are read through t() on every access, so they follow the
// active language like the settings tables do.
import { t, translatedList } from '../lib/i18n'
import { dailyDigest } from './daily-digest'
import type { Plugin, PluginCommand } from './types'

/** Every built-in plugin, in registration order. Static imports only (design D1). */
const REGISTERED: readonly Plugin[] = [dailyDigest]

/** A plugin whose text fields are translated on every access. */
function translated(p: Plugin): Plugin {
  const out = { ...p }
  const name = p.name
  const description = p.description
  Object.defineProperty(out, 'name', { get: () => t(name), enumerable: true })
  Object.defineProperty(out, 'description', { get: () => t(description), enumerable: true })
  const commands = p.commands
  if (commands) Object.defineProperty(out, 'commands', { get: () => translatedList([...commands], 'label'), enumerable: true })
  return out
}

/** The registered plugins, in registration order, following the active language. */
export const PLUGINS: readonly Plugin[] = REGISTERED.map(translated)

/**
 * The commands of the enabled plugins, in registration order, each id prefixed
 * with its plugin id so two plugins cannot collide. `disabled` is the account's
 * `user_prefs.disabled_plugins` list (plugins "Enable and disable state"); an
 * absent set means every plugin is on.
 */
export function pluginCommands(disabled: ReadonlySet<string> | undefined): PluginCommand[] {
  return PLUGINS.filter((p) => !disabled?.has(p.id)).flatMap((p) => [...(p.commands ?? [])].map((c) => ({ ...c, id: `${p.id}:${c.id}` })))
}
