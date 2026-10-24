// @vitest-environment happy-dom
// Settings → Workspaces (OpenSpec changes workspaces, task 7.1, and
// workspaces-settings-v2): the two panes, the drill-down, the tabs, the groups
// editor and the invite options.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, resetDeviceId } from '../lib/ops'
import type { User, Workspace, WorkspaceEntry } from '../lib/types'
import { storeWorkspaces, switchTo } from '../lib/workspaces'
import { click, flush, render, type, visibleText, minWidthPx } from '../ui/test-utils'
import { resetPanel } from './panel'
import { WorkspacesSettings } from './WorkspacesSettings'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

const entry = (id: string, extra: Partial<Workspace> = {}, members: WorkspaceEntry['members'] = [{ userId: 'u1', name: 'Ada', role: 'owner' }]): WorkspaceEntry =>
  ({ id, name: id, icon: '', color: '', default: false, role: 'owner', ownerId: 'u1', members, groups: [], ...extra })

const family = (extra: Partial<Workspace> = {}): WorkspaceEntry => ({
  ...entry('w-fam', { name: 'Family', ...extra }, [
    { userId: 'u1', name: 'Ada', role: extra.role ?? 'owner' }, { userId: 'u2', name: 'Bob', role: 'member' }, { userId: 'u4', name: 'Dan', role: 'member' },
  ]),
  groups: [{ id: 'g-adults', name: 'Adults', members: ['u1', 'u2'] }],
})

/** The viewport width the media queries see. */
let width = 1280
const original = window.matchMedia
/** Every request the page makes, as [method, url, body]. */
let calls: [string, string, unknown][] = []
/** What the workspace list route answers (every change reloads it). */
let listed: WorkspaceEntry[] = []

/** Stores the workspaces on the device and as the server's answer. */
async function seed(list: WorkspaceEntry[]) {
  listed = list
  await storeWorkspaces(list)
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetPanel()
  width = 1280
  calls = []
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([init?.method ?? 'GET', String(url), init?.body ? JSON.parse(String(init.body)) : undefined])
    const body = { invites: [], workspaces: listed, link: 'https://example.com/i/abc', invite: {} }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => { window.matchMedia = original; document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const tab = (root: HTMLElement, name: string) => [...root.querySelectorAll('[role="tab"]')].find((b) => b.textContent!.startsWith(name))

async function openTab(root: HTMLElement, name: string) {
  await waitFor(() => !!tab(root, name))
  await click(tab(root, name)!)
}

describe('Settings → Workspaces', () => {
  it('Which workspace is open: the current marker, aria-current and a header naming it', async () => {
    await seed([entry('w-p', { default: true, name: 'Personal' }), family(), entry('w-work', { name: 'Work' })])
    await switchTo('w-fam')
    const r = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-workspace-detail="w-fam"]'))
    const current = r.container.querySelectorAll('[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('data-workspace-row')).toBe('w-fam')
    expect(current[0].querySelector('[data-current-marker]')).not.toBeNull()
    expect(r.container.querySelector('[data-workspace-row="w-work"]')!.getAttribute('aria-current')).toBeNull()
    const header = () => visibleText(r.container.querySelector('[data-workspace-detail] header')!)
    await waitFor(() => header().includes('3 members'))
    expect(header()).toContain('Family')
    await click(r.container.querySelector('[data-workspace-row="w-work"]')!)
    await waitFor(() => !!r.container.querySelector('[data-workspace-detail="w-work"]'))
    expect(r.container.querySelector('[data-workspace-row="w-work"]')!.getAttribute('aria-current')).toBe('true')
    await r.unmount()
  })

  it('Owner manages a workspace; a member sees it read-only with Leave', async () => {
    await seed([
      entry('w-p', { default: true, name: 'Personal' }), family(),
      entry('w-club', { name: 'Club', role: 'member', ownerId: 'u3' }, [{ userId: 'u3', name: 'Cleo', role: 'owner' }, { userId: 'u1', name: 'Ada', role: 'member' }]),
    ])
    await switchTo('w-fam')
    const r = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => r.container.textContent!.includes('Danger zone'))
    expect(r.container.textContent).toContain('Delete workspace')
    expect(tab(r.container, 'Invites')).toBeTruthy()
    await openTab(r.container, 'Members')
    await waitFor(() => !!r.container.querySelector('[data-add-workspace-member]'))
    await r.unmount()
    await switchTo('w-club')
    const m = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => m.container.textContent!.includes('Leave workspace'))
    expect(m.container.textContent).not.toContain('Delete workspace')
    expect(tab(m.container, 'Invites')).toBeUndefined()
    await openTab(m.container, 'Members')
    await waitFor(() => !!m.container.querySelector('[data-workspace-members]'))
    expect(m.container.querySelector('[data-add-workspace-member]')).toBeNull()
    expect(m.container.querySelector('[data-workspace-members] select')).toBeNull()
    await m.unmount()
  })

  it('the default workspace shows General only', async () => {
    await seed([entry('w-p', { default: true, name: 'Personal' })])
    await switchTo('w-p')
    const r = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-default-workspace-note]'))
    expect(r.container.querySelector('[role="tablist"]')).toBeNull()
    await r.unmount()
  })

  it('Drill down on a phone: the list, then the workspace with Back', async () => {
    width = 360
    await seed([entry('w-p', { default: true, name: 'Personal' }), family()])
    await switchTo('w-fam')
    const r = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => !!r.container.querySelector('[data-workspace-row="w-fam"]'))
    expect(r.container.querySelector('[data-workspace-detail]')).toBeNull()
    await click(r.container.querySelector('[data-workspace-row="w-fam"]')!)
    await waitFor(() => !!r.container.querySelector('[data-workspace-detail="w-fam"]'))
    expect(r.container.querySelector('[data-workspaces-list]')).toBeNull()
    await click(r.container.querySelector('[data-workspace-back]')!)
    await waitFor(() => !!r.container.querySelector('[data-workspaces-list]'))
    expect(r.container.querySelector('[data-workspace-detail]')).toBeNull()
    await r.unmount()
  })

  it('Edit a group: rename, add through the picker, remove', async () => {
    await seed([entry('w-p', { default: true, name: 'Personal' }), family()])
    await switchTo('w-fam')
    const r = await render(<WorkspacesSettings user={user} />)
    await openTab(r.container, 'Groups')
    await waitFor(() => !!r.container.querySelector('[data-group-row="g-adults"]'))
    expect(visibleText(r.container.querySelector('[data-group-row="g-adults"]')!)).toContain('2 members')
    await click(r.container.querySelector('[data-group-row="g-adults"]')!)
    await waitFor(() => !!r.container.querySelector('[data-group-editor="g-adults"]'))
    const name = r.container.querySelector<HTMLInputElement>('[data-rename-group] input')!
    name.select()
    await type(name, 'Grown-ups')
    await click(r.container.querySelector('[data-rename-group] button[type="submit"]')!)
    await waitFor(() => calls.some(([m, u, b]) => m === 'PATCH' && u.endsWith('/groups/g-adults') && (b as { name?: string })?.name?.includes('Grown-ups') === true))
    const picker = r.container.querySelector<HTMLInputElement>('[data-group-picker] input')!
    picker.focus()
    picker.dispatchEvent(new FocusEvent('focus'))
    await type(picker, 'Dan')
    await waitFor(() => !!document.querySelector('[role="option"]'))
    await click(document.querySelector('[role="option"]')!)
    await waitFor(() => calls.some(([m, u]) => m === 'PUT' && u.endsWith('/groups/g-adults/members/u4')))
    await click(r.container.querySelector('[data-group-member="u2"] button')!)
    await waitFor(() => calls.some(([m, u]) => m === 'DELETE' && u.endsWith('/groups/g-adults/members/u2')))
    await r.unmount()
  })

  it('Deleting a group asks first and names the projects shared through it', async () => {
    await seed([entry('w-p', { default: true, name: 'Personal' }), family()])
    await switchTo('w-fam')
    const house = await createProject({ name: 'House' })
    await db.memberships.put({ projectId: house, role: 'owner', ownerId: 'u1', members: [
      { userId: 'u1', name: 'Ada', email: 'a@example.com', role: 'owner' },
      { userId: 'u2', name: 'Bob', email: 'b@example.com', role: 'editor', via: [{ id: 'g-adults', name: 'Adults' }] },
    ] })
    const r = await render(<WorkspacesSettings user={user} />)
    await openTab(r.container, 'Groups')
    await waitFor(() => !!r.container.querySelector('[data-group-row="g-adults"]'))
    await click(r.container.querySelector('[data-group-row="g-adults"]')!)
    await waitFor(() => !!r.container.querySelector('[data-delete-group]'))
    await click(r.container.querySelector('[data-delete-group]')!)
    await waitFor(() => document.body.textContent!.includes('lose access through this group'))
    expect(document.body.textContent).toContain('House lose access through this group')
    expect(calls.some(([m]) => m === 'DELETE')).toBe(false)
    await r.unmount()
  })

  it('Invite an admin for a day; an admin offers Member only', async () => {
    await seed([entry('w-p', { default: true, name: 'Personal' }), family()])
    await switchTo('w-fam')
    const r = await render(<WorkspacesSettings user={user} />)
    await openTab(r.container, 'Invites')
    await waitFor(() => !!r.container.querySelector('[data-invite-role]'))
    const role = r.container.querySelector<HTMLSelectElement>('[data-invite-role]')!
    role.value = 'admin'
    role.dispatchEvent(new Event('change', { bubbles: true }))
    const expiry = r.container.querySelector<HTMLSelectElement>('[data-invite-expiry]')!
    expiry.value = '24'
    expiry.dispatchEvent(new Event('change', { bubbles: true }))
    await flush(20)
    await click(r.container.querySelector('[data-create-workspace-link]')!)
    await waitFor(() => calls.some(([m, u]) => m === 'POST' && u.endsWith('/invites')))
    expect(calls.find(([m, u]) => m === 'POST' && u.endsWith('/invites'))![2]).toMatchObject({ role: 'admin', expiresInHours: 24 })
    await r.unmount()
    await seed([entry('w-p', { default: true, name: 'Personal' }), family({ role: 'admin', ownerId: 'u3' })])
    const a = await render(<WorkspacesSettings user={user} />)
    await openTab(a.container, 'Invites')
    await waitFor(() => !!a.container.querySelector('[data-invite-role]'))
    expect([...a.container.querySelectorAll('[data-invite-role] option')].map((o) => (o as HTMLOptionElement).value)).toEqual(['member'])
    await a.unmount()
  })

  it('Offline: the lists stay and the controls say a connection is needed', async () => {
    await seed([entry('w-p', { default: true, name: 'Personal' }), entry('w-fam', { name: 'Family' })])
    await switchTo('w-fam')
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const r = await render(<WorkspacesSettings user={user} />)
    await waitFor(() => r.container.textContent!.includes('need a connection'))
    expect((r.container.querySelector('[data-settings-new-workspace]') as HTMLButtonElement).disabled).toBe(true)
    await r.unmount()
  })
})
