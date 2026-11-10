// @vitest-environment happy-dom
// The scope of a calendar sync connection or a CalDAV app password (OpenSpec
// change sync-scope, design D7): All, Only these or All except these, and the
// workspaces, Inboxes and projects of every workspace, archived projects left out.
import 'fake-indexeddb/auto'
import { act, useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import type { Project, SyncScope, Workspace } from '../lib/types'
import { click, key, render, type, waitFor } from '../ui/test-utils'
import { allScope, scopeSummary, SyncScopeField } from './SyncScopeField'

const ws = (id: string, name: string, isDefault: boolean): Workspace => ({ id, name, icon: '', color: '', default: isDefault, role: 'owner', ownerId: 'u1' })
const project = (id: string, name: string, over: Partial<Project> = {}): Project =>
  ({ id, name, color: '#16a34a', position: 1, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...over } as Project)

let n = 0
beforeEach(async () => {
  useDatabase(`scope-${Date.now()}-${n++}`)
  document.body.innerHTML = ''
  await db.workspaces.bulkPut([ws('home', 'Personal', true), ws('work', 'Work', false)])
  await db.projects.bulkPut([project('garden', 'Garden'), project('site', 'Website', { workspace_id: 'work' } as Partial<Project>),
    project('old', 'Old', { archived: true })])
})

let last: SyncScope = allScope()
function Harness() {
  const [scope, setScope] = useState<SyncScope>(allScope())
  return <SyncScopeField label="Tasks from" value={scope} onChange={(s) => { last = s; setScope(s) }} />
}

describe('SyncScopeField', () => {
  it('chooses workspaces, Inboxes and projects of every workspace', async () => {
    const view = await render(<Harness />)
    expect(document.querySelector('input[role="combobox"]')).toBeNull()
    await click([...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent === 'Only these')!)
    await waitFor(() => document.querySelector('input[role="combobox"]') !== null, 'the picker')
    const field = document.querySelector<HTMLInputElement>('input[role="combobox"]')!
    await act(async () => { field.focus() })
    await waitFor(() => [...document.querySelectorAll('[role="option"]')].some((o) => o.textContent?.includes('Website')), 'the options')
    const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim() ?? '')
    for (const want of ['Personal', 'Inbox', 'Garden', 'Work', 'Work · Inbox', 'Website']) expect(options.some((o) => o.includes(want))).toBe(true)
    expect(options.join('|')).not.toContain('Old')
    await type(field, 'webs')
    await key(field, 'Enter')
    await waitFor(() => last.projects.includes('site'), 'Website chosen')
    expect(last).toEqual({ mode: 'only', workspaces: [], projects: ['site'], inboxes: [] })
    await view.unmount()
  })

  it('names the chosen places', () => {
    const places = [{ key: 'projects:site', kind: 'projects' as const, id: 'site', name: 'Website', color: '', group: 'Work', path: [] },
      { key: 'inboxes:home', kind: 'inboxes' as const, id: 'home', name: 'Inbox', color: '', group: 'Personal', path: [] }]
    expect(scopeSummary(undefined, places)).toBe('')
    expect(scopeSummary({ mode: 'only', workspaces: [], projects: ['site'], inboxes: ['home'] }, places)).toBe('Website, Inbox')
    expect(scopeSummary({ mode: 'except', workspaces: [], projects: ['site'], inboxes: [] }, places)).toBe('All except Website')
  })
})
