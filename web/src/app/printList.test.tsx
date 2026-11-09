// @vitest-environment happy-dom
// Print… (OpenSpec change print-lists): the list views' menus start the browser's
// print once the menu has closed; the print stylesheet does the rest.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import type { Project } from '../lib/types'
import { click, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { ProjectHeader } from './ProjectHeader'
import { TaskListView } from './TaskListView'

let n = 0
let print: ReturnType<typeof vi.fn>
beforeEach(() => {
  useDatabase(`print-lists-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  print = vi.fn()
  vi.stubGlobal('print', print)
  // The project header asks the server for its public links.
  mockFetch(noPublicLinks)
})
afterEach(() => { vi.unstubAllGlobals() })

const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[data-menu-label]')].find((e) => e.getAttribute('data-menu-label') === label)

describe('Print…', () => {
  it('ends Today’s menu and prints once the menu has closed', async () => {
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r.container.querySelector('[data-page-header] button[aria-label="More actions"]'), 'the header menu')
    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => !!document.querySelector('[role="menu"] [data-print]'), 'Print…')
    const items = [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')]
    expect(items.at(-1)!.textContent).toContain('Print…')
    await click(document.querySelector('[role="menu"] [data-print]')!)
    await waitFor(() => print.mock.calls.length === 1, 'window.print')
    expect(document.querySelector('[role="menu"]')).toBeNull()
    await r.unmount()
  })

  it('is in the Inbox menu without sample tasks', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('[data-inbox-menu]'), 'the Inbox menu')
    await click(r.container.querySelector('[data-inbox-menu]')!)
    await waitFor(() => !!document.querySelector('[role="menu"] [data-print]'), 'Print…')
    await click(document.querySelector('[role="menu"] [data-print]')!)
    await waitFor(() => print.mock.calls.length === 1, 'window.print')
    await r.unmount()
  })

  it('is left out in a native shell, whose web view does not print', async () => {
    vi.stubGlobal('opentodoShell', { bridge: 1, app: '1.0.0', capabilities: [] })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r.container.querySelector('[data-page-header] button[aria-label="More actions"]'), 'the header menu')
    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => !!document.querySelector('[role="menu"] [data-briefing-toggle]'), 'the menu')
    expect(document.querySelector('[role="menu"] [data-print]')).toBeNull()
    await r.unmount()
  })

  it('is in a project’s menu only in the list layout', async () => {
    const project = { id: 'home', name: 'Home', color: '#22c55e', position: 1, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} } as Project
    await db.projects.put(project)
    const other = await render(<ProjectHeader project={project} />)
    await click(other.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!menuItem('Display mode'), 'the project menu')
    expect(menuItem('Print…')).toBeUndefined()
    await other.unmount()
    document.body.innerHTML = ''

    const list = await render(<ProjectHeader project={project} print />)
    await click(list.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!menuItem('Print…'), 'Print…')
    await click(menuItem('Print…')!)
    await waitFor(() => print.mock.calls.length === 1, 'window.print')
    await list.unmount()
  })
})
