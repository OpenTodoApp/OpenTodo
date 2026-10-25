// @vitest-environment happy-dom
// The task as a page (OpenSpec change task-full-page): a task opens at /task/<id>
// with the breadcrumb and its place in the list, j and k step through that list,
// Esc returns to it with the task selected, and a reload or a link renders the page.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { todayISO } from '../lib/dates'
import type { User } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
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
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); resetPanel(); resetTaskTrail() })

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
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
    await flush(50)
    expect(location.pathname).toBe(`/task/${ids[2]}`)
    await key(document.body, 'k')
    await waitFor(() => location.pathname === `/task/${ids[1]}` && position() === '2 / 3')
    await key(document.body, 'Escape')
    await waitFor(() => location.pathname === `/project/${project}` && !page())
    await waitFor(() => document.querySelector('[data-task-id][aria-current]')?.getAttribute('data-task-id') === ids[1])
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
