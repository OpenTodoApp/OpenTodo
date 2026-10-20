// @vitest-environment happy-dom
// Row detail (OpenSpec change calm-rows, appearance-preferences "Row detail
// preference", task-list-presentation "Row detail in lists"): a synced additive
// preference, Calm by default; the Rows control in Settings → Appearance writes one
// op, and an open list follows a synced change without a reload.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createLabel } from '../lib/labels'
import { applyOps, createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, mockFetch, noPublicLinks, render, spokenText, waitFor } from '../ui/test-utils'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSection } from './AppearanceSection'
import { TaskListView } from './TaskListView'

beforeEach(async () => {
  mockFetch(noPublicLinks)
  await db.delete()
  await db.open()
  resetDeviceId()
})
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

const option = (label: string) => [...document.querySelectorAll('[data-testid="appearance-rows"] [role="radio"]')].find((b) => b.textContent === label) as HTMLElement

describe('Appearance → Rows', () => {
  it('is a radio group after Density announcing Calm, and choosing Detailed queues one op', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => option('Calm')?.getAttribute('aria-checked') === 'true', 'Calm selected by default')
    const group = document.querySelector('[data-testid="appearance-rows"]')!
    expect(group.getAttribute('role')).toBe('radiogroup')
    expect(group.getAttribute('aria-label')).toBe('Rows')
    const rows = [...document.querySelectorAll('[data-setting-row]')].map((e) => e.getAttribute('data-setting-row'))
    expect(rows.indexOf('appearance-rows')).toBe(rows.indexOf('appearance-density') + 1)
    await click(option('Detailed'))
    await waitFor(() => option('Detailed').getAttribute('aria-checked') === 'true', 'Detailed selected')
    expect((await db.outbox.toArray()).map((o) => `${o.entity}.${o.field}=${o.value}`)).toEqual(['user_prefs.row_detail=detailed'])
    await r.unmount()
  })
})

describe('lists follow the preference', () => {
  it('a synced row_detail op switches an open list without a reload, and writes nothing for the rows', async () => {
    const project = await createProject({ name: 'Home' })
    const label = await createLabel({ name: 'errand' })
    const id = await createTask({ title: 'Fix the bike', project_id: project, labels: [label], priority: 3 })
    await db.outbox.clear()
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    const row = () => r.container.querySelector(`[data-task-id="${id}"]`)
    await waitFor(() => !!row()?.querySelector('[data-label-dots]'), 'a Calm row')
    expect(row()!.querySelector('[data-check-mark]')!.className).toContain('border-input')
    await applyOps([{ id: 'r1', entity: 'user_prefs', entityId: 'me', field: 'row_detail', value: 'detailed', ts: Date.now() + 1000, device: 'laptop' }] as never)
    await waitFor(() => !!row()?.querySelector('[data-label-chip]'), 'a Detailed row')
    expect(row()!.querySelector('[data-label-dots]')).toBeNull()
    expect(row()!.querySelector('[data-check-mark]')!.className).toContain('border-p3')
    await applyOps([{ id: 'r2', entity: 'user_prefs', entityId: 'me', field: 'row_detail', value: 'calm', ts: Date.now() + 2000, device: 'laptop' }] as never)
    await waitFor(() => !!row()?.querySelector('[data-label-dots]'), 'Calm again')
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })

  it("a label's view leaves out that label's dot and name and keeps the others", async () => {
    const errand = await createLabel({ name: 'errand' })
    const call = await createLabel({ name: 'call' })
    const both = await createTask({ title: 'Ring the garage', labels: [errand, call] })
    const only = await createTask({ title: 'Buy stamps', labels: [errand] })
    const r = await render(<TaskListView route={{ view: 'label', id: errand }} />)
    const row = (id: string) => r.container.querySelector(`[data-task-id="${id}"]`)
    await waitFor(() => !!row(both) && !!row(only), 'both rows')
    expect(spokenText(row(both)!.querySelector('[data-label-dots]')!)).toBe('Labels: call')
    expect(row(only)!.querySelector('[data-label-dots]')).toBeNull()
    await r.unmount()
  })
})
