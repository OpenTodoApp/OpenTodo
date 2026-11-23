// @vitest-environment happy-dom
// Today grouped by Project loads its contextual move actions as their own chunk. A row menu
// opened before that chunk lands gets the actions when it does, without being opened again.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { setTodayLimit } from '../lib/closedListPrefs'
import { setListDisplay } from '../lib/listDisplay'
import { mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

// The chunk is held back until the test lets it go, as on a slow first load.
const chunk = vi.hoisted(() => {
  let release = () => {}
  const landed = new Promise<void>((resolve) => { release = resolve })
  return { landed, release: () => release() }
})
vi.mock('./task-list/todayGroupDrop', async (original) => {
  await chunk.landed
  return original()
})

const TODAY = '2026-10-30'
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0))
  useDatabase(`today-context-lazy-${Date.now()}`)
  resetDeviceId()
  mockFetch(noPublicLinks)
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

const row = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((r) => r.querySelector('[data-row-title]')?.textContent?.trim() === title)

it('a row menu opened before the move actions load shows them once they land', async () => {
  const project = await createProject({ name: 'Work' })
  const parent = await createTask({ title: 'Parent', due: { date: TODAY }, project_id: project })
  vi.setSystemTime(new Date(Date.now() + 1))
  await createTask({ title: 'Unschedulable until promoted', parent_id: parent, project_id: project })
  await setTodayLimit(1)
  await setListDisplay({ kind: 'today' }, { subtasks: true, groupBy: 'project' })
  mounted.push(await render(<TaskListView route={{ view: 'today' }} />))
  await waitFor(() => !!row('Unschedulable until promoted'))
  await act(async () => {
    row('Unschedulable until promoted')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
  })
  const promote = () => document.querySelector('[data-action="today-promote-context"]')
  await waitFor(() => !!document.querySelector('[role="menu"]'), 'the row menu')
  expect(promote()).toBeNull()
  chunk.release()
  await waitFor(() => !!promote(), 'the promote action, once the chunk lands')
  expect(document.querySelector('[data-action="today-reparent-context"]')).not.toBeNull()
})
