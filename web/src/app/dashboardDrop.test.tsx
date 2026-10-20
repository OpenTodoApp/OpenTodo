// @vitest-environment happy-dom
// Boards of filters with on-drop rules (OpenSpec change rule-boards, tasks 3.1 and
// 3.2): drop targets, a drag that applies the destination's rule, the held card,
// and Shift+← / Shift+→ to the nearest panel with a rule.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { OnDropRule } from '../lib/types'
import { createView, setOnDrop, setPanels } from '../lib/views'
import { flush, key, render } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { DashboardView } from './DashboardView'
import { resetPanel } from './panel'
import { useViewData } from './useViews'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Wednesday 14 October 2026.
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  hideBulkToast()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 3000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}

function Board({ id }: { id: string }) {
  const data = useViewData()
  const dash = data.views.find((v) => v.id === id)
  return dash ? <DashboardView dashboard={dash} data={data} /> : null
}

/** A board of the given filters, in order; returns the board and the filter ids. */
async function board(columns: { name: string; query: string; rule?: OnDropRule }[]) {
  const ids: string[] = []
  for (const c of columns) {
    const id = await createView({ name: c.name, query: c.query, pinned: false })
    if (c.rule) await setOnDrop(id, c.rule)
    ids.push(id)
  }
  const dash = await createView({ name: 'Board', kind: 'dashboard' })
  await setPanels(dash, ids)
  return { dash, ids }
}

const panel = (name: string) => document.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!
const card = (id: string, within: ParentNode | null = document) => within?.querySelector<HTMLElement>(`[data-task-id="${id}"]`)

async function drag(el: Element, target: Element) {
  document.elementFromPoint = () => target
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
  })
}

const URGENT = { name: 'Urgent and important', query: '(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)', rule: { priority: 1, due: 'today' } as OnDropRule }

describe('drop targets and drops', () => {
  it('a panel without a rule is not a target, and a drop there changes nothing (spec "Panel without a rule is not a target")', async () => {
    const { dash } = await board([{ name: 'Backlog', query: 'p3' }, URGENT])
    const id = await createTask({ title: 'Report', priority: 3 })
    await render(<Board id={dash} />)
    await waitFor(() => !!card(id, panel('Backlog')))
    expect(panel('Backlog').hasAttribute('data-drop-target')).toBe(false)
    expect(panel('Urgent and important').getAttribute('data-drop-target')).toMatch(/^panel:/)
    const desc = document.getElementById(panel('Urgent and important').getAttribute('aria-describedby')!)
    expect(desc?.textContent).toBe('On drop: Priority 1, due today')
    const before = await db.outbox.count()
    await drag(card(id)!, panel('Backlog'))
    await flush(30)
    expect(await db.outbox.count()).toBe(before)
  })

  it('dragging a card applies the destination rule in one batch with a toast (spec "Drop with several changes")', async () => {
    const { dash } = await board([{ name: 'Backlog', query: 'p3' }, URGENT])
    const id = await createTask({ title: 'Report', priority: 3 })
    await render(<Board id={dash} />)
    await waitFor(() => !!card(id, panel('Backlog')))
    await db.outbox.clear()
    await drag(card(id)!, panel('Urgent and important'))
    await waitFor(async () => (await db.tasks.get(id))!.priority === 1)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-14' })
    expect(new Set((await db.outbox.toArray()).map((o) => o.ts)).size).toBe(1)
    expect(bulkToast()?.label).toBe('Moved to Urgent and important: priority 1, due today')
    await waitFor(() => !!card(id, panel('Urgent and important')) && !card(id, panel('Backlog')))
  })

  it('holds a card that still does not match, until the board is left (spec "Still not matching after the rule", "Held card is local")', async () => {
    const important = { name: 'Important, not urgent', query: '(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday', rule: { priority: 2, due: 'next-week' } as OnDropRule }
    const { dash } = await board([{ name: 'Backlog', query: 'p3' }, important])
    const id = await createTask({ title: 'Tax return', priority: 3, deadline: '2026-10-15' })
    const r = await render(<Board id={dash} />)
    await waitFor(() => !!card(id, panel('Backlog')))
    await drag(card(id)!, panel('Important, not urgent'))
    await waitFor(() => !!panel('Important, not urgent').querySelector('[data-held]'))
    expect(panel('Important, not urgent').querySelector('[data-held]')!.textContent).toContain('Not matching')
    expect(card(id, panel('Important, not urgent'))).toBeTruthy()
    expect(bulkToast()?.label).toContain('It does not match the column’s filter.')
    expect((await db.tasks.get(id))!.priority).toBe(2)
    // Leaving the board (or another device) shows the task only where filters match it.
    await r.unmount()
    document.body.innerHTML = ''
    await render(<Board id={dash} />)
    await waitFor(() => !!panel('Important, not urgent'))
    await flush(50)
    expect(card(id, panel('Important, not urgent'))).toBeNull()
    expect(document.querySelector('[data-held]')).toBeNull()
  })
})

describe('keyboard moves', () => {
  async function selectFirst(name: string) {
    await act(async () => panel(name).focus())
    await key(panel(name), 'j')
  }

  it('Shift+→ applies the next rule and keeps the card selected; Shift+← to a panel without a rule does nothing (spec "Keyboard move between columns")', async () => {
    const { dash } = await board([{ name: 'Backlog', query: 'p3' }, { name: 'Next', query: 'p2', rule: { priority: 2 } }])
    const id = await createTask({ title: 'Report', priority: 3 })
    await render(<Board id={dash} />)
    await waitFor(() => !!card(id, panel('Backlog')))
    await selectFirst('Backlog')
    await waitFor(() => card(id)?.getAttribute('aria-current') === 'true')
    await key(document.activeElement!, 'ArrowRight', { shiftKey: true })
    await waitFor(async () => (await db.tasks.get(id))!.priority === 2)
    await waitFor(() => card(id, panel('Next'))?.getAttribute('aria-current') === 'true')
    const before = await db.outbox.count()
    await key(document.activeElement!, 'ArrowLeft', { shiftKey: true })
    await flush(50)
    expect(await db.outbox.count()).toBe(before)
    expect((await db.tasks.get(id))!.priority).toBe(2)
  })

  it('Shift+→ skips a panel without a rule (spec "Keyboard move skips panels without a rule")', async () => {
    const { dash } = await board([{ name: 'Backlog', query: 'p3' }, { name: 'Middle', query: 'p4' }, { name: 'Last', query: 'p1', rule: { priority: 1 } }])
    const id = await createTask({ title: 'Report', priority: 3 })
    await render(<Board id={dash} />)
    await waitFor(() => !!card(id, panel('Backlog')))
    await selectFirst('Backlog')
    await key(document.activeElement!, 'ArrowRight', { shiftKey: true })
    await waitFor(async () => (await db.tasks.get(id))!.priority === 1)
    await waitFor(() => card(id, panel('Last'))?.getAttribute('aria-current') === 'true')
    expect(card(id, panel('Middle'))).toBeNull()
  })
})
