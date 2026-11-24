// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { readRowClick, rowClickMode, setServerRowClick } from '../lib/rowClickPref'
import { mockFetch, render, waitFor } from '../ui/test-utils'
import { TaskDetailsSection } from './AppearanceSection'
import { TaskListsServerPanel } from './TaskListsServerPanel'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

const choose = (select: HTMLSelectElement, value: string) => act(async () => {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
})

describe('Click a task to in Settings (click-default)', () => {
  it('Task details offers the server default first, naming it, and stores the choice for the account', async () => {
    setServerRowClick('open')
    const r = await render(<TaskDetailsSection />)
    const select = r.container.querySelector<HTMLSelectElement>('#row-click-select')!
    expect([...select.options].map((o) => o.text)).toEqual(['Use the server default (Open details)', 'Select, then edit the title', 'Open details'])
    expect(select.value).toBe('')
    await choose(select, 'select')
    await waitFor(async () => readRowClick(await db.userPrefs.get('me')) === 'select', 'stored choice')
    expect(rowClickMode(await db.userPrefs.get('me'))).toBe('select')
    await r.unmount()
  })

  it('Server → Task lists writes the default for everyone', async () => {
    const calls: { method: string; path: string; body: unknown }[] = []
    mockFetch((method, path, init) => {
      if (path !== '/api/v1/settings/row-click') return undefined
      const body = JSON.parse(String(init?.body))
      calls.push({ method, path, body })
      return { default: body.default }
    })
    const r = await render(<TaskListsServerPanel />)
    const select = r.container.querySelector<HTMLSelectElement>('#row-click-default-select')!
    expect(select.value).toBe('select')
    await choose(select, 'open')
    await waitFor(() => rowClickMode(null) === 'open', 'server default applied')
    expect(calls).toEqual([{ method: 'PUT', path: '/api/v1/settings/row-click', body: { default: 'open' } }])
    await r.unmount()
  })
})
