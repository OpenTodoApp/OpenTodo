// When the plugin's vault syncs (obsidian-vault-sync task 4.2) and what it does
// around the engine: the triggers with fake timers, the back-off, a locked
// account, a folder another device owns, taking over and turning off.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from './api'
import { Keyring } from './crypt'
import { memoryStorage } from './storage'
import { MemoryFiles } from './vault/memory'
import { STATE_PATH } from './vault/state'
import { BACKOFF_MS, deviceLabel, EVERY_MS, inFolder, NeedsAdoptError, STABLE_MS, VaultSync } from './vaultSync'
import { FakeServer } from '../test/fakeServer'

const ME = { kind: 'obsidian' as const, install: 'phone-1', label: 'Obsidian on iPhone' }

function setup(o: { encrypted?: boolean; files?: Record<string, string> } = {}) {
  const server = new FakeServer({ encrypted: o.encrypted })
  server.put('project', 'p-home', { name: 'Home', archived: false, deleted_at: null, position: 1000 }, 1)
  server.put('task', 't-1', { title: 'Water the plants', project_id: 'p-home', deleted_at: null, completed_at: null, position: 1000 }, 1)
  const store = memoryStorage()
  const files = new MemoryFiles(Object.fromEntries(Object.entries(o.files ?? {}).map(([p, t]) => [p.replace(/^OpenTodo\//, ''), t])))
  let visible = true
  let online = true
  const changes: string[] = []
  const vs: VaultSync = new VaultSync({
    store, keys: new Keyring(store),
    client: () => new Client('https://todo.example.com', server.token, async (r) => {
      if (!online) throw new Error('offline')
      return server.handle(r)
    }),
    account: () => ({ userId: 'u1', name: 'Ada', email: '', serverVersion: '0.20.0', encrypted: o.encrypted ?? false, dayParts: false, energy: false, tokenName: 'Phone' }),
    server: () => 'https://todo.example.com', files: () => files, owner: () => ME, visible: () => visible,
    changed: () => changes.push(vs.status.kind),
  })
  return { server, store, files, vs, changes, setVisible: (v: boolean) => (visible = v), setOnline: (v: boolean) => (online = v) }
}

const syncs = (s: FakeServer) => s.pushes.length

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-02T09:00:00Z') }))
afterEach(() => vi.useRealTimers())

describe('vault sync in the plugin', () => {
  it('Phone-only user: turning sync on writes one file per project and the state', async () => {
    const h = setup()
    const s = await h.vs.enable('OpenTodo')
    expect(s.kind).toBe('synced')
    expect(h.files.files.get('Home.md')).toBe('---\nopentodo-id: p-home\n---\n\n- [ ] Water the plants 🆔 t-1\n')
    const st = JSON.parse(h.files.files.get(STATE_PATH)!)
    expect(st.owner).toEqual(ME)
    expect(st.device).toMatch(/^vault:[0-9a-f]{24}$/)
    expect(h.server.pushes.every((p) => !p.features.includes('push_only') && p.device === st.device)).toBe(true)
    // Ticking the line completes the task after the next sync.
    h.files.files.set('Home.md', h.files.files.get('Home.md')!.replace('- [ ]', '- [x]'))
    await h.vs.run('command')
    expect(h.server.row('task', 't-1')!.completed_at).toBeTypeOf('number')
  })

  it('a folder with notes is adopted only when the user confirms', async () => {
    const h = setup({ files: { 'OpenTodo/Reading.md': '- [ ] Dune\n' } })
    await expect(h.vs.enable('OpenTodo')).rejects.toBeInstanceOf(NeedsAdoptError)
    expect(h.vs.folder()).toBeNull()
    expect(syncs(h.server)).toBe(0)
    await h.vs.enable('OpenTodo', true)
    expect(h.files.files.get('Reading.md')).toMatch(/^---\nopentodo-id: /)
  })

  it('triggers: a change syncs once the files held still for a second; the interval only while visible', async () => {
    const h = setup()
    await h.vs.enable('OpenTodo')
    const n = syncs(h.server)
    await vi.advanceTimersByTimeAsync(2000) // past the window of the sync's own writes
    h.vs.fileChanged('OpenTodo/Home.md')
    await vi.advanceTimersByTimeAsync(STABLE_MS / 2)
    h.vs.fileChanged('OpenTodo/Home.md')
    await vi.advanceTimersByTimeAsync(STABLE_MS / 2)
    expect(syncs(h.server)).toBe(n)
    await vi.advanceTimersByTimeAsync(STABLE_MS)
    expect(syncs(h.server)).toBe(n + 1)
    // Files outside the folder and the state file do not count.
    await vi.advanceTimersByTimeAsync(2000)
    h.vs.fileChanged('Daily/2026-11-02.md')
    h.vs.fileChanged('OpenTodo/.opentodo/state.json')
    await vi.advanceTimersByTimeAsync(STABLE_MS * 2)
    expect(syncs(h.server)).toBe(n + 1)
    h.vs.tick()
    await vi.advanceTimersByTimeAsync(0)
    expect(syncs(h.server)).toBe(n + 2)
    h.setVisible(false)
    h.vs.tick()
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(syncs(h.server)).toBe(n + 2)
  })

  it('Offline edit: a failed sync changes nothing and is retried after 30 s, 1, 2 and 5 minutes', async () => {
    const h = setup()
    await h.vs.enable('OpenTodo')
    const before = h.files.files.get(STATE_PATH)
    h.files.files.set('Home.md', h.files.files.get('Home.md')!.replace('Water the plants', 'Water the ferns'))
    h.setOnline(false)
    const waits: number[] = []
    for (let i = 0; i < 5; i++) {
      const s = i === 0 ? await h.vs.run('interval') : h.vs.status
      expect(s.kind).toBe('failed')
      const at = (s as { retryAt: number }).retryAt
      waits.push(at - Date.now())
      // An automatic trigger inside the wait does nothing.
      h.vs.tick()
      await vi.advanceTimersByTimeAsync(at - Date.now())
    }
    expect(waits).toEqual([...BACKOFF_MS, BACKOFF_MS[3]])
    expect(h.files.files.get(STATE_PATH)).toBe(before)
    h.setOnline(true)
    await h.vs.run('command')
    expect(h.vs.status.kind).toBe('synced')
    expect(h.server.row('task', 't-1')!.title).toBe('Water the ferns')
  })

  it('Locked encrypted account: the sync is skipped and nothing is sent', async () => {
    const h = setup({ encrypted: true })
    h.store.set('vaultFolder', 'OpenTodo')
    const s = await h.vs.run('load')
    expect(s.kind).toBe('locked')
    expect(syncs(h.server)).toBe(0)
    expect(h.files.files.size).toBe(0)
  })

  it('Replicated folder: another device’s folder is not synced until taken over; turning off gives it up', async () => {
    const h = setup()
    await h.vs.enable('OpenTodo')
    const st = JSON.parse(h.files.files.get(STATE_PATH)!)
    st.owner = { kind: 'cli', install: 'laptop', label: 'laptop' }
    st.lease_until = Date.now() + 60_000
    h.files.files.set(STATE_PATH, JSON.stringify(st))
    const n = syncs(h.server)
    const s = await h.vs.run('interval')
    expect(s).toMatchObject({ kind: 'owned', owner: { label: 'laptop' }, running: true })
    expect(syncs(h.server)).toBe(n)
    const t = await h.vs.takeOver()
    expect(t.kind).toBe('synced')
    const after = JSON.parse(h.files.files.get(STATE_PATH)!)
    expect(after.owner).toEqual(ME)
    expect(after.device).not.toBe(st.device)
    await h.vs.disable()
    expect(h.vs.folder()).toBeNull()
    const released = JSON.parse(h.files.files.get(STATE_PATH)!)
    expect(released.owner).toBeUndefined()
    expect(released.lease_until).toBeUndefined()
  })

  it('a folder with TaskNotes linked is left to ot vault', async () => {
    const h = setup({ files: { 'OpenTodo/.opentodo/state.json': JSON.stringify({ version: 2, device: 'vault:x', profile: 'default', server: 'https://todo.example.com', cursor: 0, clock: 0, offset: 0, store: {}, files: {}, printed: {}, initialized: true, tasknotes: { folder: 'Tasks', notes: {}, hashes: {} } }) } })
    const s = await h.vs.enable('OpenTodo')
    expect(s.kind).toBe('tasknotes')
    expect(syncs(h.server)).toBe(0)
  })

  it('labels, folders and Send line', () => {
    expect(deviceLabel({ isIosApp: true, isPhone: true })).toBe('Obsidian on iPhone')
    expect(deviceLabel({ isIosApp: true, isTablet: true })).toBe('Obsidian on iPad')
    expect(deviceLabel({ isAndroidApp: true })).toBe('Obsidian on Android')
    expect(inFolder('OpenTodo/Home.md', 'OpenTodo')).toBe(true)
    expect(inFolder('OpenTodoNotes/Home.md', 'OpenTodo')).toBe(false)
    expect(inFolder('Daily/x.md', null)).toBe(false)
  })
})
