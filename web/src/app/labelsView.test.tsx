// @vitest-environment happy-dom
// Labels page, menu and edit panel (OpenSpec change labels-and-menus, tasks 5.1–5.4).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { addLabel, createLabel } from '../lib/labels'
import { createTask, resetDeviceId } from '../lib/ops'
import type { Label } from '../lib/types'
import { click, flush, key, render, spokenText, visibleText, waitFor } from '../ui/test-utils'
import { LabelEditPanel, LabelsView, duplicatePair, labelDropAt, labelMenuGroups } from './LabelsView'

beforeEach(async () => { await db.delete(); await db.open(); resetDeviceId() })
afterEach(() => { document.body.innerHTML = '' })

const route = { view: 'labels' } as const
const labelOps = async () => (await db.outbox.toArray()).filter((o) => o.entity === 'label')
const tick = () => new Promise((r) => setTimeout(r, 3))

async function seed(names: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const n of names) { ids.push(await createLabel({ name: n })); await tick() }
  await db.outbox.clear()
  return ids
}

async function renderPage() {
  const r = await render(<LabelsView route={route} />)
  await flush(60)
  return r
}

const menuItem = (label: string) => [...document.querySelectorAll('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === label) as HTMLElement

describe('label menu groups (5.1)', () => {
  const l = (id: string, name: string): Label => ({ id, name, color: '#ef4444', position: 1, created_at: 0, deleted_at: null, _clock: {} } as Label)
  it('the merge picker never lists the source label', () => {
    const labels = [l('a', 'errand'), l('b', 'call'), l('c', 'home')]
    const merge = labelMenuGroups(labels[0], labels, { edit: () => {}, rename: () => {}, move: () => {} }).flatMap((g) => g.items).find((i) => i.id === 'merge')
    expect(merge?.kind).toBe('picker')
    if (merge?.kind === 'picker') expect((merge.picker.source as Label[]).map((x) => x.id)).toEqual(['b', 'c'])
  })
})

describe('labels page (5.1, 5.3)', () => {
  it('Numbers on the overview: "errand" shows 3 and "home" none (quiet-sidebar 1.2)', async () => {
    const [errand] = await seed(['errand', 'home'])
    for (const title of ['A', 'B', 'C']) await addLabel(await createTask({ title }), errand)
    const r = await renderPage()
    const row = (id: string) => document.querySelector(`[data-label-row="${id}"] [data-label-open]`)!
    await waitFor(() => visibleText(row(errand)).trim() === 'errand3')
    expect(spokenText(row(errand))).toBe('errand3 open tasks')
    const home = [...document.querySelectorAll('[data-label-row] [data-label-open]')].find((b) => b.textContent === 'home')
    expect(home).toBeTruthy()
    await r.unmount()
  })

  it('the delete dialog shows how many tasks carry the label, and Cancel queues no op', async () => {
    const [errand] = await seed(['errand', 'call'])
    const t1 = await createTask({ title: 'Buy milk' })
    const t2 = await createTask({ title: 'Post office' })
    await addLabel(t1, errand); await addLabel(t2, errand)
    await db.outbox.clear()
    const r = await renderPage()
    await click(document.querySelector('button[aria-label="Menu for label errand"]')!)
    await flush(20)
    await click(menuItem('Delete label…'))
    await flush(40)
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('It is removed from 2 tasks')
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!)
    await flush(20)
    expect(await db.outbox.count()).toBe(0)
    expect((await db.labels.get(errand))?.deleted_at).toBeNull()
    await r.unmount()
  })

  it('F2 renames in place', async () => {
    const [errand] = await seed(['errand', 'call'])
    const r = await renderPage()
    const open = document.querySelector(`[data-label-row="${errand}"] [data-label-open]`) as HTMLElement
    open.focus()
    await key(open, 'F2')
    await flush(20)
    const input = document.querySelector('input[aria-label="Label name"]') as HTMLInputElement
    expect(input).toBeTruthy()
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input, 'errands')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await key(input, 'Enter')
    await flush(30)
    expect((await db.labels.get(errand))?.name).toBe('errands')
    await r.unmount()
  })

  it('Alt+Up moves the row with one op and keeps focus on it', async () => {
    const ids = await seed(['a', 'b', 'c'])
    const r = await renderPage()
    const open = () => document.querySelector(`[data-label-row="${ids[2]}"] [data-label-open]`) as HTMLElement
    open().focus()
    await key(open(), 'ArrowUp', { altKey: true })
    await flush(60)
    expect(await labelOps()).toHaveLength(1)
    const order = [...document.querySelectorAll('[data-label-row]')].map((e) => e.getAttribute('data-label-row'))
    expect(order).toEqual([ids[0], ids[2], ids[1]])
    expect(document.activeElement).toBe(open())
    expect(document.querySelector(`[data-label-row="${ids[2]}"] [role="status"]`)?.textContent).toBe('c moved to position 2 of 3')
    await r.unmount()
  })

  it('shows the empty state with a New label action', async () => {
    const r = await renderPage()
    expect(document.body.textContent).toContain('No labels yet')
    expect([...document.querySelectorAll('button')].filter((b) => b.textContent?.includes('New label')).length).toBeGreaterThanOrEqual(2)
    await r.unmount()
  })

  it('the duplicate banner merges the pair after a confirmation, and Swap changes which is kept', async () => {
    const now = Date.now()
    await db.labels.bulkPut([
      { id: 'x1', name: 'Errand', color: '#ef4444', position: 1, created_at: now, deleted_at: null, _clock: {} } as Label,
      { id: 'x2', name: 'errand', color: '#3b82f6', position: 2, created_at: now, deleted_at: null, _clock: {} } as Label,
    ])
    const r = await renderPage()
    const banner = document.querySelector('[data-testid="duplicate-banner"]')!
    expect(banner.textContent).toContain('Merge “Errand” into “errand”?')
    await click([...banner.querySelectorAll('button')].find((b) => b.textContent === 'Swap')!)
    await waitFor(() => !!document.querySelector('[data-testid="duplicate-banner"]')?.textContent?.includes('Merge “errand” into “Errand”?'), 'the swapped banner')
    await click([...document.querySelectorAll('[data-testid="duplicate-banner"] button')].find((b) => b.textContent?.includes('Merge…'))!)
    await waitFor(() => !!document.querySelector('[role="alertdialog"]'), 'the merge confirmation')
    const dialog = document.querySelector('[role="alertdialog"]')!
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Merge')!)
    // Waits for the merge itself, not a fixed delay: it failed under load (wave 6).
    await waitFor(async () => (await db.labels.get('x2'))?.deleted_at != null, 'the merged label deleted')
    expect((await db.labels.get('x2'))?.deleted_at).not.toBeNull()
    expect((await db.labels.get('x1'))?.deleted_at).toBeNull()
    await r.unmount()
  })
})

describe('label edit panel (5.2)', () => {
  async function openPanel(labelId: string) {
    const labels = (await db.labels.toArray()).filter((l) => !l.deleted_at)
    const anchor = { current: document.body }
    const label = labels.find((l) => l.id === labelId)!
    const r = await render(<LabelEditPanel label={label} labels={labels} anchor={anchor} onClose={() => {}} />)
    await flush(30)
    return r
  }

  it('picking a swatch queues one op', async () => {
    const [errand] = await seed(['errand'])
    const r = await openPanel(errand)
    await click(document.querySelector('[role="radio"][aria-label="teal"]')!)
    await flush(20)
    const ops = await labelOps()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ field: 'color', value: '#14b8a6' })
    await r.unmount()
  })

  it('a duplicate name shows the inline error and queues nothing', async () => {
    const [errand] = await seed(['errand', 'call'])
    const r = await openPanel(errand)
    const input = document.querySelector('[data-testid="label-edit"] input') as HTMLInputElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input, 'Call')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await key(input, 'Enter')
    await flush(20)
    expect(document.querySelector('[data-testid="label-edit"] [role="alert"]')?.textContent).toContain('already exists')
    expect(await labelOps()).toHaveLength(0)
    await r.unmount()
  })

  it('swatches are touch targets (44 px under a coarse pointer) and the current one is checked', async () => {
    const [errand] = await seed(['errand'])
    const r = await openPanel(errand)
    const radios = [...document.querySelectorAll('[role="radio"]')]
    expect(radios).toHaveLength(12)
    expect(radios.every((b) => b.className.includes('touch-target'))).toBe(true)
    expect(radios.filter((b) => b.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    await r.unmount()
  })
})

describe('helpers (5.3, 5.4)', () => {
  it('drop placement: the upper half places before, the lower half after', () => {
    expect(labelDropAt('b', 101, 100, 30)).toEqual({ id: 'b', zone: 'before' })
    expect(labelDropAt('b', 125, 100, 30)).toEqual({ id: 'b', zone: 'after' })
  })

  it('finds the first pair of labels sharing a name ignoring case', () => {
    const l = (id: string, name: string) => ({ id, name } as Label)
    expect(duplicatePair([l('1', 'a'), l('2', 'Errand'), l('3', 'errand ')])?.map((x) => x.id)).toEqual(['2', '3'])
    expect(duplicatePair([l('1', 'a'), l('2', 'b')])).toBeNull()
  })
})
