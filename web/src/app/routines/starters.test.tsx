// @vitest-environment happy-dom
// routines-starters (tasks 2.1, 2.2): the starters on the Routines page, the
// starters page with its search and keys, and a starter's page with its needs
// and choices; Use this starter opens the editor on an unsaved routine.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createProject, resetDeviceId } from '../../lib/ops'
import { publishEncryption } from '../../lib/e2ee'
import { resetCatalogueCache } from '../../lib/rules/catalogue'
import type { RoutineCatalogueEntry } from '../../lib/types'
import { click, key, mockFetch, render, type, waitFor } from '../../ui/test-utils'
import { parseRoute, routePath } from '../router'
import { RoutinePage } from './RoutinePage'
import { RoutinesView } from './RoutinesView'

let n = 0
let requests: { method: string; path: string }[] = []
let catalogue: RoutineCatalogueEntry[] = []

beforeEach(() => {
  useDatabase(`routine-starters-${Date.now()}-${n++}`)
  resetDeviceId()
  requests = []
  catalogue = []
  localStorage.clear()
  resetCatalogueCache()
  publishEncryption({ enabled: false })
  history.replaceState(null, '', '/routines')
  mockFetch((method, path) => {
    requests.push({ method, path })
    if (path === '/api/v1/me/rules') return { enabled: true, paused: false, rules: {} }
    if (path === '/api/v1/me/rules/catalogue') return { steps: catalogue }
    if (path === '/api/v1/me/rules/runs') return { runs: [] }
    if (path === '/api/v1/webhooks') return { webhooks: [], events: [] }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const button = (text: string | RegExp, root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? '')))
const starterCards = () => [...document.querySelectorAll<HTMLButtonElement>('[data-starter-card]')]
const useButton = () => document.querySelector<HTMLButtonElement>('[data-starter-use]')!
const route = (path: string) => parseRoute(path) as Extract<ReturnType<typeof parseRoute>, { view: 'rules' }>

describe('starters routes', () => {
  it('reads and writes /routines/starters and /routines/starters/<slug>', () => {
    expect(parseRoute('/routines/starters')).toEqual({ view: 'rules', starters: true })
    expect(parseRoute('/routines/starters/morning-focus')).toEqual({ view: 'rules', starters: true, starter: 'morning-focus' })
    expect(routePath({ view: 'rules', starters: true })).toBe('/routines/starters')
    expect(routePath({ view: 'rules', starters: true, starter: 'morning-focus' })).toBe('/routines/starters/morning-focus')
  })
})

describe('Routines page', () => {
  it('"Empty Routines page": New routine and Start from a starter, with the starters listed below', async () => {
    const r = await render(<RoutinesView route={{ view: 'rules' }} />)
    await waitFor(() => starterCards().length >= 8, 'the starters under the empty state')
    expect(document.querySelector('[data-empty-view]')?.textContent).toContain('No routines yet')
    expect(button('New routine', document.querySelector('[data-empty-view]')!)).toBeTruthy()
    expect(button('Start from a starter', document.querySelector('[data-empty-view]')!)).toBeTruthy()
    // The header's entry opens the starters page.
    await click(document.querySelector('[data-open-starters]')!)
    expect(location.pathname).toBe('/routines/starters')
    // A card opens its starter's page.
    await click(document.querySelector('[data-starter-card="groceries-from-note"]')!)
    expect(location.pathname).toBe('/routines/starters/groceries-from-note')
    await r.unmount()
  })
})

describe('Starters page', () => {
  it('searches title, summary and step names, and says when nothing matches', async () => {
    const r = await render(<RoutinesView route={route('/routines/starters')} />)
    await waitFor(() => starterCards().length >= 8, 'the starters')
    const search = document.querySelector<HTMLInputElement>('[data-starter-search]')!
    await type(search, 'email me')
    await waitFor(() => starterCards().length === 1, 'one match')
    expect(starterCards()[0].dataset.starterCard).toBe('friday-digest-email')
    await type(search, 'xylophone')
    await waitFor(() => !!document.querySelector('[data-starter-empty]'), 'no match')
    await r.unmount()
  })

  it('"Keyboard": the search has focus, Down moves through the cards, Up from the first returns to the search', async () => {
    const r = await render(<RoutinesView route={route('/routines/starters')} />)
    await waitFor(() => starterCards().length >= 8, 'the starters')
    const search = document.querySelector<HTMLInputElement>('[data-starter-search]')!
    await waitFor(() => document.activeElement === search, 'search focused')
    await key(search, 'ArrowDown')
    expect(document.activeElement).toBe(starterCards()[0])
    await key(starterCards()[0], 'ArrowDown')
    expect(document.activeElement).toBe(starterCards()[1])
    await key(starterCards()[1], 'ArrowUp')
    await key(starterCards()[0], 'ArrowUp')
    expect(document.activeElement).toBe(search)
    await r.unmount()
  })
})

describe('A starter’s page', () => {
  it('"Unfilled choices", then "Offline starter": Create the suggested project, use it, and the editor opens unsaved', async () => {
    const errands = await createProject({ name: 'Errands' })
    const r = await render(<RoutinesView route={route('/routines/starters/groceries-from-note')} />)
    await waitFor(() => !!document.querySelector('[data-starter-page="groceries-from-note"]'), 'the starter')
    // Errands exists, so that choice is made already; Groceries is still to make.
    await waitFor(() => useButton().textContent === 'Fill 1 choice first', 'one choice left')
    expect(useButton().disabled).toBe(true)
    expect(document.querySelectorAll('[data-starter-step]')).toHaveLength(3)
    const list = document.querySelector('[data-starter-choice="list"]')!
    await click(list.querySelector('[data-word]')!)
    const options = () => [...document.querySelectorAll<HTMLElement>('[data-word-choices] [role="option"]')]
    await waitFor(() => /Create “Groceries”/.test(options()[0]?.textContent ?? ''), 'Create first')
    await click(options()[0])
    await waitFor(() => useButton().textContent === 'Use this starter' && !useButton().disabled, 'ready')
    const groceries = (await db.projects.toArray()).find((p) => p.name === 'Groceries')!
    expect(groceries).toBeTruthy()
    await click(useButton())
    expect(location.pathname).toBe('/routines/new')
    await r.unmount()

    const page = await render(<RoutinePage route={{ view: 'rules', create: true }} />)
    await waitFor(() => document.querySelectorAll('[data-step-card]').length === 3, 'the three steps in the editor')
    expect(document.querySelector<HTMLInputElement>('[data-routine-name]')!.value).toBe('Groceries from a note')
    expect(await db.rules.count()).toBe(0)
    expect(requests.filter((q) => q.method !== 'GET')).toEqual([])
    // The choices are in the steps, so Save needs nothing more.
    await click(document.querySelector('[data-routine-save]')!)
    await waitFor(async () => (await db.rules.count()) === 1, 'saved')
    const rule = (await db.rules.toArray())[0]
    expect(JSON.stringify(rule.steps)).toContain(groceries.id)
    expect(JSON.stringify(rule.steps)).toContain(errands)
    await page.unmount()
  })

  it('"Needs email": the starter says the Email me step is not available and why', async () => {
    catalogue = [{ kind: 'email_me', group: 'communication', available: false, reason: 'email_not_configured' }]
    const r = await render(<RoutinesView route={route('/routines/starters/friday-digest-email')} />)
    await waitFor(() => document.querySelector('[data-starter-need="email_me"]')?.getAttribute('data-available') === 'false', 'not available')
    expect(document.querySelector('[data-starter-need="email_me"]')!.textContent).toContain('outgoing email is not set up on this server')
    // No choices: it can be used straight away.
    expect(useButton().disabled).toBe(false)
    await r.unmount()
  })

  it('a starter that is not in this version says so', async () => {
    const r = await render(<RoutinesView route={route('/routines/starters/no-such-thing')} />)
    await waitFor(() => !!document.querySelector('[data-starter-missing]'), 'missing')
    await r.unmount()
  })
})
