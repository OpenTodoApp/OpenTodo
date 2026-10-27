// The built-in plugin contract (OpenSpec change plugin-section, plugins "Built-in
// plugin manifest", design D2): a manifest is data — an id, a translated name and
// one-line description, an optional icon and optional commands — and a plugin's
// behaviour is a command's run in this bundle. Plugins are registered by static
// import in registry.ts; the app never loads plugin code at runtime.
import type { IconName } from '../ui'

/** One command a plugin contributes to the palette. */
export interface PluginCommand {
  /** Unique within the plugin, kebab-case. */
  id: string
  /** Source-language message, marked with msg() and translated where shown. */
  label: string
  icon?: IconName
  /** Extra words that find the command in the palette. */
  keywords?: string
  run: () => unknown
}

/** A built-in plugin's manifest (plugins "Built-in plugin manifest"). */
export interface Plugin {
  /** Kebab-case, unique across the registry; the id the account's `disabled_plugins` field names. */
  id: string
  /** Source-language message, marked with msg() and translated where shown; at most 4 words (settings copy). */
  name: string
  /** One line of at most 90 characters in English (settings copy), also marked with msg(). */
  description: string
  icon?: IconName
  commands?: readonly PluginCommand[]
}
