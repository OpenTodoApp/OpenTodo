// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../../lib/db'
import { createLabel } from '../../lib/labels'
import { createProject, createTask, resetDeviceId, setTaskCompleted, updateTask } from '../../lib/ops'
import { click, flush, render } from '../../ui/test-utils'
import { NextView, WaitingView } from './MethodListView'

let n = 0
beforeEach(() => {
  useDatabase(`method-views-${Date.now()}-${n++}`)
  resetDeviceId()
  window.history.replaceState(null, '', '/next')
})
afterEach(() => { document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const groups = (root: ParentNode) => [...root.querySelectorAll('[data-group]')].map((g) => ({
  heading: g.querySelector('h2')?.textContent,
  titles: [...g.querySelectorAll('[data-task-id]')].map((r) => r.getAttribute('data-task-id')),
}))

describe('Next view (method-views)', () => {
  it('Complete and continue: the next step of the project takes the place of the completed one', async () => {
    const garage = await createProject({ name: 'Garage' })
    const wall = await createTask({ title: 'Measure wall', project_id: garage })
    const brackets = await createTask({ title: 'Buy brackets', project_id: garage })
    await updateTask(brackets, { blocked_by: [wall] })
    const r = await render(<NextView />)
    await waitFor(() => groups(r.container).length === 1)
    expect(groups(r.container)).toEqual([{ heading: 'Anywhere', titles: [wall] }])
    await setTaskCompleted(wall, true)
    await waitFor(() => groups(r.container)[0]?.titles[0] === brackets)
    await r.unmount()
  })

  it('Two contexts: a next action is listed under both, Anywhere last', async () => {
    const calls = await createLabel({ name: '@calls' })
    const errands = await createLabel({ name: '@errands' })
    const urgent = await createLabel({ name: 'urgent' })
    const home = await createProject({ name: 'Home' })
    const work = await createProject({ name: 'Work' })
    const plumber = await createTask({ title: 'Call the plumber', project_id: home, labels: [calls, errands, urgent] })
    const report = await createTask({ title: 'Write the report', project_id: work })
    const r = await render(<NextView />)
    await waitFor(() => groups(r.container).length === 3)
    expect(groups(r.container)).toEqual([
      { heading: '@calls', titles: [plumber] }, { heading: '@errands', titles: [plumber] }, { heading: 'Anywhere', titles: [report] },
    ])
    await r.unmount()
  })

  it('Empty: names the action and offers the project walk', async () => {
    await createProject({ name: 'Garden' })
    const r = await render(<NextView />)
    await waitFor(() => r.container.textContent?.includes('Add a next step to a project') ?? false)
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Walk your projects')!)
    expect(window.location.pathname).toBe('/review/projects')
    await r.unmount()
  })
})

describe('Waiting view (method-views)', () => {
  it('Delegated: a task assigned to Ana is under her; a blocked task names its blocker; Blocker done', async () => {
    const home = await createProject({ name: 'Household' })
    const tap = await createTask({ title: 'Fix the tap', project_id: home })
    await updateTask(tap, { assignee_id: 'ana' })
    const parts = await createTask({ title: 'Order the parts', project_id: home })
    const fit = await createTask({ title: 'Fit the shelf', project_id: home })
    await updateTask(fit, { blocked_by: [parts] })
    const r = await render(<WaitingView />)
    await waitFor(() => groups(r.container).length === 2)
    expect(groups(r.container)).toEqual([{ heading: 'Someone else', titles: [tap] }, { heading: 'Blocked by another task', titles: [fit] }])
    expect(r.container.textContent).toContain('Waits for Order the parts')
    await setTaskCompleted(parts, true)
    await waitFor(() => groups(r.container).length === 1)
    await r.unmount()
  })
})
