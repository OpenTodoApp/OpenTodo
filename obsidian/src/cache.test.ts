import { describe, expect, it } from 'vitest'
import { Client, type Request } from './api'
import { Lists, REFRESH_MS } from './cache'
import { memoryStorage } from './storage'

function server(projects: unknown[], labels: unknown[] = []) {
  let calls = 0
  let offline = false
  const request: Request = async (req) => {
    calls++
    if (offline) throw new Error('offline')
    const body = req.url.endsWith('/projects') ? { projects } : { labels }
    return { status: 200, text: JSON.stringify(body), json: body, headers: {}, arrayBuffer: new ArrayBuffer(0) }
  }
  return { client: new Client('https://t.example', 'tok', request), calls: () => calls, setOffline: (v: boolean) => (offline = v) }
}

describe('lists', () => {
  it('offers only projects the user may add to: no viewer, archived or deleted project', async () => {
    const s = server([
      { id: 'p-own', name: 'Home', position: 2 },
      { id: 'p-edit', name: 'Family', role: 'editor', owner_id: 'u2', position: 1 },
      { id: 'p-view', name: 'Their plans', role: 'viewer', owner_id: 'u2' },
      { id: 'p-old', name: 'Old', archived: true },
      { id: 'p-gone', name: 'Gone', deleted_at: 5 },
    ], [{ id: 'l1', name: 'errand' }, { id: 'l2', name: 'gone', deleted_at: 1 }])
    const lists = new Lists(memoryStorage())
    await lists.refresh(s.client, null)
    expect(lists.projects().map((p) => p.id)).toEqual(['p-edit', 'p-own'])
    expect(lists.shared('p-edit') && !lists.shared('p-own')).toBe(true)
    expect(lists.labels().map((l) => l.name)).toEqual(['errand'])
  })

  it('reads at most every five minutes unless forced, and keeps the last lists offline', async () => {
    const s = server([{ id: 'p1', name: 'Home' }])
    const store = memoryStorage()
    const lists = new Lists(store)
    await lists.refresh(s.client, null, { now: 10 * REFRESH_MS })
    expect(s.calls()).toBe(2)
    expect(await lists.refresh(s.client, null, { now: 11 * REFRESH_MS - 1 })).toBe(false)
    expect(s.calls()).toBe(2)
    s.setOffline(true)
    await expect(lists.refresh(s.client, null, { force: true })).rejects.toThrow()
    // The sheet still has the cached list, also after a restart.
    expect(new Lists(store).projects().map((p) => p.name)).toEqual(['Home'])
  })
})
