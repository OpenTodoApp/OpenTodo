// @vitest-environment happy-dom
// Public links in the share dialog and the "Public" badge (OpenSpec change
// public-links, tasks 5.1 and 5.2): create and copy, the active list, revoke with
// a confirmation, no section for a viewer, offline, and the badge following the
// active links.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, resetDeviceId } from '../lib/ops'
import type { Project, PublicLink } from '../lib/types'
import { click, flush, render, type } from '../ui/test-utils'
import { ProjectHeader } from './ProjectHeader'
import { ShareDialog } from './ShareDialog'

let links: PublicLink[] = []
let calls: string[] = []
let project: Project
let myRole = 'owner'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  links = []
  calls = []
  myRole = 'owner'
  project = (await db.projects.get(await createProject({ name: 'Groceries' })))!
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = new URL(url, 'http://x').pathname
    calls.push(`${method} ${path}`)
    if (path.endsWith('/public-links') && method === 'GET') return new Response(JSON.stringify({ links }), { status: 200 })
    if (path.endsWith('/public-links') && method === 'POST') {
      const body = JSON.parse(String(init!.body))
      const l: PublicLink = { id: `l${links.length + 1}`, projectId: project.id, rights: body.rights, name: body.name ?? null, createdBy: 'u1', createdAt: 1, expiresAt: null, lastUsedAt: null }
      links = [...links, l]
      return new Response(JSON.stringify({ ...l, link: 'https://todo.example.com/public/otl_secret' }), { status: 201 })
    }
    if (path.includes('/public-links/') && method === 'DELETE') {
      links = links.filter((l) => !path.endsWith(l.id))
      return new Response(null, { status: 204 })
    }
    if (path.endsWith('/members')) return new Response(JSON.stringify({ projectId: project.id, role: myRole, ownerId: 'u1', members: [] }), { status: 200 })
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const button = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

describe('public links in the share dialog', () => {
  it('creates a tick link, shows it once with Copy, lists it and revokes it after confirming', async () => {
    const r = await render(<ShareDialog project={project} userId="u1" cached={undefined} onClose={() => {}} />)
    await waitFor(() => document.querySelector('[data-testid="public-links"]') !== null)
    const section = document.querySelector('[data-testid="public-links"]')!
    await type(section.querySelector<HTMLInputElement>('input')!, 'Group chat')
    const rights = section.querySelectorAll('select')[0] as HTMLSelectElement
    rights.value = 'tick'
    rights.dispatchEvent(new Event('change', { bubbles: true }))
    await click(button(section, 'Create public link')!)
    await waitFor(() => document.querySelector('[data-testid="public-link-created"]') !== null)
    expect(document.body.textContent).toContain('otl_secret')
    expect(document.body.textContent).toContain('shown only once')
    await waitFor(() => document.querySelector('[data-public-link="l1"]') !== null)
    expect(document.querySelector('[data-public-link="l1"]')!.textContent).toContain('Anyone with this link can tick items')
    await click(document.querySelector('[data-public-link="l1"] button')!)
    await waitFor(() => !!button(document, 'Revoke') && document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > 1)
    expect(calls).not.toContain(`DELETE /api/v1/projects/${project.id}/public-links/l1`)
    const confirm = [...document.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button')].filter((b) => b.textContent === 'Revoke').pop()!
    await click(confirm)
    await waitFor(() => document.querySelector('[data-public-link="l1"]') === null)
    expect(calls).toContain(`DELETE /api/v1/projects/${project.id}/public-links/l1`)
    await r.unmount()
  })

  it('shows no section to a viewer or editor, and disables it offline', async () => {
    myRole = 'editor'
    let r = await render(<ShareDialog project={project} userId="u1" cached={{ projectId: project.id, role: 'editor', ownerId: 'u2', members: [] }} onClose={() => {}} />)
    await flush(50)
    expect(document.querySelector('[data-testid="public-links"]')).toBeNull()
    await r.unmount()
    document.body.innerHTML = ''
    myRole = 'owner'
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    r = await render(<ShareDialog project={project} userId="u1" cached={undefined} onClose={() => {}} />)
    await waitFor(() => document.querySelector('[data-testid="public-links"]') !== null)
    expect(document.querySelector('[data-testid="public-links"]')!.textContent).toContain('needs a connection')
    expect(button(document.querySelector('[data-testid="public-links"]')!, 'Create public link')!.hasAttribute('disabled')).toBe(true)
    await r.unmount()
  })
})

describe('the Public badge', () => {
  it('appears with an active link, follows a revocation, and is absent offline', async () => {
    links = [{ id: 'l1', projectId: project.id, rights: 'view', name: null, createdBy: 'u1', createdAt: 1, expiresAt: null, lastUsedAt: null }]
    const r = await render(<ProjectHeader project={project} userId="u1" />)
    await waitFor(() => r.container.querySelector('[data-public-badge]') !== null)
    await click(r.container.querySelector('[data-public-badge]')!)
    await waitFor(() => document.querySelector('[data-public-link="l1"]') !== null)
    await click(document.querySelector('[data-public-link="l1"] button')!)
    await waitFor(() => document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > 1)
    await click([...document.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button')].filter((b) => b.textContent === 'Revoke').pop()!)
    await waitFor(() => r.container.querySelector('[data-public-badge]') === null)
    await r.unmount()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    links = [{ id: 'l2', projectId: project.id, rights: 'view', name: null, createdBy: 'u1', createdAt: 1, expiresAt: null, lastUsedAt: null }]
    const off = await render(<ProjectHeader project={project} userId="u1" />)
    await flush(80)
    expect(off.container.querySelector('[data-public-badge]')).toBeNull()
    await off.unmount()
  })
})
