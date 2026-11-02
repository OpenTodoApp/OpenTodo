// @vitest-environment happy-dom
// routines-editor-no-modals: Add step expands in place (at the end, inside a
// Repeat, below a card), the trigger's kinds open as the anchored word list
// with their details inside the When card, the When card's condition opens in
// the card, a step is deleted at once with Undo, Test with AI asks in the Test
// panel, and Describe it expands on the Routines page. None opens a dialog.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { resetDeviceId } from '../../lib/ops'
import { publishEncryption } from '../../lib/e2ee'
import { resetCatalogueCache } from '../../lib/rules/catalogue'
import type { RoutineDraft } from '../../lib/rules/draft'
import { bulkToast, hideBulkToast } from '../bulk/toastStore'
import { click, key, mockFetch, render, type, waitFor } from '../../ui/test-utils'
import { RoutineEditor } from './RoutineEditor'

let n = 0

/** Media queries answer as on a screen of this width (useMediaQuery, useWide). */
function screenWidth(px: number) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = /min-width:\s*([\d.]+)(rem|px)/.exec(q)
    const at = min ? Number(min[1]) * (min[2] === 'rem' ? 16 : 1) : 0
    return { matches: px >= at, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }
  })
}

beforeEach(() => {
  useDatabase(`routines-no-modals-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  resetCatalogueCache()
  publishEncryption({ enabled: false })
  mockFetch((_method, path) => {
    if (path === '/api/v1/me/rules') return { enabled: true, paused: false, rules: {} }
    if (path === '/api/v1/me/rules/catalogue') return { steps: [] }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    return {}
  })
  screenWidth(1280)
})
afterEach(() => {
  hideBulkToast()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-step-card]')]
const byKind = (kind: string) => document.querySelector<HTMLElement>(`[data-step-kind="${kind}"]`)!
const panel = () => document.querySelector<HTMLElement>('[data-add-step-panel]')
/** No dialog opened: neither a centred one nor any element with a dialog role. */
const noDialog = () => {
  expect(document.querySelector('[data-overlay="dialog"]')).toBeNull()
  expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull()
}

const draft: RoutineDraft = {
  name: 'Nudge', trigger: { kind: 'manual' }, condition: null, steps: [
    { id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } },
    { id: 'c', kind: 'repeat', in: { list: { ref: 'a' } }, do: [] },
  ],
}

async function editor(d: RoutineDraft = draft) {
  const r = await render(<RoutineEditor draft={d} onBack={() => {}} />)
  await waitFor(() => cards().length >= d.steps.length, 'the cards')
  return r
}

describe('routine editor without modals', () => {
  it('Add step expands in place under "+ Add step", searchable by keyboard, and the step lands there', async () => {
    const r = await editor()
    const add = document.querySelector<HTMLButtonElement>('[data-add-step]')!
    expect(add.getAttribute('aria-expanded')).toBe('false')
    await click(add)
    await waitFor(() => !!panel(), 'the catalogue')
    noDialog()
    expect(add.getAttribute('aria-expanded')).toBe('true')
    expect(add.getAttribute('aria-controls')).toBe(panel()!.id)
    // Right under the button, in the column, with its search focused and the groups listed.
    expect(add.nextElementSibling).toBe(panel())
    const search = panel()!.querySelector<HTMLInputElement>('input[role="combobox"]')!
    expect(document.activeElement).toBe(search)
    expect(panel()!.querySelectorAll('[role="option"]').length).toBeGreaterThan(10)
    await type(search, 'count')
    await waitFor(() => panel()!.querySelector('[role="option"] [data-add-kind="count"]') !== null, 'the result')
    await key(search, 'Enter')
    await waitFor(() => cards().length === 3, 'the new card')
    expect(panel()).toBeNull()
    expect(cards()[2].getAttribute('data-step-kind')).toBe('count')
    await r.unmount()
  })

  it('Escape collapses the catalogue and focus goes back to "+ Add step"; pressing it again closes it too', async () => {
    const r = await editor()
    const add = document.querySelector<HTMLButtonElement>('[data-add-step]')!
    await click(add)
    await waitFor(() => !!panel(), 'the catalogue')
    await key(panel()!.querySelector('input')!, 'Escape')
    await waitFor(() => !panel(), 'collapsed')
    await waitFor(() => document.activeElement === add, 'focus back on + Add step')
    await click(add)
    await waitFor(() => !!panel(), 'open again')
    await click(add)
    await waitFor(() => !panel(), 'toggled closed')
    await r.unmount()
  })

  it('inside a Repeat the catalogue opens in its block, and the step is added there', async () => {
    const r = await editor()
    const lane = document.querySelector<HTMLElement>('[data-lane="do"]')!
    await click(lane.querySelector('[data-add-in="c.do"]')!)
    await waitFor(() => !!panel(), 'the catalogue')
    noDialog()
    expect(lane.contains(panel())).toBe(true)
    await type(panel()!.querySelector('input')!, 'comment')
    await waitFor(() => !!panel()!.querySelector('[data-add-kind="add_comment"]'), 'the result')
    await click(panel()!.querySelector('[data-add-kind="add_comment"]')!)
    await waitFor(() => !!lane.querySelector('[data-step-kind="add_comment"]'), 'the comment in the block')
    await r.unmount()
  })

  it('"Add step below" (the card key a) opens the catalogue between the card and the next one', async () => {
    const r = await editor()
    byKind('find_tasks').focus()
    await key(byKind('find_tasks'), 'a')
    await waitFor(() => !!panel(), 'the catalogue')
    noDialog()
    expect(byKind('find_tasks').nextElementSibling).toBe(panel())
    await key(panel()!.querySelector('input')!, 'Escape')
    await waitFor(() => document.activeElement === byKind('find_tasks'), 'focus back on the card')
    await r.unmount()
  })

  it('the trigger word opens its kinds as the anchored word list; a schedule\'s time and days edit inside the When card', async () => {
    const r = await editor()
    const when = document.querySelector<HTMLButtonElement>('[data-when-card] [data-word="When"]')!
    await click(when)
    await waitFor(() => !!document.querySelector('[data-word-choices] [role="listbox"]'), 'the list')
    expect(when.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[data-overlay="dialog"]')).toBeNull()
    // The word pickers' anchored list, not a sheet or a form.
    expect(document.querySelector('[data-word-choices]')!.closest('[data-overlay="popover"]')).toBeTruthy()
    const options = [...document.querySelectorAll('[data-word-choices] [role="option"]')]
    expect(options.map((o) => o.textContent)).toContain('On a schedule')
    await click(options.find((o) => o.textContent === 'On a schedule')!)
    await waitFor(() => !!document.querySelector('[data-when-card] [data-trigger-details]'), 'the details in the card')
    noDialog()
    const details = document.querySelector<HTMLElement>('[data-trigger-details]')!
    expect(details.contains(document.activeElement)).toBe(true)
    expect(details.querySelector('input[type="time"]')).toBeTruthy()
    await click([...details.querySelectorAll('button')].find((b) => b.textContent === 'Mon')!)
    await key(document.activeElement!, 'Escape')
    await waitFor(() => !document.querySelector('[data-trigger-details]'), 'closed')
    await waitFor(() => document.activeElement === document.querySelector('[data-when-card] [data-word="When"]'), 'focus back on the word')
    expect(document.querySelector('[data-when-card] [data-word="When"]')!.textContent).toMatch(/Monday/)
    await r.unmount()
  })

  it('the When card\'s condition opens inside the card from 1024 px', async () => {
    const r = await editor({ ...draft, trigger: { kind: 'task.created' } })
    await click(document.querySelector('[data-when-card] [data-word="Condition"]')!)
    await waitFor(() => !!document.querySelector('[data-when-card] [data-word-inspector] [data-rule-condition]'), 'the rows in the card')
    noDialog()
    await r.unmount()
  })

  it('Delete step removes the card at once and Undo in the toast brings it back in place', async () => {
    const r = await editor({ ...draft, steps: [...draft.steps, { id: 'e', kind: 'count', in: { list: { ref: 'a' } } }] })
    byKind('repeat').focus()
    await key(byKind('repeat'), 'Delete')
    await waitFor(() => cards().every((c) => c.getAttribute('data-step-kind') !== 'repeat'), 'deleted')
    noDialog()
    expect(document.activeElement?.getAttribute('data-step-card')).toBe('e')
    const toast = bulkToast()!
    expect(toast.label).toBe('Step deleted: Repeat for each')
    await act(() => toast.action!.run())
    await waitFor(() => cards().map((c) => c.getAttribute('data-step-card')).join() === 'a,c,e', 'back in place')
    await r.unmount()
  })
})

async function act(fn: () => unknown) {
  const { act: reactAct } = await import('react')
  await reactAct(async () => { await fn() })
}

describe('a draft with no steps', () => {
  it('still offers the catalogue in place, and it never lists Get a specific task', async () => {
    const r = await editor({ ...draft, steps: [] })
    await click(document.querySelector('[data-add-step]')!)
    await waitFor(() => !!panel(), 'the catalogue')
    noDialog()
    expect(panel()!.querySelector('[data-add-kind="get_task"]')).toBeNull()
    expect(await db.rules.count()).toBe(0)
    await r.unmount()
  })
})
