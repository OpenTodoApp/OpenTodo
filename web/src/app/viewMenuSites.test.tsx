// @vitest-environment happy-dom
// Every call site renders the same view menu (labels-and-menus 2.2).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import type { View } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { ViewMenu } from './ViewsView'

const view = { id: 'v1', name: 'Deep work', kind: 'list', query: 'p1', panels: [], pinned: true, position: 1, created_at: 0, deleted_at: null, _clock: {} } as unknown as View

beforeEach(async () => { await db.delete(); await db.open(); await db.views.put(view) })
afterEach(() => { document.body.innerHTML = '' })

async function itemsFrom(ui: React.ReactNode): Promise<string[]> {
  const r = await render(ui)
  await flush(30)
  await click(r.container.querySelector('button[aria-label="Menu for view Deep work"]')!)
  await flush(30)
  const labels = [...document.querySelectorAll('[data-menu-label]')].map((e) => e.getAttribute('data-menu-label')!)
  await r.unmount()
  document.body.innerHTML = ''
  return labels
}

describe('ViewMenu call sites', () => {
  it('the sidebar (start-aligned) and a view header render the same items', async () => {
    const sidebar = await itemsFrom(<nav><ViewMenu view={view} align="start" className="hover-reveal" /></nav>)
    const header = await itemsFrom(<header><ViewMenu view={view} /></header>)
    expect(sidebar).toEqual(['Rename', 'Pinned to sidebar', 'Start view on this device', 'Display mode', 'Move up', 'Move down', 'Delete view…'])
    expect(header).toEqual(sidebar)
  })
})
