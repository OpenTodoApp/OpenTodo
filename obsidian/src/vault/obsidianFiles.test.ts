// The Obsidian file adapter (obsidian-vault-sync task 3.2) on the in-memory
// vault of test/obsidian.ts: hidden files through the DataAdapter, Markdown
// files through the Vault, atomic state writes and an editor's newer text kept.
import { describe, expect, it } from 'vitest'
import { App } from 'obsidian'
import { sync } from './engine'
import { ObsidianFiles } from './obsidianFiles'
import { newState, STATE_PATH } from './state'
import { VectorServer } from './memory'

function vaultWith(files: Record<string, string>) {
  const app = new App() as unknown as InstanceType<typeof App> & { files: Map<string, string>; folders: Set<string>; vault: { log: string[] } }
  for (const [p, t] of Object.entries(files)) {
    app.files.set(p, t)
    const parts = p.split('/')
    for (let i = 1; i < parts.length; i++) app.folders.add(parts.slice(0, i).join('/'))
  }
  return app
}

describe('ObsidianFiles', () => {
  it('lists the folder with hidden files, but not hidden folders', async () => {
    const app = vaultWith({ 'OpenTodo/Home.md': 'x', 'OpenTodo/.Work.md.icloud': 'p', 'OpenTodo/.opentodo/state.json': '{}', 'OpenTodo/Sub/Garden.md': 'g', 'Other.md': 'o' })
    const f = new ObsidianFiles(app.vault as never, 'OpenTodo/', app.fileManager)
    expect(await f.list()).toEqual(['.Work.md.icloud', 'Home.md', 'Sub/Garden.md'])
    expect(await f.read('.opentodo/state.json')).toBe('{}')
    expect(await f.read('Missing.md')).toBeNull()
  })

  it('writes notes through the vault and an open editor’s newer text is not overwritten', async () => {
    const app = vaultWith({ 'OpenTodo/Home.md': 'old' })
    const f = new ObsidianFiles(app.vault as never, 'OpenTodo', app.fileManager)
    expect(await f.write('Home.md', 'printed', 'old')).toBe(true)
    expect(app.vault.log).toContain('process OpenTodo/Home.md')
    expect(app.files.get('OpenTodo/Home.md')).toBe('printed')
    // The editor saved a change after the sync read the file: it stays.
    app.files.set('OpenTodo/Home.md', 'typed while syncing')
    expect(await f.write('Home.md', 'printed again', 'printed')).toBe(false)
    expect(app.files.get('OpenTodo/Home.md')).toBe('typed while syncing')
    // A new note in a new folder is created through the vault, so Obsidian indexes it.
    expect(await f.write('Work/Launch.md', 'launch', null)).toBe(true)
    expect(app.vault.log).toContain('create OpenTodo/Work/Launch.md')
    expect(app.folders.has('OpenTodo/Work')).toBe(true)
  })

  it('writes the state as state.json.tmp, then renames it; an interrupted write is read back', async () => {
    const app = vaultWith({ 'OpenTodo/.opentodo/state.json': 'v1' })
    const f = new ObsidianFiles(app.vault as never, 'OpenTodo', app.fileManager)
    await f.writeAtomic(STATE_PATH, 'v2')
    expect(app.vault.log).toEqual(['write OpenTodo/.opentodo/state.json.tmp', 'remove OpenTodo/.opentodo/state.json', 'rename OpenTodo/.opentodo/state.json.tmp OpenTodo/.opentodo/state.json'])
    expect(app.files.get('OpenTodo/.opentodo/state.json')).toBe('v2')
    app.files.delete('OpenTodo/.opentodo/state.json')
    app.files.set('OpenTodo/.opentodo/state.json.tmp', 'v3')
    expect(await f.read(STATE_PATH)).toBe('v3')
  })

  it('removes files and folders left empty', async () => {
    const app = vaultWith({ 'OpenTodo/Work/Work.md': 'w' })
    const f = new ObsidianFiles(app.vault as never, 'OpenTodo', app.fileManager)
    await f.remove('Work/Work.md')
    await f.removeDir('Work')
    expect(app.files.size).toBe(0)
    expect(app.folders.has('OpenTodo/Work')).toBe(false)
  })

  it('a sync through the adapter writes the folder ot vault would', async () => {
    const app = vaultWith({})
    const files = new ObsidianFiles(app.vault as never, 'OpenTodo', app.fileManager)
    const server = new VectorServer()
    server.now = Date.UTC(2026, 10, 2, 9)
    server.log.push(
      { id: 'a', entity: 'project', entityId: 'p-home', field: 'name', value: 'Home', ts: 1, device: 'app' },
      { id: 'b', entity: 'task', entityId: 't-1', field: 'title', value: 'Water the plants', ts: 1, device: 'app' },
      { id: 'c', entity: 'task', entityId: 't-1', field: 'project_id', value: 'p-home', ts: 1, device: 'app' },
    )
    const o = { files, transport: server, userID: 'u1', zone: 'UTC', now: () => server.now }
    await sync({ ...o, state: newState('default', 'https://todo.example.com', 'vault:test') })
    expect(app.files.get('OpenTodo/Home.md')).toBe('---\nopentodo-id: p-home\n---\n\n- [ ] Water the plants 🆔 t-1\n')
    expect(JSON.parse(app.files.get('OpenTodo/.opentodo/state.json')!).device).toBe('vault:test')
    app.files.set('OpenTodo/Home.md', app.files.get('OpenTodo/Home.md')!.replace('- [ ]', '- [x]'))
    await sync(o)
    expect(server.received.find((op) => op.field === 'completed_at')).toMatchObject({ entityId: 't-1', device: 'vault:test' })
  })
})
