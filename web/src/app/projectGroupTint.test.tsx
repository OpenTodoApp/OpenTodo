// @vitest-environment happy-dom
// Group by: Project tints each project's header with its colour (OpenSpec change
// project-group-tint, GitHub issue 1210); the Inbox's header stays neutral.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createView } from '../lib/views'
import { flush, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { SavedViewRoute } from './SavedViewView'
import { projectHue } from './projectHue'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

describe('project group tint', () => {
  it('reads a project colour as its hue, none without a project', () => {
    expect(projectHue({ color: '#22c55e' } as never)).toBe('green')
    expect(projectHue(undefined)).toBeUndefined()
  })

  it('tints the project headers of a saved view grouped by project, not the Inbox', async () => {
    const garden = await createProject({ name: 'Garden', color: '#22c55e' })
    await createTask({ title: 'Plant tulips', priority: 1, project_id: garden })
    await createTask({ title: 'Call the bank', priority: 1 })
    const id = await createView({ name: 'Urgent', query: 'p1', group_by: 'project' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => document.querySelectorAll('[data-group-header]').length === 2, 'two group headers')
    const headers = [...document.querySelectorAll<HTMLElement>('[data-group-header]')]
    const byTitle = (s: string) => headers.find((h) => h.textContent?.includes(s))!
    expect(byTitle('Garden').getAttribute('data-hue')).toBe('green')
    expect(byTitle('Garden').className).toContain('ui-group-tint')
    expect(byTitle('Inbox').hasAttribute('data-hue')).toBe(false)
    await flush()
    await r.unmount()
  })
})
