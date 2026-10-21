// @vitest-environment happy-dom
// task-locations screens: the Locations page (4.1), a location's task list (4.2), a
// locked encrypted device (4.4) and the owner's Maps card (5.1).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMeta, useDatabase } from '../../lib/db'
import { createPlace, locationFromPlace, setTaskLocation, shownLocation } from '../../lib/locations'
import { createTask, resetDeviceId } from '../../lib/ops'
import { click, mockFetch, render, waitFor } from '../../ui/test-utils'
import { TaskListView } from '../TaskListView'
import { LocationPreview } from './LocationPreview'
import { MapsServerPanel } from './MapsSettings'
import { PlacesView } from './PlacesView'

let n = 0
let requests: { method: string; path: string; body?: unknown }[] = []
const settings = { enabled: true, tiles_url: 'https://tiles.example/style.json', geocoder_url: 'https://photon.example', locked: [] as string[], defaults: { tiles_url: 'https://tiles.example/style.json', geocoder_url: 'https://photon.example' } }

beforeEach(() => {
  useDatabase(`places-view-${Date.now()}-${n++}`)
  resetDeviceId()
  requests = []
  settings.enabled = true
  settings.locked = []
  mockFetch((method, path, init) => {
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (path === '/api/v1/settings/maps') {
      if (method === 'PUT') Object.assign(settings, JSON.parse(String(init!.body)))
      return settings
    }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {}, maps: settings.enabled }
    if (path.endsWith('/public-links') || path.endsWith('/pages')) return { links: [], pages: [] }
    return {}
  })
  // happy-dom has no WebGL: pretend it does, so a map would be drawn whenever there is a point.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({})) as never)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const mapRequests = () => requests.filter((r) => r.path.startsWith('/api/v1/maps'))
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-place-row]')]

/** Saves a place as a locked encrypted device holds it: ciphertext it cannot read. */
async function lockedPlace(): Promise<string> {
  const { db } = await import('../../lib/db')
  const id = await createPlace({ name: 'Studio', address: 'Via Roma 1', geo: { lat: 45.07, lon: 7.68 } })
  const row = (await db.places.get(id))!
  await db.places.put({ ...row, name: 'enc:v1:AAAA', address: 'enc:v1:BBBB', geo: 'enc:v1:CCCC', _e2ee: { raw: { name: 'enc:v1:AAAA', address: 'enc:v1:BBBB', geo: 'enc:v1:CCCC' } } } as never)
  return id
}

describe('Locations page', () => {
  it('lists the locations in their order with address and open tasks, and moves one down', async () => {
    const office = await createPlace({ name: 'Office', address: 'Via Po 2' })
    await createPlace({ name: 'Gym' })
    const { db } = await import('../../lib/db')
    const task = await createTask({ title: 'Print badges' })
    await setTaskLocation(task, locationFromPlace((await db.places.get(office))!))
    const r = await render(<PlacesView />)
    // The open-task counts follow the live task list, which may arrive after the rows.
    await waitFor(() => rows().length === 2 && /1 open task/.test(rows()[0].textContent ?? ''), 'two rows with their counts')
    expect(rows().map((el) => el.textContent)).toEqual([
      expect.stringMatching(/Office.*Via Po 2.*1 open task/),
      expect.stringMatching(/Gym.*0 open tasks/),
    ])
    await click(document.querySelector('[aria-label="Menu for location Office"]')!)
    const down = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes('Move down'))!
    await click(down)
    await waitFor(() => rows()[0]?.textContent?.includes('Gym') ?? false, 'Gym first')
    await r.unmount()
  })

  it('shows "Encrypted" for a location a locked device cannot read, with no pin and no map request', async () => {
    await setMeta('mapsAvailable', true)
    await lockedPlace()
    const r = await render(<PlacesView />)
    await waitFor(() => rows().length === 1, 'the row')
    expect(rows()[0].textContent).toContain('Encrypted')
    expect(rows()[0].textContent).not.toContain('Via Roma')
    await act(async () => { await new Promise((ok) => setTimeout(ok, 50)) })
    expect(document.querySelector('.h-56')).toBeNull() // no map: nothing to pin
    expect(mapRequests()).toEqual([])
    await r.unmount()
  })

  it('does draw a map for a readable location (the control for the case above)', async () => {
    await setMeta('mapsAvailable', true)
    await createPlace({ name: 'Studio', geo: { lat: 45.07, lon: 7.68 } })
    const r = await render(<PlacesView />)
    await waitFor(() => !!document.querySelector('.h-56'), 'the map box')
    await r.unmount()
  })

  it('a task whose location is encrypted shows no map and no "Open in maps"', async () => {
    await setMeta('mapsAvailable', true)
    const shown = shownLocation({ location: 'enc:v1:DDDD' } as never, new Map())
    const r = await render(<LocationPreview shown={shown} />)
    expect(document.querySelector('[data-location-preview]')).toBeNull()
    expect(mapRequests()).toEqual([])
    await r.unmount()
  })
})

describe("A location's task list", () => {
  it('lists the open tasks linked to the location and completes one', async () => {
    const { db } = await import('../../lib/db')
    const office = await createPlace({ name: 'Office' })
    const linked = await createTask({ title: 'Water the office plants' })
    await setTaskLocation(linked, locationFromPlace((await db.places.get(office))!))
    await createTask({ title: 'Call the bank' })
    const r = await render(<main><TaskListView route={{ view: 'place', id: office }} /></main>)
    await waitFor(() => !!r.container.querySelector('[data-task-id]'), 'a row')
    const titles = [...r.container.querySelectorAll('[data-task-id]')].map((el) => el.textContent)
    expect(titles.some((tt) => tt?.includes('Water the office plants'))).toBe(true)
    expect(titles.some((tt) => tt?.includes('Call the bank'))).toBe(false)
    await click(r.container.querySelector('[aria-label="Complete Water the office plants"]')!)
    await waitFor(async () => !!(await db.tasks.get(linked))?.completed_at, 'completed')
    await r.unmount()
  })
})

describe('Settings → Server → Maps', () => {
  it('shows the switch and providers, and turning maps off saves and refreshes this device', async () => {
    const r = await render(<MapsServerPanel />)
    await waitFor(() => !!document.querySelector('[data-maps-server]'), 'the card')
    const sw = document.querySelector<HTMLElement>('[data-maps-server] [role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await click(sw)
    await waitFor(() => requests.some((q) => q.method === 'PUT' && q.path === '/api/v1/settings/maps'), 'the save')
    expect(requests.find((q) => q.method === 'PUT')!.body).toEqual({ enabled: false })
    await waitFor(() => requests.some((q) => q.path === '/api/v1/me'), 'the refresh')
    await r.unmount()
  })

  it('names the variable and disables what an OPENTODO_MAPS* variable sets', async () => {
    settings.locked = ['enabled', 'tiles_url', 'geocoder_url']
    const r = await render(<MapsServerPanel />)
    await waitFor(() => !!document.querySelector('[data-maps-server]'), 'the card')
    const card = document.querySelector('[data-maps-server]')!
    expect(card.textContent).toContain('Set by OPENTODO_MAPS')
    expect(card.textContent).toContain('Set by OPENTODO_MAPS_TILES_URL')
    expect([...card.querySelectorAll('input')].every((i) => i.disabled)).toBe(true)
    expect([...card.querySelectorAll('button')].some((b) => b.textContent?.includes('Save providers'))).toBe(false)
    await r.unmount()
  })
})
