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

  it.each(['list', 'board'] as const)('shows only configured icons with the project tints in a saved %s', async (layout) => {
    const garden = await createProject({ name: 'Garden', color: '#22c55e', icon: 'briefcase' })
    const studio = await createProject({ name: 'Studio', color: '#3b82f6' })
    const travel = await createProject({ name: 'Travel', color: '#3b82f6', icon: 'unknown-project-icon' })
    await createTask({ title: 'Plant tulips', priority: 1, project_id: garden })
    await createTask({ title: 'Send the draft', priority: 1, project_id: studio })
    await createTask({ title: 'Book the tickets', priority: 1, project_id: travel })
    await createTask({ title: 'Call the bank', priority: 1 })
    const id = await createView({ name: 'Urgent', query: 'p1', group_by: 'project', layout })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => document.querySelectorAll('[data-group-header]').length === 4, 'four group headers')
    const headers = [...document.querySelectorAll<HTMLElement>('[data-group-header]')]
    const byTitle = (s: string) => headers.find((h) => h.textContent?.includes(s))!
    expect(byTitle('Garden').getAttribute('data-hue')).toBe('green')
    expect(byTitle('Garden').className).toContain('ui-group-tint')
    const projectIcon = '[data-icon="briefcase"]'
    await waitFor(() => !!byTitle('Garden').querySelector(projectIcon), 'configured project icon')
    expect(byTitle('Garden').querySelector(projectIcon)?.getAttribute('aria-hidden')).toBe('true')
    for (const title of ['Studio', 'Travel', 'Inbox']) {
      const label = byTitle(title).querySelector('[data-group-label]')!
      expect(label.previousElementSibling?.getAttribute('data-icon') ?? null).toBe(layout === 'list' ? 'chevron-right' : null)
      expect(byTitle(title).querySelector('.rounded-full')).toBeNull()
    }
    expect(byTitle('Inbox').hasAttribute('data-hue')).toBe(false)
    await flush()
    await r.unmount()
  })
})
