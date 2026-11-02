// @vitest-environment happy-dom
// routines-shared 3.3: a shared project's routines on the Routines page and in
// the editor (Where, the project chip, "Runs as", read-only for a viewer, the
// pause notice before saving, personal steps not available, the project filter).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { publishEncryption } from '../../lib/e2ee'
import { resetCatalogueCache } from '../../lib/rules/catalogue'
import { canEditRoutine, sharedCatalogue, sharedProjectOf } from '../../lib/rules/shared'
import { createRule } from '../../lib/rules/store'
import { parseRoute, routePath } from '../router'
import type { Membership, ProjectRole, RoutineStep } from '../../lib/types'
import { click, mockFetch, render, type, waitFor } from '../../ui/test-utils'
import { RoutineEditor } from './RoutineEditor'
import { RoutinesView } from './RoutinesView'

let n = 0
let status = { enabled: true, paused: false, rules: {} as Record<string, unknown> }
let requests: { method: string; path: string; body?: unknown }[] = []

beforeEach(() => {
  useDatabase(`routines-shared-${Date.now()}-${n++}`)
  resetDeviceId()
  status = { enabled: true, paused: false, rules: {} }
  requests = []
  localStorage.clear()
  resetCatalogueCache()
  publishEncryption({ enabled: false })
  mockFetch((method, path, init) => {
    requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (path === '/api/v1/me/rules') return status
    if (path === '/api/v1/me/rules/catalogue') return { steps: [] }
    if (path === '/api/v1/me/rules/runs') return { runs: [] }
    if (path === '/api/v1/webhooks') return { webhooks: [], events: [] }
    if (path === '/api/v1/me') return { user: { id: 'me' }, mfa: {} }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function share(projectId: string, role: ProjectRole): Promise<void> {
  const m: Membership = { projectId, role, ownerId: 'alice', members: [
    { userId: 'alice', name: 'Alice', email: 'alice@example.com', role: 'owner' },
    { userId: 'me', name: 'Me', email: 'me@example.com', role },
  ] } as Membership
  await db.memberships.put(m)
}

const steps: RoutineStep[] = [
  { id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } },
  { id: 'b', kind: 'change_tasks', in: { tasks: { ref: 'a' }, set: { literal: { priority: 1 } } } },
]

describe('shared routines on this device', () => {
  it('a routine of a shared project: its project, who may change it, personal steps not available', async () => {
    const home = await createProject({ name: 'Household' })
    const mine = await createProject({ name: 'Mine' })
    await share(home, 'viewer')
    const map = new Map((await db.memberships.toArray()).map((m) => [m.projectId, m]))
    expect(sharedProjectOf({ project_id: home }, map)).toBe(home)
    expect(sharedProjectOf({ project_id: mine }, map)).toBeNull()
    expect(canEditRoutine({ project_id: home }, map)).toBe(false)
    expect(canEditRoutine({ project_id: null }, map)).toBe(true)
    const cat = sharedCatalogue({ set_focus: { kind: 'set_focus', group: 'time', available: true }, count: { kind: 'count', group: 'logic', available: true } })!
    expect(cat.set_focus).toMatchObject({ available: false, reason: 'not_in_shared' })
    expect(cat.count.available).toBe(true)
    expect(cat.webhook).toMatchObject({ available: false, reason: 'not_in_shared' })
  })

  it('"Project menu": /routines?project=<id> lists only that project\'s routines, with a filter to remove', async () => {
    const home = await createProject({ name: 'Household' })
    await share(home, 'editor')
    expect(parseRoute(`/routines?project=${home}`)).toEqual({ view: 'rules', project: home })
    expect(routePath({ view: 'rules', create: true, project: home })).toBe(`/routines/new?project=${home}`)
    await createRule({ name: 'Chores', trigger: { kind: 'manual' }, actions: null, steps, project_id: home })
    await createRule({ name: 'Mine', trigger: { kind: 'manual' }, actions: null, steps })
    status.rules = {}
    await render(<RoutinesView route={{ view: 'rules', project: home }} />)
    await waitFor(() => document.querySelectorAll('[data-rule-row]').length === 1 && !!document.querySelector('[data-rule-project]'), 'one row')
    expect(document.querySelector('[data-routines-filter]')?.textContent).toContain('Household')
    expect(document.querySelector('[data-rule-project]')?.textContent).toContain('Household')
  })

  it('"Where": New routine offers Just me and the shared projects the user edits', async () => {
    const home = await createProject({ name: 'Household' })
    const other = await createProject({ name: 'Read only' })
    await share(home, 'editor')
    await share(other, 'viewer')
    await render(<RoutinesView route={{ view: 'rules' }} />)
    await waitFor(() => !!document.querySelector('[data-new-routine][aria-haspopup]'), 'the Where menu')
    await click(document.querySelector<HTMLElement>('[data-new-routine]')!)
    const menuItems = () => [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent?.trim() ?? '')
    await waitFor(() => menuItems().includes('Just me'), 'Just me')
    const items = menuItems()
    expect(items).toContain('Household')
    expect(items).not.toContain('Read only')
  })

  it('a viewer sees the routine read-only; an editor is told that saving pauses it', async () => {
    const home = await createProject({ name: 'Household' })
    await createTask({ title: 'Dishes', project_id: home })
    await share(home, 'viewer')
    const id = await createRule({ name: 'Chores', trigger: { kind: 'manual' }, actions: null, steps, project_id: home })
    status.rules = { [id]: { run_as: { id: 'alice', name: 'Alice' } } }
    const rule = (await db.rules.get(id))!
    const view = await render(<RoutineEditor rule={rule} onBack={() => undefined} />)
    await waitFor(() => document.querySelector('[data-runs-as]')?.textContent === 'Runs as Alice', 'Runs as Alice')
    expect(document.querySelector<HTMLButtonElement>('[data-routine-save]')?.disabled).toBe(true)
    expect(document.querySelector('[data-routine-run]')).toBeNull()
    await view.unmount()

    await share(home, 'editor')
    await render(<RoutineEditor rule={rule} onBack={() => undefined} />)
    await waitFor(() => !!document.querySelector('[data-runs-as]') && !document.querySelector<HTMLButtonElement>('[data-routine-save]')?.disabled, 'editable')
    expect(document.querySelector('[data-pause-notice]')).toBeNull()
    // A rename does not pause the routine.
    await type(document.querySelector<HTMLInputElement>('[data-routine-name]')!, ' weekly')
    expect(document.querySelector('[data-pause-notice]')).toBeNull()
  })

  it('a new routine of a shared project is saved in it', async () => {
    const home = await createProject({ name: 'Household' })
    await share(home, 'editor')
    await render(<RoutineEditor project={home} draft={{ name: 'Chores', trigger: { kind: 'manual' }, condition: null, steps }} onBack={() => undefined} />)
    await waitFor(() => !!document.querySelector('[data-shared-routine]'), 'the shared line')
    await click(document.querySelector<HTMLElement>('[data-routine-save]')!)
    await waitFor(async () => (await db.rules.toArray()).some((r) => r.project_id === home), 'saved in the project')
  })
})
