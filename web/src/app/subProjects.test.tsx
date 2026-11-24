// @vitest-environment happy-dom
// Sub-projects as a collapsible group at the top of a project (OpenSpec change
// ux-overhaul, project-organization "Sub-projects inside a project view").
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setListDisplay } from '../lib/listDisplay'
import { saveQueryFilter, projectFilterKey } from '../lib/deviceFilters'
import { applyOps, createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection, saveViewMode } from '../lib/sections'
import type { Op, Task, User } from '../lib/types'
import { click, key, render, mockFetch, noPublicLinks, type, visibleText, waitFor } from '../ui/test-utils'
import { listState } from './listActions'
import { hideBulkToast } from './bulk/toastStore'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { TaskListView } from './TaskListView'

// The project header asks the server for its public links.
beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  history.replaceState(null, '', '/')
})


describe('sub-projects group', () => {
  it('lists direct sub-projects with subtree counts above the first task, collapses per device, and is absent on a leaf', async () => {
    const home = await createProject({ name: 'Home' })
    const kitchen = await createProject({ name: 'Kitchen', parent_id: home })
    const sink = await createProject({ name: 'Sink', parent_id: kitchen })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    await createTask({ title: 'Paint', project_id: home })
    await createTask({ title: 'Tiles', project_id: kitchen })
    await createTask({ title: 'Taps', project_id: kitchen })
    await createTask({ title: 'Trap', project_id: sink })

    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => r.container.textContent!.includes('Paint') && r.container.querySelector('[data-sub-projects]') !== null)
    const group = r.container.querySelector('[data-sub-projects]')!
    // Direct children only, each with the open total of its whole subtree.
    expect([...group.querySelectorAll('[data-sub-project]')].map((b) => visibleText(b))).toEqual(['Kitchen3', 'Garden0'])
    expect(visibleText(group.querySelector('[data-group-header] [data-group-count]')!)).toBe('2')
    // Above the list, below the header.
    const order = [...r.container.querySelectorAll('[data-page-header], [data-sub-projects], [data-task-id]')]
    expect(order[0].hasAttribute('data-page-header')).toBe(true)
    expect(order[1].hasAttribute('data-sub-projects')).toBe(true)

    await click(group.querySelector('[data-group-toggle]')!)
    await waitFor(() => group.querySelectorAll('[data-sub-project]').length === 0, 'the group folded')
    expect(group.querySelectorAll('[data-sub-project]')).toHaveLength(0)
    expect(group.querySelector('[data-group-toggle]')?.getAttribute('aria-expanded')).toBe('false')
    expect(JSON.parse(localStorage.getItem('opentodo.collapsed')!)).toContain(`project:${home}:sub-projects:folded`)
    await r.unmount()

    // The collapse survives a reload of the view; a leaf project has no group at all.
    const again = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => again.container.querySelector('[data-sub-projects] [data-group-header]') !== null)
    expect(again.container.querySelector('[data-sub-projects] [data-group-header]')?.getAttribute('data-collapsed')).toBe('true')
    await click(again.container.querySelector('[data-sub-projects] [data-group-toggle]')!)
    await waitFor(() => again.container.querySelectorAll('[data-sub-project]').length === 2)
    await click(again.container.querySelector(`[data-sub-project="${kitchen}"]`)!)
    expect(location.pathname).toBe(`/project/${kitchen}`)
    await again.unmount()

    const leaf = await render(<TaskListView route={{ view: 'project', id: garden }} />)
    await waitFor(() => !!leaf.container.querySelector('[data-page-header]'), 'the leaf project')
    expect(leaf.container.querySelector('[data-sub-projects]')).toBeNull()
    await leaf.unmount()
  })
})

// Sub-projects and the project's own tasks apart (subprojects-above-tasks, GitHub issue 1981).
describe('sub-projects above the tasks', () => {
  /** The page's sub-projects group, bars and task rows, top to bottom. */
  const outline = (root: HTMLElement) => [...root.querySelectorAll('[data-sub-projects], [data-group-header], [data-task-id]')]
    .filter((el) => !el.closest('[data-sub-projects]') || el.hasAttribute('data-sub-projects'))
    .map((el) => el.hasAttribute('data-sub-projects') ? 'sub-projects'
      : el.hasAttribute('data-task-id') ? `task:${visibleText(el.querySelector('[data-row-title]') ?? el).trim()}`
      : `bar:${visibleText(el.querySelector('[data-group-label]')!)}`)

  it('puts the tasks under their own Tasks bar, at the top level, below the sub-projects', async () => {
    const home = await createProject({ name: 'Home' })
    await createProject({ name: 'Garden', parent_id: home })
    const paint = await createTask({ title: 'Paint', project_id: home })
    await createTask({ title: 'Buy brushes', project_id: home, parent_id: paint })
    await createTask({ title: 'Tiles', project_id: home })

    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => r.container.querySelector('[data-group="all"] [data-group-header]') !== null, 'the Tasks bar')
    const order = outline(r.container)
    expect(order[0]).toBe('sub-projects')
    expect(order[1]).toBe('bar:Tasks')
    expect(order.slice(2).every((o) => o.startsWith('task:'))).toBe(true)
    // The bar counts the open rows below it.
    expect(visibleText(r.container.querySelector('[data-group="all"] [data-group-header] [data-group-count]')!)).toBe('3')
    // Top-level tasks are not indented; only the subtask is.
    const depth = (id: string) => r.container.querySelector(`[data-task-id="${id}"]`)!.getAttribute('data-depth')
    expect(depth(paint)).toBe('0')
    // A sub-project row keeps a task row's columns: the leading slot (empty: Garden has nothing to show), then the mark where the checkbox is.
    const row = r.container.querySelector('[data-sub-project-row]')!
    expect(row.children).toHaveLength(2)
    expect(row.children[0].getAttribute('aria-hidden')).toBe('true')
    expect(row.children[0].className).toContain('w-4')
    expect(row.querySelector('[data-sub-project]')!.children[0].className).toContain('w-5')
    // The bar folds the tasks of this project only, on this device.
    await click(r.container.querySelector(`[data-group="all"] [data-group-toggle]`)!)
    await waitFor(() => r.container.querySelector(`[data-task-id="${paint}"]`) === null, 'the tasks folded')
    // Folded tasks leave the list: j selects none of them, so Enter opens nothing.
    expect(r.container.querySelector('[data-empty-state]')).toBeNull()
    const before = location.pathname
    await key(document, 'j')
    await key(document, 'Enter')
    expect(r.container.querySelector('[aria-current]')).toBeNull()
    expect(location.pathname).toBe(before)
    await r.unmount()
    const errands = await createProject({ name: 'Errands' })
    await createProject({ name: 'Post', parent_id: errands })
    await createTask({ title: 'Stamps', project_id: errands })
    const other = await render(<TaskListView route={{ view: 'project', id: errands }} />)
    await waitFor(() => other.container.textContent!.includes('Stamps'), 'another project keeps its tasks open')
    await other.unmount()
  })

  it('adds no Tasks bar to a leaf project, nor where sections already head the tasks', async () => {
    const leaf = await createProject({ name: 'Errands' })
    await createTask({ title: 'Post office', project_id: leaf })
    const a = await render(<TaskListView route={{ view: 'project', id: leaf }} />)
    await waitFor(() => a.container.textContent!.includes('Post office'))
    expect(a.container.querySelector('[data-group="all"] [data-group-header]')).toBeNull()
    await a.unmount()

    const home = await createProject({ name: 'Home' })
    await createProject({ name: 'Garden', parent_id: home })
    const s = await createSection(home, 'Kitchen')
    await createTask({ title: 'Paint', project_id: home })
    await createTask({ title: 'Tiles', project_id: home, section_id: s })
    const b = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => b.container.textContent!.includes('Tiles') && b.container.querySelector('[data-sub-projects]') !== null)
    expect(b.container.querySelector('[data-group="all"] [data-group-header]')).toBeNull()
    expect(outline(b.container).slice(0, 3)).toEqual(['sub-projects', 'bar:No section', 'task:Paint'])
    await b.unmount()
  })

  it('shows no sub-projects on the board: its columns are the sections', async () => {
    const home = await createProject({ name: 'Home' })
    await createProject({ name: 'Garden', parent_id: home })
    await createSection(home, 'Doing')
    await createTask({ title: 'Paint', project_id: home })
    await saveViewMode(home, 'board')
    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => r.container.textContent!.includes('Paint') && r.container.textContent!.includes('Doing'))
    expect(r.container.querySelector('[data-sub-projects]')).toBeNull()
    expect(r.container.querySelector('[data-group="all"] [data-group-header]')).toBeNull()
    await r.unmount()
  })
})

// A sub-project opened in place inside its parent (OpenSpec change subproject-inline, GitHub issue 1665).
describe('a sub-project open in place', () => {
  const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
  const shell = async (id: string) => { navigate({ view: 'project', id }); return render(<Shell user={user} onLogout={() => {}} />) }
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)
  const block = (id: string) => document.querySelector<HTMLElement>(`[data-sub-project-block="${id}"]`)
  const toggle = (id: string) => document.querySelector<HTMLElement>(`[data-sub-project-row="${id}"] [data-sub-project-toggle]`)
  const toast = () => document.querySelector('[data-bulk-toast]')?.textContent ?? ''
  const undo = () => click(document.querySelector('[data-bulk-toast] [data-toast-undo]')!)
  const stored = (id: string) => db.tasks.get(id) as Promise<Task>

  /** Home with its task Paint; Garden (Mow, Weed) holding Beds (Mulch); Kitchen, empty. */
  async function seed() {
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    const beds = await createProject({ name: 'Beds', parent_id: garden })
    const kitchen = await createProject({ name: 'Kitchen', parent_id: home })
    const paint = await createTask({ title: 'Paint', project_id: home })
    const mow = await createTask({ title: 'Mow', project_id: garden })
    const weed = await createTask({ title: 'Weed', project_id: garden })
    const mulch = await createTask({ title: 'Mulch', project_id: beds })
    return { home, garden, beds, kitchen, paint, mow, weed, mulch }
  }

  /** Press on `el`, move over `over` and release there: whether it rang and whether a drop line showed. */
  async function drag(el: Element, over: Element) {
    document.elementFromPoint = () => over
    await act(async () => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
    })
    const active = over.closest('[data-task-drop]')?.hasAttribute('data-drop-active') ?? false
    const line = !!document.querySelector('[data-drop-indicator]')
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 })) })
    await waitFor(() => !document.querySelector('[data-drag-ghost]'), 'the drag ended')
    return { active, line }
  }

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    await db.meta.put({ key: 'userId', value: 'u1' })
    resetPanel()
    hideBulkToast()
  })
  afterEach(() => resetPanel())

  it('opens with its arrow, nests its own sub-projects, keeps the choice after a remount, and the name still opens it', async () => {
    const p = await seed()
    const r = await render(<TaskListView route={{ view: 'project', id: p.home }} />)
    await waitFor(() => !!row(p.paint) && !!toggle(p.garden))
    // Folded by default; an empty sub-project offers no arrow.
    expect(row(p.mow)).toBeNull()
    expect(toggle(p.kitchen)).toBeNull()
    expect(toggle(p.garden)!.getAttribute('aria-expanded')).toBe('false')
    expect(toggle(p.garden)!.getAttribute('aria-label')).toBe('Expand Garden')
    await click(toggle(p.garden)!)
    await waitFor(() => !!block(p.garden)?.querySelector(`[data-task-id="${p.mow}"]`), 'Garden opened')
    expect(toggle(p.garden)!.getAttribute('aria-expanded')).toBe('true')
    // Its tasks, then Beds one step in, folded; its count is the subtree's.
    expect(visibleText(block(p.garden)!.querySelector('[data-sub-project]')!)).toBe('Garden3')
    const order = [...document.querySelectorAll('[data-sub-project-row], [data-task-id]')].map((el) => el.getAttribute('data-sub-project-row') ?? el.getAttribute('data-task-id'))
    expect(order).toEqual([p.garden, p.mow, p.weed, p.beds, p.kitchen, p.paint])
    expect(block(p.beds)!.querySelector('[data-sub-project-row]')!.getAttribute('style')).toContain('padding-left: 2rem')
    await click(toggle(p.beds)!)
    await waitFor(() => !!row(p.mulch), 'Beds opened')
    // Beds is a list nested in Garden's item, so its level is announced.
    expect(block(p.beds)!.parentElement!.closest('[data-sub-project-block]')).toBe(block(p.garden))
    // From the keyboard: ← folds Beds, → opens it again.
    const name = document.querySelector<HTMLElement>(`[data-sub-project="${p.beds}"]`)!
    name.focus()
    await key(name, 'ArrowLeft')
    await waitFor(() => !row(p.mulch), 'Beds folded by ←')
    await key(name, 'ArrowRight')
    await waitFor(() => !!row(p.mulch), 'Beds opened by →')
    await r.unmount()

    // Per device and kept: the list opens with both still open.
    const again = await render(<TaskListView route={{ view: 'project', id: p.home }} />)
    await waitFor(() => !!row(p.mow) && !!row(p.mulch), 'still open after a remount')
    expect(JSON.parse(localStorage.getItem('opentodo.collapsed')!)).toEqual(expect.arrayContaining([`project:${p.garden}:inline:open`, `project:${p.beds}:inline:open`]))
    await click(document.querySelector(`[data-sub-project="${p.garden}"]`)!)
    expect(location.pathname).toBe(`/project/${p.garden}`)
    await again.unmount()
  })

  it('moves the cursor to an opened task, ticks it with x and completes it with Undo; a viewer sees read-only rows', async () => {
    const p = await seed()
    localStorage.setItem('opentodo.collapsed', JSON.stringify([`project:${p.garden}:inline:open`]))
    const r = await shell(p.home)
    await waitFor(() => !!row(p.mow) && !!row(p.paint))
    await key(document, 'j')
    await waitFor(() => row(p.mow)!.hasAttribute('aria-current'), 'the cursor on Mow')
    // x ticks it for a bulk action, as any row; c completes it, with Undo.
    await key(document, 'x')
    await waitFor(() => row(p.mow)!.hasAttribute('data-ticked'), 'Mow ticked')
    await key(document, 'x')
    await waitFor(() => !row(p.mow)!.hasAttribute('data-ticked'), 'Mow unticked')
    await key(document, 'c')
    await waitFor(async () => !!(await stored(p.mow)).completed_at && toast().includes('Undo'), 'Mow completed')
    await undo()
    await waitFor(async () => !(await stored(p.mow)).completed_at && !!block(p.garden)?.querySelector(`[data-task-id="${p.mow}"]`), 'Mow back under Garden')
    await r.unmount()

    // A viewer of Garden, inside an editable Home: Garden's rows are read-only and take no drop.
    await db.memberships.put({ projectId: p.garden, role: 'viewer', ownerId: 'someone', members: [] })
    const v = await shell(p.home)
    await waitFor(() => !!row(p.mow) && !!row(p.paint))
    expect(row(p.mow)!.querySelector<HTMLButtonElement>('[data-row-controls] button')!.disabled).toBe(true)
    expect(row(p.paint)!.querySelector<HTMLButtonElement>('[data-row-controls] button')!.disabled).toBe(false)
    expect(document.querySelector(`[data-sub-project-row="${p.garden}"]`)!.hasAttribute('data-task-drop')).toBe(false)
    await key(document, 'j')
    await waitFor(() => row(p.mow)!.hasAttribute('aria-current'))
    await key(document, 'x')
    await key(document, 'c')
    expect(row(p.mow)!.hasAttribute('data-ticked')).toBe(false)
    expect((await stored(p.mow)).completed_at ?? null).toBeNull()
    await v.unmount()
  })

  it('drops a task on a sub-project row and back on the Tasks bar, with Undo; no drop line on another project\'s row', async () => {
    const p = await seed()
    localStorage.setItem('opentodo.collapsed', JSON.stringify([`project:${p.garden}:inline:open`]))
    const r = await shell(p.home)
    await waitFor(() => !!row(p.mow) && !!row(p.paint))
    // Onto Garden's row: it rings, and Paint moves there with an Undo toast.
    const gardenRow = document.querySelector(`[data-sub-project-row="${p.garden}"]`)!
    expect(await drag(row(p.paint)!, gardenRow)).toEqual({ active: true, line: false })
    await waitFor(() => toast().includes('Moved to Garden'))
    expect((await stored(p.paint)).project_id).toBe(p.garden)
    await waitFor(() => !!block(p.garden)?.querySelector(`[data-task-id="${p.paint}"]`), 'Paint under Garden')
    await undo()
    await waitFor(async () => (await stored(p.paint)).project_id === p.home)
    // Over a row of another project's block: no drop line, and nothing changes.
    await waitFor(() => !!document.querySelector(`[data-group="all"] [data-task-id="${p.paint}"]`), 'Paint back under Tasks')
    expect((await drag(row(p.paint)!, row(p.mow)!)).line).toBe(false)
    expect((await stored(p.paint)).project_id).toBe(p.home)
    // Onto the Tasks bar: Garden's Mow comes to Home.
    hideBulkToast()
    const bar = document.querySelector(`[data-group="all"] [data-task-drop="project:${p.home}"]`)!
    expect((await drag(row(p.mow)!, bar)).active).toBe(true)
    await waitFor(() => toast().includes('Moved to Home'))
    expect((await stored(p.mow)).project_id).toBe(p.home)
    await undo()
    await waitFor(async () => (await stored(p.mow)).project_id === p.garden)
    await r.unmount()
  })

  it('applies the view\'s query filter inside and follows a sync from another device', async () => {
    const p = await seed()
    await db.tasks.update(p.weed, { priority: 1 })
    localStorage.setItem('opentodo.collapsed', JSON.stringify([`project:${p.garden}:inline:open`]))
    await saveQueryFilter(projectFilterKey(p.home), 'p1')
    const r = await render(<TaskListView route={{ view: 'project', id: p.home }} />)
    await waitFor(() => !!row(p.weed), 'Weed shown')
    expect(row(p.mow)).toBeNull()
    await r.unmount()

    await saveQueryFilter(projectFilterKey(p.home), '')
    const s = await render(<TaskListView route={{ view: 'project', id: p.home }} />)
    await waitFor(() => !!row(p.mow))
    // Another device adds a task to Garden; once it syncs, it is under Garden's row.
    const id = 'remote-task'
    const ts = Date.now() + 10_000
    await applyOps([['title', 'Rake'], ['project_id', p.garden], ['position', 99], ['created_at', ts]].map(([field, value], i) => (
      { id: `r${i}`, entity: 'task', entityId: id, field, value, ts, device: 'phone' } as Op)))
    await waitFor(() => !!block(p.garden)?.querySelector(`[data-task-id="${id}"]`), 'the synced task under Garden')
    await s.unmount()
  })

  it('offers no arrow with a grouping, on the board or on the timeline', async () => {
    const p = await seed()
    await setListDisplay({ kind: 'project', id: p.home }, { groupBy: 'priority' })
    const r = await render(<TaskListView route={{ view: 'project', id: p.home }} />)
    await waitFor(() => !!document.querySelector(`[data-sub-project-row="${p.garden}"]`) && !!row(p.paint))
    expect(toggle(p.garden)).toBeNull()
    await r.unmount()
    await setListDisplay({ kind: 'project', id: p.home }, { groupBy: 'section' })
    for (const mode of ['board', 'timeline'] as const) {
      await saveViewMode(p.home, mode)
      const v = await render(<TaskListView route={{ view: 'project', id: p.home }} />)
      await waitFor(() => v.container.textContent!.includes('Paint'), mode)
      expect(v.container.querySelector('[data-sub-project-toggle]')).toBeNull()
      if (mode === 'timeline') expect(v.container.querySelector(`[data-sub-project-row="${p.garden}"]`)).not.toBeNull()
      await v.unmount()
    }
  })

  it('moves a task of an open sub-project into a parent with sections at the section dropped on, and into an empty parent by its Tasks bar', async () => {
    const p = await seed()
    const kitchen = await createSection(p.home, 'Kitchen')
    localStorage.setItem('opentodo.collapsed', JSON.stringify([`project:${p.garden}:inline:open`]))
    const r = await shell(p.home)
    await waitFor(() => !!row(p.mow) && !!document.querySelector(`[data-drop-target="section:${kitchen}"]`))
    await drag(row(p.mow)!, document.querySelector(`[data-drop-target="section:${kitchen}"]`)!)
    await waitFor(() => toast().includes('Moved to Home'), 'the move into Home')
    expect(await stored(p.mow)).toMatchObject({ project_id: p.home, section_id: kitchen })
    await undo()
    await waitFor(async () => (await stored(p.mow)).project_id === p.garden && !(await stored(p.mow)).section_id, 'back in Garden by one Undo')
    await r.unmount()

    // A parent with no open task of its own keeps its Tasks bar while a sub-project is open.
    const empty = await createProject({ name: 'Errands' })
    const post = await createProject({ name: 'Post', parent_id: empty })
    const stamps = await createTask({ title: 'Stamps', project_id: post })
    localStorage.setItem('opentodo.collapsed', JSON.stringify([`project:${post}:inline:open`]))
    hideBulkToast()
    const e = await shell(empty)
    await waitFor(() => !!row(stamps) && !!document.querySelector(`[data-group="all"] [data-task-drop="project:${empty}"]`), 'the Tasks bar over no tasks')
    expect((await drag(row(stamps)!, document.querySelector(`[data-group="all"] [data-task-drop="project:${empty}"]`)!)).active).toBe(true)
    await waitFor(async () => (await stored(stamps)).project_id === empty, 'Stamps in Errands')
    await e.unmount()
  })

  it('refuses ticked tasks of several projects among rows, with a word', async () => {
    const p = await seed()
    localStorage.setItem('opentodo.collapsed', JSON.stringify([`project:${p.garden}:inline:open`]))
    const r = await shell(p.home)
    await waitFor(() => !!row(p.mow) && !!row(p.paint))
    await key(document, 'j')
    await key(document, 'x')
    await key(document, 'j')
    await key(document, 'j')
    await key(document, 'x')
    await waitFor(() => row(p.mow)!.hasAttribute('data-ticked') && row(p.paint)!.hasAttribute('data-ticked'), 'Mow and Paint ticked')
    const before = (await stored(p.weed)).position
    await drag(row(p.mow)!, row(p.weed)!)
    await waitFor(() => toast().includes('The tasks must be in one project'))
    expect((await stored(p.paint)).project_id).toBe(p.home)
    expect((await stored(p.weed)).position).toBe(before)
    await r.unmount()
  })

  it("adds an `o` entry after a task of an open sub-project to that sub-project", async () => {
    const p = await seed()
    localStorage.setItem('opentodo.collapsed', JSON.stringify([`project:${p.garden}:inline:open`]))
    const r = await render(<TaskListView route={{ view: 'project', id: p.home }} />)
    await waitFor(() => !!row(p.mow) && !!listState())
    await act(async () => { listState()!.focusQuickAdd(p.mow) })
    const quick = r.container.querySelector('textarea[aria-label="Add a task"]') as HTMLTextAreaElement
    await type(quick, 'Edge the lawn')
    await act(async () => { quick.form!.requestSubmit() })
    await waitFor(async () => (await db.tasks.toArray()).some((x) => x.title === 'Edge the lawn'), 'added')
    const added = (await db.tasks.toArray()).find((x) => x.title === 'Edge the lawn')!
    expect(added.project_id).toBe(p.garden)
    await waitFor(() => {
      const ids = [...block(p.garden)!.querySelectorAll('[data-task-id]')].map((el) => el.getAttribute('data-task-id'))
      return ids.indexOf(added.id) === ids.indexOf(p.mow) + 1
    }, 'right after Mow, under Garden')
    await r.unmount()
  })
})
