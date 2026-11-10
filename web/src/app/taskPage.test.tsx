// @vitest-environment happy-dom
// The task as a page (OpenSpec change task-full-page): a task opens at /task/<id>
// with the breadcrumb and its place in the list, j and k step through that list,
// Esc returns to it with the task selected, and a reload or a link renders the page.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { todayISO } from '../lib/dates'
import type { User } from '../lib/types'
import { click, key, minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { TaskDetail } from './task-detail/TaskDetail'
import { resetTaskTrail } from './taskTrail'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskTrail()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => { vi.unstubAllGlobals(); resetPanel(); resetTaskTrail() })

const page = () => document.querySelector<HTMLElement>('[data-detail-variant="page"]')
const rowOpen = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-task-id] button.min-w-0')].find((b) => b.textContent?.includes(title))!
const position = () => document.querySelector('[data-task-position] [aria-hidden]')?.textContent

async function projectOfThree() {
  const project = await createProject({ name: 'Home' })
  const ids = [
    await createTask({ title: 'Paint the fence', project_id: project, priority: 2 }),
    await createTask({ title: 'Fix the gate', project_id: project }),
    await createTask({ title: 'Clean the gutters', project_id: project }),
  ]
  return { project, ids }
}

describe('the task page', () => {
  it('opens from a list as a page: breadcrumb, the title, and the checkbox completes the task', async () => {
    const { project, ids } = await projectOfThree()
    navigate({ view: 'project', id: project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Paint the fence'))
    await click(rowOpen('Paint the fence'))
    await waitFor(() => location.pathname === `/task/${ids[0]}` && !!page())
    // Nothing docks beside a list: no panel, no list behind the page.
    expect(document.querySelector('[data-detail-variant="panel"]')).toBeNull()
    expect(document.querySelector('[data-task-id]')).toBeNull()
    const crumbs = page()!.querySelector('[data-breadcrumb]')!
    expect(crumbs.querySelector('[data-crumb="project"]')!.textContent).toContain('Home')
    expect(crumbs.querySelector('[data-crumb="task"]')!.textContent).toBe('Paint the fence')
    expect(page()!.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')!.value).toBe('Paint the fence')
    await click(page()!.querySelector<HTMLButtonElement>('[data-panel-complete]')!)
    await waitFor(() => !!document.querySelector('[data-panel-complete][aria-pressed="true"]'))
    expect((await db.tasks.get(ids[0]))!.completed_at).not.toBeNull()
    await r.unmount()
  })

  it('shows its place in the list, steps with j and k, and Esc returns to the list with the task selected', async () => {
    const { project, ids } = await projectOfThree()
    navigate({ view: 'project', id: project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Fix the gate'))
    await click(rowOpen('Fix the gate'))
    await waitFor(() => location.pathname === `/task/${ids[1]}` && !!page())
    expect(position()).toBe('2 / 3')
    await key(document.body, 'j')
    await waitFor(() => location.pathname === `/task/${ids[2]}` && position() === '3 / 3')
    expect(document.querySelector<HTMLButtonElement>('[data-task-next]')!.disabled).toBe(true)
    // At the end of the list j does nothing.
    await key(document.body, 'j')
    expect(location.pathname).toBe(`/task/${ids[2]}`)
    await key(document.body, 'k')
    await waitFor(() => location.pathname === `/task/${ids[1]}` && position() === '2 / 3')
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === `/project/${project}` && !page())
    await waitFor(() => document.querySelector('[data-task-id][aria-current]')?.getAttribute('data-task-id') === ids[1])
    await r.unmount()
  })

  it('Esc goes back to the list after an overlay on the page left a released marker entry above it', async () => {
    const { project, ids } = await projectOfThree()
    navigate({ view: 'project', id: project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Fix the gate'))
    await click(rowOpen('Fix the gate'))
    await waitFor(() => location.pathname === `/task/${ids[1]}` && !!page())
    // An overlay opened and closed on the page (useBackToClose): its marker stays behind as a forward entry.
    history.pushState({ overlay: 1 }, '')
    await act(async () => history.back())
    await waitFor(() => (history.state as { overlay?: number } | null)?.overlay === undefined, 'back on the page entry')
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === `/project/${project}` && !page())
    // Esc went back to the list's own entry rather than pushing a new one: Back leaves the list, not to the task.
    await act(async () => history.back())
    await waitFor(() => location.pathname === '/', 'Back goes to the page before the list')
    await r.unmount()
  })

  it('a reload of /task/<id> renders the page; Close goes to the task’s own list with it selected', async () => {
    const id = await createTask({ title: 'Call the bank' })
    navigate({ view: 'task', id })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!page())
    expect(document.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')!.value).toBe('Call the bank')
    // Opened from the address: no list to count in.
    expect(document.querySelector('[data-task-position]')).toBeNull()
    await click(document.querySelector<HTMLButtonElement>('[data-task-close]')!)
    await waitFor(() => location.pathname === '/' && !page())
    await waitFor(() => document.querySelector('[data-task-id][aria-current]')?.getAttribute('data-task-id') === id)
    await r.unmount()
  })

  it('the first crumb names the list the task was opened from and leads back to it', async () => {
    const project = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Water the plants', project_id: project, due: { date: todayISO() } })
    navigate({ view: 'today' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Water the plants'))
    const from = location.pathname
    await click(rowOpen('Water the plants'))
    await waitFor(() => location.pathname === `/task/${id}` && !!page())
    const crumbs = page()!.querySelector('[data-breadcrumb]')!
    const origin = crumbs.querySelector<HTMLButtonElement>('button[data-crumb="origin"]')!
    expect(origin.textContent).toBe('Today')
    expect(crumbs.querySelector('[data-crumb="project"]')!.textContent).toContain('Home')
    await click(origin)
    await waitFor(() => location.pathname === from && !page())
    await waitFor(() => document.querySelector('[data-task-id][aria-current]')?.getAttribute('data-task-id') === id)
    await r.unmount()
  })

  it('opened from its own project, the project is the first crumb and leads back', async () => {
    const { project, ids } = await projectOfThree()
    navigate({ view: 'project', id: project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Fix the gate'))
    await click(rowOpen('Fix the gate'))
    await waitFor(() => location.pathname === `/task/${ids[1]}` && !!page())
    const crumbs = page()!.querySelector('[data-breadcrumb]')!
    expect(crumbs.querySelector('[data-crumb="origin"]')).toBeNull()
    await click(crumbs.querySelector<HTMLButtonElement>('button[data-crumb="project"]')!)
    await waitFor(() => location.pathname === `/project/${project}` && !page())
    await waitFor(() => document.querySelector('[data-task-id][aria-current]')?.getAttribute('data-task-id') === ids[1])
    await r.unmount()
  })

  it('without a trail, a task without a project offers Inbox as a link', async () => {
    const id = await createTask({ title: 'Loose end' })
    history.replaceState(null, '', `/task/${id}`)
    navigate({ view: 'task', id }, { replace: true })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!page())
    const inbox = page()!.querySelector<HTMLButtonElement>('button[data-crumb="project"]')!
    expect(inbox.textContent).toBe('Inbox')
    await click(inbox)
    await waitFor(() => !page() && !location.pathname.startsWith('/task/'))
    await r.unmount()
  })

  it('shows the parent chain, folds the middle into a menu, and u opens the nearest parent', async () => {
    const project = await createProject({ name: 'Work' })
    const budget = await createTask({ title: 'Draft the budget', project_id: project })
    const gather = await createTask({ title: 'Gather numbers', project_id: project, parent_id: budget })
    const ask = await createTask({ title: 'Ask finance', project_id: project, parent_id: gather })
    navigate({ view: 'task', id: ask })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => page()?.querySelector('[data-crumb="parent"]')?.textContent === 'Gather numbers')
    const crumbs = page()!.querySelector('[data-breadcrumb]')!
    expect(crumbs.tagName).toBe('NAV')
    expect(crumbs.getAttribute('aria-label')).toBe('Task path')
    expect(crumbs.querySelector('[data-crumb="project"]')!.textContent).toContain('Work')
    expect(crumbs.querySelector('[data-crumb="parent"]')!.textContent).toBe('Gather numbers')
    expect(crumbs.querySelector('[data-crumb="parent"]')!.getAttribute('data-parent-id')).toBe(gather)
    expect(crumbs.querySelector('[data-crumb="task"]')!.getAttribute('aria-current')).toBe('page')
    expect(crumbs.textContent).not.toContain('Draft the budget')
    await click(crumbs.querySelector<HTMLButtonElement>('[data-crumb="more"]')!)
    await waitFor(() => !!document.querySelector(`[role="menuitem"][data-parent-id="${budget}"]`))
    expect(document.querySelector('[data-overlay="sheet"]')).toBeNull()
    await click(document.querySelector<HTMLButtonElement>(`[role="menuitem"][data-parent-id="${budget}"]`)!)
    await waitFor(() => page()?.querySelector('[data-crumb="task"]')?.textContent === 'Draft the budget')
    expect(page()!.querySelector('[data-crumb="more"]')).toBeNull()
    expect(page()!.querySelector('[data-crumb="parent"]')).toBeNull()
    await r.unmount()
  })

  it('on a phone shows only the nearest step up (GitHub issue 1050)', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: minWidthPx(q) <= 390,
      media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    // Below 768 px the title, and so the path, sits in the shell's bar, outside the page.
    const bar = () => document.querySelector<HTMLElement>('[data-breadcrumb]')
    try {
      const project = await createProject({ name: 'Work' })
      const budget = await createTask({ title: 'Draft the budget', project_id: project })
      const gather = await createTask({ title: 'Gather numbers', project_id: project, parent_id: budget })
      const ask = await createTask({ title: 'Ask finance', project_id: project, parent_id: gather })
      navigate({ view: 'task', id: ask })
      const r = await render(<Shell user={user} onLogout={() => {}} />)
      await waitFor(() => bar()?.querySelector('[data-crumb="parent"]')?.textContent === 'Gather numbers')
      const crumbs = bar()!
      expect(crumbs.querySelectorAll('[data-crumb]')).toHaveLength(1)
      await click(crumbs.querySelector<HTMLButtonElement>('[data-crumb="parent"]')!)
      await waitFor(() => bar()?.querySelector('[data-crumb="parent"]')?.textContent === 'Draft the budget')
      await click(bar()!.querySelector<HTMLButtonElement>('[data-crumb="parent"]')!)
      await waitFor(() => !!bar()?.querySelector('[data-crumb="project"]'))
      expect(bar()!.querySelector('[data-crumb="project"]')!.textContent).toContain('Work')
      expect(bar()!.querySelector('[data-crumb="task"]')).toBeNull()
      await r.unmount()
    } finally {
      window.matchMedia = original
    }
  })

  it('u on a task page opens the parent, and u in the title does not', async () => {
    const project = await createProject({ name: 'Work' })
    const budget = await createTask({ title: 'Draft the budget', project_id: project })
    const gather = await createTask({ title: 'Gather numbers', project_id: project, parent_id: budget })
    navigate({ view: 'task', id: gather })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => page()?.querySelector('[data-crumb="parent"]')?.textContent === 'Draft the budget')
    expect(page()!.querySelector('[data-crumb="more"]')).toBeNull()
    const title = page()!.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')!
    await act(async () => { title.focus() })
    await key(title, 'u')
    expect(location.pathname).toBe(`/task/${gather}`)
    await key(document.body, 'u')
    await waitFor(() => location.pathname === `/task/${budget}`)
    await r.unmount()
  })

  it('an older ?task= link opens the page over the page in the address, and Esc goes back there', async () => {
    const id = await createTask({ title: 'Renew the passport', due: { date: '2099-01-02' } })
    navigate({ view: 'upcoming' })
    history.replaceState(null, '', `/upcoming?task=${id}`)
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => location.pathname === `/task/${id}` && !!page())
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === '/upcoming' && !page())
    await r.unmount()
  })
})

describe('the docked panel path', () => {
  it('shows the same path and u opens the parent while focus is in the panel', async () => {
    const project = await createProject({ name: 'Work' })
    const budget = await createTask({ title: 'Draft the budget', project_id: project })
    const gather = await createTask({ title: 'Gather numbers', project_id: project, parent_id: budget })
    const ask = await createTask({ title: 'Ask finance', project_id: project, parent_id: gather })
    const row = (await db.projects.get(project))!
    const opened: string[] = []
    const r = await render(<TaskDetail taskId={ask} projects={[row]} labelMap={new Map()} onClose={() => {}} onOpen={(id) => opened.push(id)} />)
    const panel = () => document.querySelector('[data-detail-variant="panel"]')
    await waitFor(() => panel()?.querySelector('[data-crumb="parent"]')?.textContent === 'Gather numbers')
    const shown = panel()!
    expect(shown.querySelector('[data-crumb="project"]')!.textContent).toContain('Work')
    expect(shown.querySelector('[data-crumb="task"]')!.textContent).toBe('Ask finance')
    expect(shown.querySelector('[data-breadcrumb]')!.getAttribute('aria-label')).toBe('Task path')
    const parent = shown.querySelector<HTMLButtonElement>('[data-crumb="parent"]')!
    parent.focus()
    await key(parent, 'u')
    expect(opened).toEqual([gather])
    await r.unmount()
  })

  it('a task with no parent keeps the header it had', async () => {
    const id = await createTask({ title: 'Call the bank' })
    const r = await render(<TaskDetail taskId={id} projects={[]} labelMap={new Map()} onClose={() => {}} />)
    await waitFor(() => !!document.querySelector('[aria-label="Title"]'))
    expect(document.querySelector('[data-detail-variant="panel"] [data-breadcrumb]')).toBeNull()
    await r.unmount()
  })
})

describe('the facts column', () => {
  it('names every fact, offers unset ones as actions, and opens the same editor as the panel', async () => {
    const id = await createTask({ title: 'Call the plumber', priority: 2, due: { date: '2099-03-04' } })
    navigate({ view: 'task', id })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!page()?.querySelector('[data-facts]'))
    const facts = page()!.querySelector<HTMLElement>('[data-facts]')!
    const fact = (name: string) => facts.querySelector<HTMLElement>(`[data-fact="${name}"]`)!
    expect([...facts.querySelectorAll('[data-fact-group] > h3')].map((h) => h.textContent)).toEqual(['Schedule', 'Details', 'Labels', 'Project'])
    expect(fact('priority').textContent).toContain('Priority 2')
    expect(fact('deadline').textContent).toContain('Set a deadline')
    expect(fact('location').textContent).toContain('Add a place')
    expect(fact('repeat').textContent).toContain('Doesn’t repeat')
    // Blocks and the origin only appear with a value.
    expect(facts.querySelector('[data-fact="blocks"]')).toBeNull()
    await click(fact('deadline').querySelector('button')!)
    await waitFor(() => !!document.querySelector('[role="dialog"]'))
    expect(fact('deadline').querySelector('button')!.getAttribute('aria-expanded')).toBe('true')
    // The When editor opens on its Deadline segment.
    expect(document.querySelector('[role="dialog"] [aria-pressed="true"], [role="dialog"] [aria-checked="true"], [role="dialog"] [aria-selected="true"]')?.textContent).toContain('Deadline')
    await r.unmount()
  })
})
