// @vitest-environment happy-dom
// The share dialog's "AI assistants" row (OpenSpec change agent-planning-fields,
// "The switch in the app"): the owner switches it on after a confirmation; a
// member sees the state without a switch; an inherited state names the parent.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta, useDatabase } from '../lib/db'
import { AGENT_EXCLUSIONS_KEY } from '../lib/agentAccess'
import { click, mockFetch, render, waitFor } from '../ui/test-utils'
import { AgentAccessRow } from './AgentAccessRow'

let n = 0
beforeEach(() => { useDatabase(`agent-access-${Date.now()}-${n++}`) })
afterEach(() => { vi.unstubAllGlobals() })

const row = () => document.querySelector<HTMLElement>('[data-testid="agent-access"]')
const confirmDialog = () => document.querySelector<HTMLElement>('[data-testid="confirm-dialog"]')
const button = (root: ParentNode, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)

describe('AgentAccessRow', () => {
  it('lets the owner keep the project away after confirming', async () => {
    let kept = false
    const puts: unknown[] = []
    mockFetch((method, path, init) => {
      if (path.endsWith('/agent-access') && method === 'PUT') { puts.push(JSON.parse(String(init?.body))); kept = true }
      if (path.endsWith('/agent-access')) return { kept_away: kept, inherited_from: null }
      if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {}, agent_excluded_projects: kept ? ['p1'] : [] }
      return undefined
    })
    const r = await render(<AgentAccessRow projectId="p1" projectName="Client X" canChange />)
    await waitFor(() => row()?.textContent?.includes('Allowed') ?? false, 'the state')
    await click(row()!.querySelector<HTMLButtonElement>('[role="switch"]')!)
    expect(confirmDialog()?.textContent).toContain('Client X')
    await click(button(confirmDialog()!, 'Keep away')!)
    await waitFor(() => row()?.textContent?.includes('Kept away') ?? false, 'the new state')
    expect(puts).toEqual([{ kept_away: true }])
    expect((await db.meta.get(AGENT_EXCLUSIONS_KEY))?.value).toEqual(['p1'])
    await r.unmount()
  })

  it('shows a member the cached state, inherited, without a switch', async () => {
    await setMeta(AGENT_EXCLUSIONS_KEY, ['child'])
    await db.projects.put({ id: 'parent', name: 'Client X' } as never)
    mockFetch((_m, path) => (path.endsWith('/agent-access') ? { kept_away: true, inherited_from: 'parent' } : undefined))
    const r = await render(<AgentAccessRow projectId="child" projectName="Invoices" canChange={false} />)
    await waitFor(() => row()?.textContent?.includes('through Client X') ?? false, 'the inherited state')
    expect(row()!.querySelector('[role="switch"]')).toBeNull()
    await r.unmount()
  })
})
