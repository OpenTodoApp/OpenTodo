// @vitest-environment happy-dom
// task-locations "Setting a location": search pick, permission refused, offline coordinates,
// and no map request while maps are off.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMeta, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { click, flush, mockFetch, render, type, waitFor } from '../../ui/test-utils'
import { LocationEditor } from './LocationEditor'
import { LocationPreview } from './LocationPreview'

let n = 0
let requests: string[] = []
beforeEach(() => {
  useDatabase(`location-editor-${Date.now()}-${n++}`)
  resetDeviceId()
  requests = []
  mockFetch((_m, path) => {
    requests.push(path)
    if (path.startsWith('/api/v1/maps/search')) return { results: [{ name: 'Piazza del Duomo', address: 'Piazza del Duomo, 20122 Milano, Italia', lat: 45.4641, lon: 9.1916 }] }
    if (path.startsWith('/api/v1/maps/reverse')) return { result: { name: 'Via Roma 1', address: 'Via Roma 1, Torino, Italia', lat: 45.07, lon: 7.68 } }
    return {}
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  document.body.innerHTML = ''
})

async function editorFor(title: string) {
  const id = await createTask({ title })
  const { db } = await import('../../lib/db')
  const task = (await db.tasks.get(id))!
  const r = await render(<LocationEditor task={task} onClose={() => undefined} />)
  return { id, db, r }
}

const field = () => document.querySelector<HTMLInputElement>('[data-location-editor] input')!

describe('LocationEditor', () => {
  it('searches an address with maps on and stores the picked result whole', async () => {
    await setMeta('mapsAvailable', true)
    const { id, db } = await editorFor('Meet Anna')
    await waitFor(() => !!document.querySelector('[data-privacy-line]'), 'maps on')
    expect(document.querySelector('[data-privacy-line]')!.textContent).toMatch(/map provider/)
    await type(field(), 'Piazza del Duomo Milano')
    await waitFor(() => !!document.querySelector('[role="option"]'), 'a result')
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('Piazza del Duomo'))!
    await click(option)
    await waitFor(async () => !!(await db.tasks.get(id))?.location, 'the location')
    expect((await db.tasks.get(id))!.location).toEqual({ name: 'Piazza del Duomo', address: 'Piazza del Duomo, 20122 Milano, Italia', lat: 45.4641, lon: 9.1916 })
    expect(requests.some((p) => p.includes('/api/v1/maps/search'))).toBe(true)
  })

  it('says so when the browser refuses the position, and writes nothing', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 1 }) } })
    const { id, db } = await editorFor('Find the car')
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Use my location'))!
    await click(btn)
    await waitFor(() => !!document.querySelector('[data-location-message]')?.textContent?.includes('did not share'), 'the message')
    expect((await db.tasks.get(id))!.location ?? null).toBeNull()
  })

  it('offline: typed coordinates apply at once; maps off means no request to a map route', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    const { id, db } = await editorFor('Parcel locker')
    expect(document.querySelector('[data-privacy-line]')).toBeNull()
    await type(field(), '45.4642, 9.19')
    await waitFor(() => !!document.querySelector('[role="option"]'), 'the coordinates option')
    await click(document.querySelector('[role="option"]')!)
    await waitFor(async () => !!(await db.tasks.get(id))?.location, 'the location')
    expect((await db.tasks.get(id))!.location).toEqual({ lat: 45.4642, lon: 9.19 })
    await flush(50)
    expect(requests.filter((p) => p.includes('/api/v1/maps/'))).toEqual([])
  })
})

describe('LocationPreview', () => {
  it('links to openstreetmap.org on a computer and shows no map with maps off', async () => {
    await render(<LocationPreview shown={{ name: 'Gym', address: '', lat: 45.07, lon: 7.68, encrypted: false }} />)
    const link = document.querySelector<HTMLAnchorElement>('[data-open-in-maps]')!
    expect(link.href).toBe('https://www.openstreetmap.org/?mlat=45.07&mlon=7.68#map=17/45.07/7.68')
    expect(link.rel).toContain('noreferrer')
    expect(document.querySelector('[data-map]')).toBeNull()
    expect(requests).toEqual([])
  })
})
