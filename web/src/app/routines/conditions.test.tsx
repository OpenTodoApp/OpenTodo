// @vitest-environment happy-dom
// routine-conditions: the workspace of a routine (#1132), a project of another
// workspace named with its workspace (the display bug), and the condition's
// "is not" and "no project" tests (#1134).
import 'fake-indexeddb/auto'
import { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { publishEncryption } from '../../lib/e2ee'
import { createProject, resetDeviceId } from '../../lib/ops'
import { resetCatalogueCache } from '../../lib/rules/catalogue'
import { conditionParts } from '../../lib/rules/summary'
import { createRule } from '../../lib/rules/store'
import type { RuleCondition } from '../../lib/types'
import { storeWorkspaces, switchTo } from '../../lib/workspaces'
import { click, mockFetch, render, waitFor } from '../../ui/test-utils'
import { ConditionFields } from '../rules/RuleFields'
import { workspaceNames } from './data'
import { RoutinePage } from './RoutinePage'

let n = 0
beforeEach(() => {
  useDatabase(`routine-conditions-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  resetCatalogueCache()
  publishEncryption({ enabled: false })
  mockFetch((_method, path) => {
    if (path === '/api/v1/me/rules') return { enabled: true, paused: false, rules: {} }
    if (path === '/api/v1/me/rules/catalogue') return { steps: [] }
    if (path === '/api/v1/me/rules/runs') return { runs: [] }
    if (path === '/api/v1/rules/test') return { run: { outcome: 'applied', failed_step: -1 }, steps: [], writes: 0, test: true }
    if (path === '/api/v1/webhooks') return { webhooks: [], events: [] }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const PERSONAL = { id: 'ws-personal', name: 'Personal', icon: '', color: '', default: true, role: 'owner' as const, ownerId: 'u1', members: [], groups: [] }
const WORK = { id: 'ws-work', name: 'Work', icon: '', color: '', default: false, role: 'owner' as const, ownerId: 'u1', members: [], groups: [] }

/** Personal (current) and Work, with the project Website in Work and Home in Personal. */
async function twoWorkspaces(): Promise<{ website: string; home: string }> {
  await storeWorkspaces([PERSONAL, WORK])
  await switchTo(WORK.id)
  const website = await createProject({ name: 'Website' })
  await switchTo(PERSONAL.id)
  const home = await createProject({ name: 'Home' })
  return { website, home }
}

const editorText = () => document.querySelector('[data-testid="routine-editor"]')?.textContent ?? ''

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('a routine of a workspace', () => {
  it('names a project of another workspace with its workspace, not as removed (#1132)', async () => {
    const { website } = await twoWorkspaces()
    const id = await createRule({ name: 'Default project', trigger: { kind: 'task.created' }, condition: { project: 'none' }, actions: { section: { project_id: website, section_id: null } } })
    const r = await render(<RoutinePage route={{ view: 'rules', id }} />)
    await waitFor(() => editorText().includes('Website (Work)'), 'the project named with its workspace')
    expect(editorText()).not.toContain('a removed project')
    await r.unmount()
  })

  it('still says removed for a project that is gone', async () => {
    await twoWorkspaces()
    const id = await createRule({ name: 'Gone', trigger: { kind: 'task.created' }, actions: { section: { project_id: 'nowhere', section_id: null } } })
    const r = await render(<RoutinePage route={{ view: 'rules', id }} />)
    await waitFor(() => editorText().includes('a removed project'), 'removed')
    await r.unmount()
  })

  it('shows its workspace and changes it to every workspace', async () => {
    await twoWorkspaces()
    const id = await createRule({ name: 'P1', trigger: { kind: 'task.created' }, actions: { priority: 1 }, workspace_id: WORK.id })
    const r = await render(<RoutinePage route={{ view: 'rules', id }} />)
    const word = () => document.querySelector<HTMLButtonElement>('[data-when-card] [data-word="Workspace"]')
    await waitFor(() => /Work/.test(word()?.textContent ?? ''), 'the workspace word')
    await click(word()!)
    await waitFor(() => [...document.querySelectorAll('[role="option"]')].some((o) => o.textContent?.includes('Every workspace')), 'the choices')
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('Every workspace'))!)
    await waitFor(() => /every workspace/.test(word()?.textContent ?? ''), 'every workspace chosen')
    await click(document.querySelector('[data-routine-save]')!)
    await waitFor(async () => (await db.rules.get(id))?.workspace_id === null, 'saved as every workspace')
    await r.unmount()
  })

  it('hides the word for an account with one workspace', async () => {
    await storeWorkspaces([PERSONAL])
    const id = await createRule({ name: 'P1', trigger: { kind: 'task.created' }, actions: { priority: 1 } })
    const r = await render(<RoutinePage route={{ view: 'rules', id }} />)
    await waitFor(() => !!document.querySelector('[data-when-card]'), 'the card')
    expect(document.querySelector('[data-when-card] [data-word="Workspace"]')).toBeNull()
    await r.unmount()
  })

  it('offers the routine workspace’s projects in pickers and names every one', async () => {
    const state = { current: PERSONAL.id, defaultId: PERSONAL.id, list: [PERSONAL, WORK].map((w) => ({ ...w, icon: '', color: '' })) }
    const projects = [
      { id: 'site', name: 'Website', workspace_id: WORK.id, parent_id: null, deleted_at: null },
      { id: 'home', name: 'Home', workspace_id: null, parent_id: null, deleted_at: null },
    ]
    const work = workspaceNames(state, [], projects, WORK.id)
    expect(work.projects.map((p) => p.name)).toEqual(['Website (Work)', 'Home'])
    expect(work.pickProjects.map((p) => p.id)).toEqual(['site'])
    expect(workspaceNames(state, [], projects, null).pickProjects.map((p) => p.id)).toEqual(['site', 'home'])
    expect(workspaceNames(state, [], projects, undefined).pickProjects.map((p) => p.id)).toEqual(['home'])
  })
})

function Conditions({ start, onValue }: { start: RuleCondition; onValue: (c: RuleCondition) => void }) {
  const [value, setValue] = useState(start)
  const names = { labels: [], projects: [{ id: 'p', name: 'Errands', deleted_at: null, archived: false, parent_id: null, position: 1 }] as never[], sections: [] }
  return <ConditionFields value={value} names={names} onChange={(c) => { setValue(c); onValue(c) }} />
}

describe('"is not" and "no project" (#1134)', () => {
  const test = (field: string) => document.querySelector<HTMLSelectElement>(`select[aria-label="${field} test"]`)!

  it('a project test turns into "is not" keeping the project, and into "no project"', async () => {
    let got: RuleCondition = {}
    const r = await render(<Conditions start={{ project: { in: ['p'], descendants: true } }} onValue={(c) => { got = c }} />)
    await waitFor(() => !!test('Project'), 'the project test')
    expect(test('Project').value).toBe('in')
    await choose(test('Project'), 'not_in')
    await waitFor(() => JSON.stringify(got) === JSON.stringify({ project: { not_in: ['p'], descendants: true } }), 'is not')
    await choose(test('Project'), 'none')
    await waitFor(() => got.project === 'none', 'no project')
    expect(document.querySelector('[data-rule-condition]')?.textContent).toContain('No project')
    await r.unmount()
  })

  it('a priority test "is not" writes nothing until a priority is chosen', async () => {
    let got: RuleCondition = {}
    let calls = 0
    const r = await render(<Conditions start={{}} onValue={(c) => { got = c; calls++ }} />)
    await waitFor(() => !!test('Priority'), 'the priority test')
    await choose(test('Priority'), 'not_in')
    const value = () => document.querySelector<HTMLSelectElement>('select[aria-label="Priority"]')
    await waitFor(() => !!value(), 'the priority chooser')
    expect(got.priority).toBeUndefined()
    await choose(value()!, '1')
    await waitFor(() => JSON.stringify(got.priority) === JSON.stringify({ not_in: [1] }), 'not priority 1')
    expect(calls).toBeGreaterThan(0)
    await r.unmount()
  })

  it('reads the tests as phrases', () => {
    const names = { labels: [], projects: [{ id: 'p', name: 'Errands', deleted_at: null }], sections: [{ id: 's', name: 'Waiting', deleted_at: null }] }
    expect(conditionParts({ project: { not_in: ['p'] }, section: { not_in: ['s'] }, priority: { not_in: [1, 2] } }, names)).toEqual(['not in Errands', 'not in section Waiting', 'not priority 1, 2'])
    expect(conditionParts({ project: 'none' }, names)).toEqual(['no project'])
  })
})
