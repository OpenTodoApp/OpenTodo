// @vitest-environment happy-dom
// The command bar's modes (OpenSpec change moments-and-onboarding, tasks 5.1-5.5;
// command-palette "Open and close the palette", "Add mode", "Add as a task from
// Search", "Ask mode"; in-app-assistant "Ask from the command bar").
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_STATUS, resetAssistantStatus, setAssistantStatus, takeAssistantPrefill, useAssistantOpen, closeAssistant } from '../../lib/assistantStatus'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import type { User } from '../../lib/types'
import { flush, key, render, type } from '../../ui/test-utils'
import { hideBulkToast } from '../bulk/toastStore'
import { UndoToast } from '../bulk/UndoToast'
import { navigate } from '../router'
import { Shell } from '../Shell'
import CommandPalette from './CommandPalette'
import { prefixSwitch } from './modes'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetAssistantStatus()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  // Unmounted, so their dialogs leave the overlay stack (q ignores the key while one is open).
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  hideBulkToast()
  closeAssistant()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const mode = () => q('[data-bar-mode-current]')?.getAttribute('data-bar-mode-current')
const segments = () => [...document.querySelectorAll('[data-bar-mode]')].map((b) => b.getAttribute('data-bar-mode'))
const searchField = () => q<HTMLInputElement>('[data-palette] input[role="combobox"]')!
const options = () => [...document.querySelectorAll('[data-palette] [role="option"]')].map((o) => o.textContent ?? '')
const available = () => setAssistantStatus({ ...DEMO_STATUS, available: true, enabled: true, reason: '', consented: true } as never)

async function bar(opts: { initialMode?: 'search' | 'add'; onClose?: () => void } = {}) {
  const r = await render(<><CommandPalette user={user} onClose={opts.onClose ?? (() => {})} showShortcuts={() => {}} initialMode={opts.initialMode} /><UndoToast /></>)
  mounted.push(r)
  await waitFor(() => !!q('[data-palette]'))
  return r
}
async function submitAdd(text: string) {
  const input = q<HTMLInputElement>('[data-bar-add] input')!
  await type(input, text)
  await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  return input
}

describe('prefixes (5.1)', () => {
  it('Prefix switches the mode; the same prefix again returns to Search with the character kept', () => {
    expect(prefixSwitch('search', '', '>', false)).toEqual({ mode: 'commands', text: '' })
    expect(prefixSwitch('search', '', '+', false)).toEqual({ mode: 'add', text: '' })
    expect(prefixSwitch('commands', '', '>', false)).toEqual({ mode: 'search', text: '>' })
    // Only as the first character of an empty field.
    expect(prefixSwitch('search', 'a', 'a>', false)).toBeNull()
    expect(prefixSwitch('search', '', 'x', false)).toBeNull()
  })

  it('Ask only when available: `?` is ordinary text without the assistant', () => {
    expect(prefixSwitch('search', '', '?', false)).toBeNull()
    expect(prefixSwitch('search', '', '?', true)).toEqual({ mode: 'ask', text: '' })
  })

  it('in the bar: `>` switches to Commands, `>` again returns with it; Escape returns to Search before closing', async () => {
    const onClose = vi.fn()
    await bar({ onClose })
    expect(mode()).toBe('search')
    expect(segments()).toEqual(['search', 'add', 'commands'])
    expect(q('[data-bar-hint]')!.textContent).toContain('+')
    await type(searchField(), '>')
    await waitFor(() => mode() === 'commands')
    expect(searchField().value).toBe('')
    await type(searchField(), '>')
    await waitFor(() => mode() === 'search')
    expect(searchField().value).toBe('>')
    await type(searchField(), '')
    q<HTMLButtonElement>('[data-bar-mode="add"]')!.click()
    await waitFor(() => mode() === 'add')
    await key(q('[data-bar-add] input')!, 'Escape')
    await waitFor(() => mode() === 'search')
    expect(onClose).not.toHaveBeenCalled()
    await key(searchField(), 'Escape')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('Add mode (5.2)', () => {
  it('Add from Settings: the Inbox defaults, the quick-add grammar, the toast with Open, the field empty and focused', async () => {
    navigate({ view: 'settings' })
    await bar({ initialMode: 'add' })
    const input = await submitAdd('Call Sam tomorrow at 4pm @call')
    await waitFor(() => !!q('[data-bulk-toast]'))
    const [task] = await db.tasks.toArray()
    expect(task).toMatchObject({ title: 'Call Sam', project_id: null, due: { date: '2026-10-15', time: '16:00' } })
    const label = (await db.labels.toArray()).find((l) => l.name === 'call')!
    expect(task.labels).toEqual([label.id])
    expect(q('[data-bulk-toast]')!.textContent).toContain('Open')
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(mode()).toBe('add')
  })

  it('Add in a project: `+` switches to Add and the task lands in the project', async () => {
    const home = await createProject({ name: 'Home' })
    navigate({ view: 'project', id: home })
    await bar()
    await type(searchField(), '+')
    await waitFor(() => mode() === 'add')
    await submitAdd('Fix the tap')
    await waitFor(() => !!q('[data-bulk-toast]'))
    expect((await db.tasks.toArray())[0]).toMatchObject({ title: 'Fix the tap', project_id: home })
    expect(q('[data-bulk-toast]')!.textContent).toContain('Added to Home')
  })

  it('Escape closes when the bar was opened in Add; the footer says Close (palette-quick-add D3)', async () => {
    navigate({ view: 'settings' })
    const onClose = vi.fn()
    await bar({ initialMode: 'add', onClose })
    expect(q('[data-quick-add-escape]')!.textContent).toContain('Close')
    await key(q('[data-bar-add] input')!, 'Escape')
    expect(onClose).toHaveBeenCalled()
    expect(mode()).toBe('add')
  })

  it('Add and open: Shift+Enter creates the task, closes the bar and opens the task as its page (task-full-page)', async () => {
    const work = await createProject({ name: 'Work' })
    navigate({ view: 'settings' })
    const onClose = vi.fn()
    await bar({ initialMode: 'add', onClose })
    const input = q<HTMLInputElement>('[data-bar-add] input')!
    // A space after the token: with the project list open, Enter picks from the list.
    await type(input, 'Draft the offer #Work ')
    await key(input, 'Enter', { shiftKey: true })
    await waitFor(() => onClose.mock.calls.length > 0)
    const [task] = await db.tasks.toArray()
    expect(task).toMatchObject({ title: 'Draft the offer', project_id: work })
    expect(location.pathname).toBe(`/task/${task.id}`)
    // Opened, not announced: no toast.
    expect(q('[data-bulk-toast]')).toBeNull()
  })

  it('Offline: the task is written locally and waits in the outbox', async () => {
    navigate({ view: 'inbox' })
    await bar({ initialMode: 'add' })
    await submitAdd('Buy bread')
    await waitFor(() => !!q('[data-bulk-toast]'))
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['Buy bread'])
    expect((await db.outbox.toArray()).some((o) => o.field === 'title' && o.value === 'Buy bread')).toBe(true)
  })
})

describe('Add as a task from Search (5.3)', () => {
  it('Last entry: the matching tasks first, "Add … as a task" last, never first', async () => {
    await createTask({ title: 'Renew passport' })
    await createTask({ title: 'Passport photos' })
    await bar()
    await type(searchField(), 'passport')
    await waitFor(() => options().some((o) => o.includes('Add “passport” as a task')))
    const list = options()
    expect(list[0]).not.toContain('as a task')
    expect(list[list.length - 1]).toContain('Add “passport” as a task')
  })

  it('Ctrl+Enter adds the typed text as a task and closes the bar', async () => {
    navigate({ view: 'inbox' })
    const onClose = vi.fn()
    await bar({ onClose })
    await type(searchField(), 'Buy stamps')
    await key(searchField(), 'Enter', { ctrlKey: true })
    await waitFor(() => onClose.mock.calls.length > 0)
    await waitFor(() => !!q('[data-bulk-toast]'))
    expect((await db.tasks.toArray()).map((t) => [t.title, t.project_id])).toEqual([['Buy stamps', null]])
  })
})

describe('Ask mode (5.4)', () => {
  function OpenSpy() { return <span data-open={String(useAssistantOpen())} /> }

  it('Ask: Enter hands the text to the assistant panel as one turn and closes the bar', async () => {
    available()
    const onClose = vi.fn()
    mounted.push(await render(<OpenSpy />))
    await bar({ onClose })
    expect(segments()).toEqual(['search', 'add', 'commands', 'ask'])
    await type(searchField(), '?')
    await waitFor(() => mode() === 'ask')
    const input = q<HTMLInputElement>('[data-bar-ask-input]')!
    await type(input, 'what is overdue in Work')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(onClose).toHaveBeenCalled()
    expect(takeAssistantPrefill()).toEqual({ text: 'what is overdue in Work', send: true })
    await waitFor(() => q('[data-open]')!.getAttribute('data-open') === 'true')
  })

  it('Typing sends nothing: Escape after typing makes no request to the assistant route', async () => {
    available()
    const fetch = vi.fn(async (_url: string) => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    await bar()
    q<HTMLButtonElement>('[data-bar-mode="ask"]')!.click()
    await waitFor(() => !!q('[data-bar-ask-input]'))
    await type(q<HTMLInputElement>('[data-bar-ask-input]')!, 'plan my afternoon')
    await key(q('[data-bar-ask-input]')!, 'Escape')
    await waitFor(() => mode() === 'search')
    expect(fetch.mock.calls.filter(([u]) => String(u).includes('assistant'))).toEqual([])
    expect(takeAssistantPrefill()).toBeNull()
  })
})

describe('`q` where there is no quick add (5.5)', () => {
  it('Settings and Week open the bar in Add mode; Today focuses the list line', async () => {
    for (const view of ['settings', 'week'] as const) {
      navigate({ view })
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await flush(80)
      await key(document.body, 'q')
      // The bar is a lazy chunk: its first load can take a moment.
      await waitFor(() => mode() === 'add', 6000)
      expect(document.activeElement).toBe(q('[data-bar-add] input'))
      await r.unmount()
      document.body.innerHTML = ''
    }
    navigate({ view: 'today' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!q('[data-list-page] input[aria-label="Add a task"]'))
    await key(document.body, 'q')
    await flush(40)
    expect(q('[data-palette]')).toBeNull()
    expect(document.activeElement).toBe(q('[data-list-page] input[aria-label="Add a task"]'))
    await r.unmount()
  })
})
