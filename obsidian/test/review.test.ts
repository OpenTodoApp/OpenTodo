// The rules of Obsidian's community directory that read the manifest, the README
// and the directory entry (obsidian-plugin D14): the directory's "Submission
// requirements for plugins" and "Developer policies", and the checks its former
// validation bot ran on every new entry (obsidianmd/obsidian-releases,
// .github/workflows/validate-plugin-entry.yml, removed in May 2026 when the
// directory took over). The source and build checks are `make obsidian-review`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')) as Record<string, unknown>
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const REPO = 'OpenTodoApp/obsidian-opentodo'

/** The directory entry as the README prepares it (its "Releases" section). */
function entry(): Record<string, string> {
  const block = /## Releases[\s\S]*?```json\n([\s\S]*?)```/.exec(readme)
  if (!block) throw new Error('README: no JSON entry under "Releases"')
  return JSON.parse(block[1]) as Record<string, string>
}

describe('manifest', () => {
  it('has the required fields and no others', () => {
    for (const k of ['id', 'name', 'description', 'author', 'version', 'minAppVersion', 'isDesktopOnly']) expect(manifest, k).toHaveProperty(k)
    for (const k of Object.keys(manifest)) expect(['id', 'name', 'description', 'author', 'version', 'minAppVersion', 'isDesktopOnly', 'authorUrl', 'fundingUrl', 'helpUrl']).toContain(k)
  })

  it('id and name: short, without "obsidian" or "plugin"', () => {
    const id = manifest.id as string
    const name = manifest.name as string
    expect(id).toMatch(/^[a-z0-9-_]+$/)
    expect(id.toLowerCase()).not.toContain('obsidian')
    expect(id.toLowerCase().endsWith('plugin')).toBe(false)
    expect(name.toLowerCase()).not.toContain('obsidian')
    expect(name.toLowerCase().endsWith('plugin')).toBe(false)
  })

  it('description: at most 250 characters, ends with a period, no "Obsidian", no "this plugin", no emoji', () => {
    const d = manifest.description as string
    expect(d.length).toBeLessThanOrEqual(250)
    expect(d.endsWith('.')).toBe(true)
    expect(d.toLowerCase()).not.toContain('obsidian')
    expect(d.toLowerCase()).not.toMatch(/this (is a )?plugin/)
    expect(d).toMatch(/^[\x20-\x7e]+$/)
  })

  it('author and links: no email, authorUrl not the plugin repository or obsidian.md, no fundingUrl', () => {
    expect(manifest.author).not.toMatch(/@/)
    expect(String(manifest.authorUrl).toLowerCase()).not.toContain(`github.com/${REPO.toLowerCase()}`)
    expect(manifest.authorUrl).not.toBe('https://obsidian.md')
    // OpenTodo takes no donations through the plugin: fundingUrl is for those only.
    expect(manifest).not.toHaveProperty('fundingUrl')
  })

  it('versions: x.y.z, minAppVersion set, mobile allowed', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(manifest.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(manifest.isDesktopOnly).toBe(false)
  })
})

describe('directory entry', () => {
  it('matches the manifest and names the release repository', () => {
    const e = entry()
    expect(Object.keys(e).sort()).toEqual(['author', 'description', 'id', 'name', 'repo'])
    expect(e).toEqual({ id: manifest.id, name: manifest.name, author: manifest.author, description: manifest.description, repo: REPO })
  })
})

describe('README', () => {
  it('discloses the account it needs, that nothing is paid, and its network use', () => {
    expect(readme).toMatch(/An OpenTodo account/)
    expect(readme).toMatch(/Nothing is paid/)
    expect(readme).toMatch(/## Network use and privacy/)
    expect(readme).toMatch(/only to the OpenTodo server you configure/i)
    expect(readme).toMatch(/collects nothing/i)
    expect(readme).toMatch(/never touches files outside the vault/)
  })

  it('states the licence', () => {
    expect(readme).toMatch(/AGPL-3\.0-only/)
  })
})
