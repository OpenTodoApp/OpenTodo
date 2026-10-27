// The plugin contract guard (OpenSpec change plugin-section, plugins "Built-in
// plugin manifest"): every folder under src/plugins is a registered plugin with
// a valid manifest, and each manifest and command keeps the settings-copy rules.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLUGINS, pluginCommands } from './registry'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const folders = readdirSync(HERE, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
const MANIFEST_KEYS = ['id', 'name', 'description', 'icon', 'commands']
const COMMAND_KEYS = ['id', 'label', 'icon', 'keywords', 'run']
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

describe('the plugin registry', () => {
  it('registers every plugin folder exactly once, by its folder name', () => {
    expect(PLUGINS.map((p) => p.id).sort()).toEqual(folders)
    expect(new Set(PLUGINS.map((p) => p.id)).size).toBe(PLUGINS.length)
  })

  it('every manifest is kebab-case, carries only known fields and keeps the settings copy rules', () => {
    for (const p of PLUGINS) {
      expect(p.id).toMatch(KEBAB)
      expect(Object.keys(p).filter((k) => !MANIFEST_KEYS.includes(k))).toEqual([])
      expect(p.name.split(/\s+/).length).toBeLessThanOrEqual(4)
      expect(p.description.length).toBeLessThanOrEqual(90)
      expect(typeof p.description).toBe('string')
    }
  })

  it('every command is kebab-case, unique within its plugin and carries only known fields', () => {
    for (const p of PLUGINS) {
      const ids = (p.commands ?? []).map((c) => c.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const c of p.commands ?? []) {
        expect(c.id).toMatch(KEBAB)
        expect(Object.keys(c).filter((k) => !COMMAND_KEYS.includes(k))).toEqual([])
        expect(c.label.length).toBeGreaterThan(0)
        expect(typeof c.run).toBe('function')
      }
    }
  })

  it('commands follow the account switches: a disabled plugin is left out, an unknown id changes nothing', () => {
    const all = pluginCommands(undefined)
    expect(all.length).toBeGreaterThan(0)
    expect(pluginCommands(new Set(PLUGINS.map((p) => p.id)))).toEqual([])
    expect(pluginCommands(new Set(['not-shipped']))).toEqual(all)
    // Each command id is prefixed with its plugin id, so the plugins cannot collide.
    expect(all.every((c) => PLUGINS.some((p) => c.id.startsWith(`${p.id}:`)))).toBe(true)
    const digestIds = new Set(all.filter((c) => c.id.startsWith('daily-digest:')).map((c) => c.id))
    expect(pluginCommands(new Set(['daily-digest']))).toEqual(all.filter((c) => !digestIds.has(c.id)))
  })
})
